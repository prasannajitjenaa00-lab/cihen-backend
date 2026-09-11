const Lead = require('../models/Lead');
const User = require('../models/User');
const Note = require('../models/Note');
const Call = require('../models/Call');
const FollowUp = require('../models/FollowUp');
const Timeline = require('../models/Timeline');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { createProcessedLead } = require('../services/leadService');

// @desc    Get all leads with search, filters, pagination, and sorting
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    let query = {};
    const andConditions = [];

    // 1. Role-based restrictions:
    // Counsellors and Admissions Officers can only see assigned leads
    if (req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') {
      andConditions.push({ assignedCounsellor: req.user.id });
    } else if (req.user.role === 'Senior Zonal Manager') {
      // Senior Zonal Managers strictly see only leads assigned to them OR created by them
      andConditions.push({
        $or: [
          { assignedCounsellor: req.user.id },
          { createdBy: req.user.id }
        ]
      });
    } else if (req.user.role === 'Admissions Manager') {
      // Admissions Manager has supervisory admissions visibility:
      // Leads assigned to admissions/counselling staff OR leads in admissions pipeline stages
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id);
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      andConditions.push({
        $or: [
          { assignedCounsellor: { $in: admissionsStaffIds } },
          { status: { $in: ADMISSIONS_STATUSES } }
        ]
      });
    }

    // 2. Search (Student Name, Parent Name, Phone, Email, Lead ID)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      andConditions.push({
        $or: [
          { studentName: searchRegex },
          { parentName: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
          { leadId: searchRegex }
        ]
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // 3. Filters
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.leadSource) {
      query.leadSource = req.query.leadSource;
    }
    if (req.query.priority) {
      query.priority = req.query.priority;
    }
    // Only apply assignedCounsellor query filter for admin-level roles
    const restrictedRoles = ['Counsellor', 'Admissions Officer', 'Senior Zonal Manager', 'Admissions Manager'];
    if (req.query.assignedCounsellor && !restrictedRoles.includes(req.user.role)) {
      query.assignedCounsellor = req.query.assignedCounsellor;
    }
    if (req.query.campaign) {
      query.campaign = new RegExp(req.query.campaign, 'i');
    }
    if (req.query.classInterested) {
      query.classInterested = req.query.classInterested;
    }
    if (req.query.duplicateStatus) {
      query.duplicateStatus = req.query.duplicateStatus;
    }

    // Date filters (createdAt range)
    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // 4. Execution logic: handling export vs pagination
    const isExport = req.query.export === 'true';

    // Sorting
    let sortBy = '-createdAt';
    if (req.query.sort) {
      sortBy = req.query.sort;
    }

    if (isExport) {
      const leads = await Lead.find(query)
        .sort(sortBy)
        .populate('assignedCounsellor', 'name email role designation')
        .populate('createdBy', 'name email role designation');
      return res.status(200).json({ success: true, count: leads.length, data: leads });
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const total = await Lead.countDocuments(query);

    const leads = await Lead.find(query)
      .sort(sortBy)
      .skip(startIndex)
      .limit(limit)
      .populate('assignedCounsellor', 'name email role designation')
      .populate('createdBy', 'name email role designation');

    res.status(200).json({
      success: true,
      count: leads.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        total
      },
      data: leads
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get a single lead details (with full activities timeline)
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedCounsellor', 'name email role designation')
      .populate('createdBy', 'name email role designation')
      .populate('duplicateOf', 'leadId studentName parentName status');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Role-based authorization
    const counsellorId = lead.assignedCounsellor?._id?.toString() || lead.assignedCounsellor?.toString();
    const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();

    // Counsellors and Admissions Officers: only their assigned leads
    if ((req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') && counsellorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this lead' });
    }

    if (req.user.role === 'Senior Zonal Manager') {
      const isAssigned = counsellorId === req.user.id;
      const isCreator = createdById === req.user.id;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this lead' });
      }
    }

    // Admissions Manager: supervisory admissions scope
    if (req.user.role === 'Admissions Manager') {
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id.toString());
      const isAssignedToAdmissionsStaff = admissionsStaffIds.includes(counsellorId);
      const isAdmissionsStatus = ADMISSIONS_STATUSES.includes(lead.status);
      if (!isAssignedToAdmissionsStaff && !isAdmissionsStatus) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this lead' });
      }
    }

    // Fetch related records in parallel
    const [notes, calls, followUps, timeline] = await Promise.all([
      Note.find({ lead: lead._id }).populate('createdBy', 'name role').sort({ createdAt: -1 }),
      Call.find({ lead: lead._id }).populate('counsellor', 'name').sort({ createdAt: -1 }),
      FollowUp.find({ lead: lead._id }).populate('counsellor', 'name').sort({ date: -1, time: -1 }),
      Timeline.find({ lead: lead._id }).populate('user', 'name role').sort({ createdAt: -1 })
    ]);

    res.status(200).json({
      success: true,
      data: {
        lead,
        notes,
        calls,
        followUps,
        timeline
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create a lead manually
// @route   POST /api/leads
// @access  Private
exports.createLead = async (req, res) => {
  try {
    // Force lead source to Manual if not specified, and set platform
    const leadData = {
      ...req.body,
      leadSource: req.body.leadSource || 'Manual',
      platform: req.body.platform || 'manual'
    };

    // Automatically set createdBy on server; strip client-provided createdBy
    delete leadData.createdBy;

    // Field staff cannot assign leads during creation
    const noAssignRoles = ['Senior Zonal Manager', 'Counsellor', 'Admissions Officer', 'Admissions Manager'];
    if (noAssignRoles.includes(req.user.role)) {
      delete leadData.assignedCounsellor;
      delete leadData.targetStaffId;
      delete leadData.counsellorId;
    }

    const lead = await createProcessedLead(leadData, req.user);

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: lead
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Update lead information
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    let lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Role-based authorization
    const counsellorId = lead.assignedCounsellor?._id?.toString() || lead.assignedCounsellor?.toString();
    const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();

    // Counsellors and Admissions Officers: only their assigned leads
    if ((req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') && counsellorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this lead' });
    }

    if (req.user.role === 'Senior Zonal Manager') {
      const isAssigned = counsellorId === req.user.id;
      const isCreator = createdById === req.user.id;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ success: false, message: 'Not authorized to edit this lead' });
      }
    }

    // Strip assignment/ownership fields for all field-staff roles
    const fieldStaffRoles = ['Counsellor', 'Admissions Officer', 'Senior Zonal Manager', 'Admissions Manager'];
    if (fieldStaffRoles.includes(req.user.role)) {
      delete req.body.createdBy;
      delete req.body.assignedCounsellor;
      delete req.body.targetStaffId;
      delete req.body.counsellorId;
    }

    // Admissions Manager: supervisory admissions scope guard
    if (req.user.role === 'Admissions Manager') {
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id.toString());
      const isAssignedToAdmissionsStaff = admissionsStaffIds.includes(counsellorId);
      const isAdmissionsStatus = ADMISSIONS_STATUSES.includes(lead.status);
      if (!isAssignedToAdmissionsStaff && !isAdmissionsStatus) {
        return res.status(403).json({ success: false, message: 'Not authorized to edit this lead' });
      }
    }

    // Track status change for timeline
    const oldStatus = lead.status;
    const newStatus = req.body.status;

    // Update fields
    lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (newStatus && oldStatus !== newStatus) {
      await Timeline.create({
        lead: lead._id,
        eventType: 'StatusChange',
        message: `Status updated from "${oldStatus}" to "${newStatus}"`,
        user: req.user.id
      });

      // Audit status change
      await AuditLog.create({
        user: req.user.id,
        action: 'Status Changed',
        entity: 'Lead',
        entityId: lead._id.toString(),
        details: `Status changed from "${oldStatus}" to "${newStatus}"`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully',
      data: lead
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete a lead
// @route   DELETE /api/leads/:id
// @access  Private/Super Admin
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    await Lead.findByIdAndDelete(req.params.id);

    // Delete related records
    await Promise.all([
      Note.deleteMany({ lead: req.params.id }),
      Call.deleteMany({ lead: req.params.id }),
      FollowUp.deleteMany({ lead: req.params.id }),
      Timeline.deleteMany({ lead: req.params.id })
    ]);

    await AuditLog.create({
      user: req.user.id,
      action: 'Lead Deleted',
      entity: 'Lead',
      entityId: req.params.id,
      details: `Lead ${lead.leadId} (${lead.studentName}) deleted along with related files`
    });

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Assign or reassign a lead to a staff member (Senior Zonal Manager, Counsellor, Admissions Officer, etc.)
// @route   POST /api/leads/:id/assign
// @access  Private/Super Admin, Admin, CGO
exports.assignLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const staffId = req.body.targetStaffId || req.body.counsellorId;
    if (!staffId) {
      return res.status(400).json({ success: false, message: 'Please specify targetStaffId or counsellorId' });
    }

    const targetStaff = await User.findById(staffId);
    if (!targetStaff || !targetStaff.isActive || targetStaff.status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Invalid or inactive staff member' });
    }

    const permittedRoles = ['Counsellor', 'Admission Staff', 'Senior Zonal Manager', 'Admissions Officer', 'Admin'];
    const isPermitted = permittedRoles.includes(targetStaff.role) ||
      /counsellor|zonal|admission|manager|officer|advisor/i.test(targetStaff.designation || '') ||
      /counsellor|zonal|admission|manager|officer|advisor/i.test(targetStaff.role || '');

    if (!isPermitted || targetStaff.role === 'SUPER_USER') {
      return res.status(400).json({ success: false, message: 'Leads cannot be assigned to this staff role' });
    }

    const oldStaff = lead.assignedCounsellor
      ? await User.findById(lead.assignedCounsellor)
      : null;

    lead.assignedCounsellor = targetStaff._id;
    await lead.save();

    const staffLabel = `${targetStaff.name}${targetStaff.designation ? ` (${targetStaff.designation})` : ` (${targetStaff.role})`}`;
    const oldStaffLabel = oldStaff ? `${oldStaff.name}${oldStaff.designation ? ` (${oldStaff.designation})` : ` (${oldStaff.role})`}` : null;

    const assignmentMsg = oldStaff
      ? `Lead re-assigned from ${oldStaffLabel} to ${staffLabel} by ${req.user.name}`
      : `Lead assigned to ${staffLabel} by ${req.user.name}`;

    await Timeline.create({
      lead: lead._id,
      eventType: 'Assigned',
      message: assignmentMsg,
      user: req.user.id
    });

    await Notification.create({
      user: targetStaff._id,
      type: 'LEAD_ASSIGNED',
      message: `Lead ${lead.leadId} (${lead.studentName}) has been allocated to you`,
      lead: lead._id
    });

    await AuditLog.create({
      user: req.user.id,
      action: 'Lead Assigned',
      entity: 'Lead',
      entityId: lead._id.toString(),
      details: assignmentMsg
    });

    res.status(200).json({
      success: true,
      message: 'Lead assigned successfully',
      data: lead
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Bulk allocate leads to a staff member (Senior Zonal Manager, Counsellor, Admissions Officer, etc.)
// @route   POST /api/leads/bulk-assign
// @access  Private/Super Admin, Admin, CGO
exports.bulkAssignLeads = async (req, res) => {
  try {
    const { leadIds, targetStaffId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of lead IDs to allocate' });
    }

    if (!targetStaffId) {
      return res.status(400).json({ success: false, message: 'Please specify targetStaffId' });
    }

    const targetStaff = await User.findById(targetStaffId);
    if (!targetStaff || !targetStaff.isActive || targetStaff.status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Invalid or inactive target staff member' });
    }

    const permittedRoles = ['Counsellor', 'Admission Staff', 'Senior Zonal Manager', 'Admissions Officer', 'Admin'];
    const isPermitted = permittedRoles.includes(targetStaff.role) ||
      /counsellor|zonal|admission|manager|officer|advisor/i.test(targetStaff.designation || '') ||
      /counsellor|zonal|admission|manager|officer|advisor/i.test(targetStaff.role || '');

    if (!isPermitted || targetStaff.role === 'SUPER_USER') {
      return res.status(400).json({ success: false, message: 'Leads cannot be allocated to this staff role' });
    }

    const leads = await Lead.find({ _id: { $in: leadIds } });
    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching leads found to allocate' });
    }

    const staffDisplayName = `${targetStaff.name}${targetStaff.designation ? ` (${targetStaff.designation})` : ` (${targetStaff.role})`}`;

    // Update leads
    await Lead.updateMany(
      { _id: { $in: leadIds } },
      { $set: { assignedCounsellor: targetStaff._id } }
    );

    // Create Timeline events for updated leads
    const timelineDocs = leads.map(l => ({
      lead: l._id,
      eventType: 'Assigned',
      message: `Lead bulk-allocated to ${staffDisplayName} by ${req.user.name} (${req.user.role})`,
      user: req.user.id
    }));
    await Timeline.insertMany(timelineDocs);

    // Send single notification to target staff
    await Notification.create({
      user: targetStaff._id,
      type: 'LEAD_ASSIGNED',
      message: `${leads.length} leads have been allocated to you by ${req.user.name} (${req.user.role})`
    });

    // Create Audit Log
    await AuditLog.create({
      user: req.user.id,
      action: 'Bulk Leads Allocated',
      entity: 'Lead',
      entityId: leadIds[0].toString(),
      details: `${leads.length} leads bulk-allocated to ${staffDisplayName}`
    });

    res.status(200).json({
      success: true,
      count: leads.length,
      message: `Successfully allocated ${leads.length} leads to ${staffDisplayName}`,
      data: {
        allocatedCount: leads.length,
        targetStaff: {
          id: targetStaff._id,
          name: targetStaff.name,
          role: targetStaff.role,
          designation: targetStaff.designation
        }
      }
    });
  } catch (error) {
    console.error('Bulk allocate error:', error);
    res.status(500).json({ success: false, message: 'Server error during bulk lead allocation' });
  }
};

// @desc    Add a note to a lead
// @route   POST /api/leads/:id/notes
// @access  Private
exports.addNote = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Role-based authorization
    const counsellorId = lead.assignedCounsellor?._id?.toString() || lead.assignedCounsellor?.toString();
    const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();

    if ((req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') && counsellorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to add notes to this lead' });
    }
    if (req.user.role === 'Senior Zonal Manager' && counsellorId !== req.user.id && createdById !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to add notes to this lead' });
    }
    if (req.user.role === 'Admissions Manager') {
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id.toString());
      if (!admissionsStaffIds.includes(counsellorId) && !ADMISSIONS_STATUSES.includes(lead.status)) {
        return res.status(403).json({ success: false, message: 'Not authorized to add notes to this lead' });
      }
    }

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Please enter note text' });
    }

    const note = await Note.create({
      lead: lead._id,
      text,
      createdBy: req.user.id
    });

    await Timeline.create({
      lead: lead._id,
      eventType: 'NoteAdded',
      message: `Note added: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`,
      user: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Note added successfully',
      data: note
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Schedule a follow-up for a lead
// @route   POST /api/leads/:id/followups
// @access  Private
exports.scheduleFollowUp = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Role-based authorization
    const counsellorId = lead.assignedCounsellor?._id?.toString() || lead.assignedCounsellor?.toString();
    const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();

    if ((req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') && counsellorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to schedule follow-up for this lead' });
    }
    if (req.user.role === 'Senior Zonal Manager' && counsellorId !== req.user.id && createdById !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to schedule follow-up for this lead' });
    }
    if (req.user.role === 'Admissions Manager') {
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id.toString());
      if (!admissionsStaffIds.includes(counsellorId) && !ADMISSIONS_STATUSES.includes(lead.status)) {
        return res.status(403).json({ success: false, message: 'Not authorized to schedule follow-up for this lead' });
      }
    }

    const { date, time, type, notes } = req.body;
    if (!date || !time || !type) {
      return res.status(400).json({ success: false, message: 'Date, time, and type are required' });
    }

    const followUp = await FollowUp.create({
      lead: lead._id,
      counsellor: req.user.id,
      date: new Date(date),
      time,
      type,
      notes
    });

    // Update lead follow-up date & status
    lead.nextFollowUp = new Date(date);
    lead.status = 'Follow-up';
    await lead.save();

    await Timeline.create({
      lead: lead._id,
      eventType: 'FollowUpCreated',
      message: `Follow-up (${type}) scheduled for ${date} at ${time}`,
      user: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Follow-up scheduled successfully',
      data: followUp
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Log a call outcome
// @route   POST /api/leads/:id/calls
// @access  Private
exports.logCall = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Role-based authorization
    const counsellorId = lead.assignedCounsellor?._id?.toString() || lead.assignedCounsellor?.toString();
    const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();

    if ((req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') && counsellorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to log calls for this lead' });
    }
    if (req.user.role === 'Senior Zonal Manager' && counsellorId !== req.user.id && createdById !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to log calls for this lead' });
    }
    if (req.user.role === 'Admissions Manager') {
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id.toString());
      if (!admissionsStaffIds.includes(counsellorId) && !ADMISSIONS_STATUSES.includes(lead.status)) {
        return res.status(403).json({ success: false, message: 'Not authorized to log calls for this lead' });
      }
    }

    const { outcome, notes, callTime } = req.body;
    if (!outcome) {
      return res.status(400).json({ success: false, message: 'Call outcome is required' });
    }

    const call = await Call.create({
      lead: lead._id,
      counsellor: req.user.id,
      callDate: new Date(),
      callTime: callTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outcome,
      notes
    });

    // Update Lead contact metadata
    lead.lastContactDate = new Date();
    lead.status = 'Contacted';
    await lead.save();

    await Timeline.create({
      lead: lead._id,
      eventType: 'CallLogged',
      message: `Call logged: ${outcome}. Notes: ${notes || 'None'}`,
      user: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Call logged successfully',
      data: call
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Resolve a possible duplicate (merge or ignore)
// @route   POST /api/leads/:id/resolve-duplicate
// @access  Private/Admin, Super Admin
exports.resolveDuplicate = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const { resolution } = req.body; // 'merge' or 'ignore'

    if (!resolution || !['merge', 'ignore'].includes(resolution)) {
      return res.status(400).json({ success: false, message: 'Resolution must be either "merge" or "ignore"' });
    }

    if (resolution === 'ignore') {
      lead.duplicateStatus = 'Resolved';
      await lead.save();

      await Timeline.create({
        lead: lead._id,
        eventType: 'DuplicateCheck',
        message: 'Duplicate flag ignored and resolved.',
        user: req.user.id
      });
    } else if (resolution === 'merge') {
      if (!lead.duplicateOf) {
        return res.status(400).json({ success: false, message: 'No target duplicate lead to merge with' });
      }

      const targetLead = await Lead.findById(lead.duplicateOf);
      if (targetLead) {
        // Merge notes
        const notesToMerge = await Note.find({ lead: lead._id });
        for (const note of notesToMerge) {
          note.lead = targetLead._id;
          await note.save();
        }

        // Merge calls
        const callsToMerge = await Call.find({ lead: lead._id });
        for (const call of callsToMerge) {
          call.lead = targetLead._id;
          await call.save();
        }

        // Merge follow-ups
        const followUpsToMerge = await FollowUp.find({ lead: lead._id });
        for (const f of followUpsToMerge) {
          f.lead = targetLead._id;
          await f.save();
        }

        // Merge timeline entries
        const timelineToMerge = await Timeline.find({ lead: lead._id });
        for (const t of timelineToMerge) {
          t.lead = targetLead._id;
          await t.save();
        }

        // Append a timeline event to target
        await Timeline.create({
          lead: targetLead._id,
          eventType: 'DuplicateCheck',
          message: `Lead ${lead.leadId} (${lead.studentName}) merged into this lead`,
          user: req.user.id
        });

        // Delete this lead
        await Lead.findByIdAndDelete(lead._id);

        await AuditLog.create({
          user: req.user.id,
          action: 'Lead Merged',
          entity: 'Lead',
          entityId: targetLead._id.toString(),
          details: `Merged lead ${lead.leadId} into ${targetLead.leadId}`
        });

        return res.status(200).json({
          success: true,
          message: 'Leads merged successfully',
          data: targetLead
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Duplicate resolution updated successfully',
      data: lead
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
