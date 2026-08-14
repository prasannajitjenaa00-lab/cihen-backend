const Lead = require('../models/Lead');
const User = require('../models/User');
const Timeline = require('../models/Timeline');
const Notification = require('../models/Notification');
const CRMSettings = require('../models/CRMSettings');
const AuditLog = require('../models/AuditLog');

// Helper to normalize phone numbers (extracts last 10 digits)
const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

// Check for duplicates
const checkDuplicate = async (phone, email, metaLeadId) => {
  // 1. Check Meta Lead ID
  if (metaLeadId) {
    const existingMetaLead = await Lead.findOne({ metaLeadId });
    if (existingMetaLead) {
      return { duplicate: true, action: 'skip', lead: existingMetaLead };
    }
  }

  // 2. Check Phone
  if (phone) {
    const normPhone = normalizePhone(phone);
    if (normPhone) {
      // Find all leads, check normalized phone in memory or using regex
      // For regex: match ends with normPhone
      const existingPhoneLead = await Lead.findOne({
        phone: new RegExp(normPhone + '$')
      });
      if (existingPhoneLead) {
        return { duplicate: true, action: 'flag', lead: existingPhoneLead };
      }
    }
  }

  // 3. Check Email
  if (email) {
    const existingEmailLead = await Lead.findOne({
      email: email.toLowerCase()
    });
    if (existingEmailLead) {
      return { duplicate: true, action: 'flag', lead: existingEmailLead };
    }
  }

  return { duplicate: false };
};

// Auto-assign lead to a counsellor
const getAssignedCounsellor = async (lead, settings) => {
  const method = settings.assignmentMethod;

  if (method === 'Manual') {
    return null;
  }

  // Class-based Assignment
  if (method === 'Class Based' && lead.classInterested) {
    const rule = settings.assignmentRules.find(
      (r) => r.ruleType === 'class' && r.triggerValue.toLowerCase() === lead.classInterested.toLowerCase()
    );
    if (rule && rule.counsellor) {
      const counsellor = await User.findById(rule.counsellor);
      if (counsellor && counsellor.status === 'Active') {
        return counsellor._id;
      }
    }
  }

  // Campaign-based Assignment
  if (method === 'Campaign Based' && lead.campaign) {
    const rule = settings.assignmentRules.find(
      (r) => r.ruleType === 'campaign' && r.triggerValue.toLowerCase() === lead.campaign.toLowerCase()
    );
    if (rule && rule.counsellor) {
      const counsellor = await User.findById(rule.counsellor);
      if (counsellor && counsellor.status === 'Active') {
        return counsellor._id;
      }
    }
  }

  // Round Robin (Fallback or Default)
  const activeCounsellors = await User.find({
    role: 'Counsellor',
    status: 'Active'
  });

  if (activeCounsellors.length === 0) {
    // If no counsellors, assign to an active Admin
    const activeAdmins = await User.find({
      role: 'Admin',
      status: 'Active'
    });
    if (activeAdmins.length === 0) return null;
    
    // Simple round robin on admins
    return pickRoundRobin(activeAdmins);
  }

  return pickRoundRobin(activeCounsellors);
};

// Pick next counsellor based on who has the oldest assignment
const pickRoundRobin = async (counsellors) => {
  let selectedCounsellor = counsellors[0];
  let oldestAssignmentDate = new Date();

  for (const counsellor of counsellors) {
    const latestLead = await Lead.findOne({ assignedCounsellor: counsellor._id }).sort({ createdAt: -1 });
    if (!latestLead) {
      // Counsellor has never been assigned a lead - assign immediately
      return counsellor._id;
    }
    if (latestLead.createdAt < oldestAssignmentDate) {
      oldestAssignmentDate = latestLead.createdAt;
      selectedCounsellor = counsellor;
    }
  }

  return selectedCounsellor._id;
};

// Create lead with duplicate check and auto assignment
const createProcessedLead = async (leadData, userTriggered = null) => {
  // Check for duplicates
  const dupCheck = await checkDuplicate(leadData.phone, leadData.email, leadData.metaLeadId);

  if (dupCheck.duplicate && dupCheck.action === 'skip') {
    console.log(`Lead with Meta Lead ID ${leadData.metaLeadId} already exists. Skipping.`);
    return dupCheck.lead;
  }

  // Get or initialize CRM settings
  let settings = await CRMSettings.findOne();
  if (!settings) {
    settings = await CRMSettings.create({});
  }

  // Create lead instance (does not save to DB yet)
  const lead = new Lead(leadData);

  // Set duplicate metadata
  if (dupCheck.duplicate && dupCheck.action === 'flag') {
    lead.duplicateStatus = 'Possible Duplicate';
    lead.duplicateOf = dupCheck.lead._id;
  }

  // Handle assignment
  const counsellorId = await getAssignedCounsellor(lead, settings);
  if (counsellorId) {
    lead.assignedCounsellor = counsellorId;
  }

  // Save the lead to trigger pre-save (leadId generation)
  await lead.save();

  // Create Timeline events
  await Timeline.create({
    lead: lead._id,
    eventType: 'Created',
    message: `Lead ingested from ${lead.leadSource} source`,
    user: userTriggered ? userTriggered._id : null
  });

  if (dupCheck.duplicate && dupCheck.action === 'flag') {
    await Timeline.create({
      lead: lead._id,
      eventType: 'DuplicateCheck',
      message: `Possible duplicate detected. Conflicting lead: ${dupCheck.lead.leadId} (${dupCheck.lead.studentName})`,
      user: userTriggered ? userTriggered._id : null
    });

    // Notify administrators of duplicate
    const admins = await User.find({ role: { $in: ['Super Admin', 'Admin'] } });
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        type: 'NEW_LEAD',
        message: `Possible duplicate lead ${lead.leadId} (${lead.studentName}) requires review`,
        lead: lead._id
      });
    }
  }

  if (counsellorId) {
    const counsellor = await User.findById(counsellorId);
    await Timeline.create({
      lead: lead._id,
      eventType: 'Assigned',
      message: `Lead automatically assigned to ${counsellor.name} via ${settings.assignmentMethod} Assignment`,
      user: userTriggered ? userTriggered._id : null
    });

    // Notify assigned counsellor
    await Notification.create({
      user: counsellorId,
      type: 'LEAD_ASSIGNED',
      message: `New lead ${lead.leadId} (${lead.studentName}) has been assigned to you`,
      lead: lead._id
    });
  } else {
    // If not assigned, notify admins
    const admins = await User.find({ role: { $in: ['Super Admin', 'Admin'] } });
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        type: 'NEW_LEAD',
        message: `New unassigned lead ${lead.leadId} (${lead.studentName}) received`,
        lead: lead._id
      });
    }
  }

  // Log audit trail
  await AuditLog.create({
    user: userTriggered ? userTriggered._id : null,
    action: 'Lead Created',
    entity: 'Lead',
    entityId: lead._id.toString(),
    details: `Ingested from ${lead.leadSource}. Assigned: ${counsellorId ? 'Yes' : 'No'}. Duplicate: ${lead.duplicateStatus}`
  });

  return lead;
};

module.exports = {
  checkDuplicate,
  getAssignedCounsellor,
  createProcessedLead,
  normalizePhone
};
