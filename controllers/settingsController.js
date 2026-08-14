const CRMSettings = require('../models/CRMSettings');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Lead = require('../models/Lead');
const crypto = require('crypto');

// @desc    Get current CRM settings
// @route   GET /api/settings
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) {
      settings = await CRMSettings.create({});
    }

    res.status(200).json({
      success: true,
      data: {
        settings
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update CRM settings
// @route   PUT /api/settings
// @access  Private/Super Admin
exports.updateSettings = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) {
      settings = new CRMSettings();
    }

    // Update fields
    const fieldsToUpdate = [
      'schoolName',
      'schoolLogo',
      'schoolAddress',
      'schoolPhone',
      'schoolEmail',
      'schoolWebsite',
      'leadStatuses',
      'leadSources',
      'leadPriorities',
      'assignmentMethod',
      'assignmentRules'
    ];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();

    await AuditLog.create({
      user: req.user.id,
      action: 'Settings Changed',
      entity: 'Settings',
      entityId: settings._id.toString(),
      details: 'Global CRM settings updated'
    });

    res.status(200).json({ success: true, message: 'Settings updated successfully', data: settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Regenerate Website API Key
// @route   POST /api/settings/regenerate-api-key
// @access  Private/Super Admin
exports.regenerateApiKey = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) {
      settings = await CRMSettings.create({});
    }

    const newKey = 'cohen_web_' + crypto.randomBytes(16).toString('hex');
    settings.websiteApiKey = newKey;
    await settings.save();

    await AuditLog.create({
      user: req.user.id,
      action: 'Settings Changed',
      entity: 'Settings',
      entityId: settings._id.toString(),
      details: 'Website Lead Ingestion API key regenerated'
    });

    res.status(200).json({ success: true, message: 'Website API key regenerated', apiKey: newKey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all active/inactive users for staff list
// @route   GET /api/settings/users
// @access  Private
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    
    // Enrich with counsellor stats
    const enrichedUsers = [];
    for (const u of users) {
      if (u.role === 'Counsellor') {
        const [assigned, admissions, followups] = await Promise.all([
          Lead.countDocuments({ assignedCounsellor: u._id }),
          Lead.countDocuments({ assignedCounsellor: u._id, status: 'Admission Confirmed' }),
          Lead.countDocuments({ assignedCounsellor: u._id, status: 'Follow-up' })
        ]);
        const convRate = assigned > 0 ? ((admissions / assigned) * 100).toFixed(1) : 0;
        enrichedUsers.push({
          ...u.toObject(),
          stats: {
            assignedLeads: assigned,
            confirmedAdmissions: admissions,
            pendingFollowups: followups,
            conversionRate: parseFloat(convRate)
          }
        });
      } else {
        enrichedUsers.push(u.toObject());
      }
    }

    res.status(200).json({ success: true, data: enrichedUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create User (Staff/Advisor)
// @route   POST /api/settings/users
// @access  Private/Super Admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = await User.create({ name, email, password, role });

    await AuditLog.create({
      user: req.user.id,
      action: 'User Created',
      entity: 'User',
      entityId: user._id.toString(),
      details: `Created new staff account: ${name} (${role})`
    });

    res.status(201).json({ success: true, message: 'User created successfully', data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update user status / toggle activation
// @route   PUT /api/settings/users/:id
// @access  Private/Super Admin
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { status, role, name } = req.body;

    if (status) user.status = status;
    if (role) user.role = role;
    if (name) user.name = name;

    await user.save();

    await AuditLog.create({
      user: req.user.id,
      action: 'User Updated',
      entity: 'User',
      entityId: user._id.toString(),
      details: `Updated details/status for ${user.name}`
    });

    res.status(200).json({ success: true, message: 'User updated successfully', data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get current user notifications
// @route   GET /api/settings/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark notifications as read
// @route   PUT /api/settings/notifications/read
// @access  Private
exports.markNotificationsRead = async (req, res) => {
  try {
    const { notificationId } = req.body;

    if (notificationId) {
      await Notification.updateOne({ _id: notificationId, user: req.user.id }, { read: true });
    } else {
      // Mark all read
      await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    }

    res.status(200).json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get audit log trail
// @route   GET /api/settings/audit-logs
// @access  Private/Super Admin
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('user', 'name role')
      .sort({ timestamp: -1 })
      .limit(100);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
