const Admission = require('../models/Admission');
const Lead = require('../models/Lead');
const Student = require('../models/Student');
const Timeline = require('../models/Timeline');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

// Helper to generate unique codes
const generateUniqueCode = async (prefix, Model, field) => {
  const currentYear = new Date().getFullYear();
  const lastRecord = await Model.findOne({}, {}, { sort: { createdAt: -1 } });
  let nextNum = 1001;

  if (lastRecord && lastRecord[field]) {
    const parts = lastRecord[field].split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `${prefix}-${currentYear}-${nextNum}`;
};

// @desc    Get admissions applications
// @route   GET /api/admissions
// @access  Private
exports.getAdmissions = async (req, res) => {
  try {
    let query = {};
    const { status, search } = req.query;

    if (status) {
      query.status = status;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { studentName: searchRegex },
        { parentName: searchRegex },
        { applicationNumber: searchRegex }
      ];
    }

    const admissions = await Admission.find(query)
      .populate('lead', 'leadId phone email duplicateStatus')
      .populate('counsellor', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: admissions.length, data: admissions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create an admission application manually for qualified lead
// @route   POST /api/admissions
// @access  Private
exports.createAdmission = async (req, res) => {
  try {
    const { leadId, classInterested, academicYear } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, message: 'Lead ID is required' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Check if application already exists for this lead
    const existingApp = await Admission.findOne({ lead: leadId });
    if (existingApp) {
      return res.status(400).json({ success: false, message: 'Admission application already exists for this lead' });
    }

    const appNumber = await generateUniqueCode('APP', Admission, 'applicationNumber');

    const admission = await Admission.create({
      applicationNumber: appNumber,
      lead: lead._id,
      studentName: lead.studentName,
      parentName: lead.parentName,
      classInterested: classInterested || lead.classInterested,
      academicYear: academicYear || lead.academicYear,
      counsellor: lead.assignedCounsellor,
      status: 'Application Started'
    });

    // Update lead status
    lead.status = 'Application Started';
    await lead.save();

    await Timeline.create({
      lead: lead._id,
      eventType: 'StatusChange',
      message: `Admission application created: ${appNumber}`,
      user: req.user.id
    });

    await AuditLog.create({
      user: req.user.id,
      action: 'Admission Created',
      entity: 'Admission',
      entityId: admission._id.toString(),
      details: `Application ${appNumber} initiated for Lead ${lead.leadId}`
    });

    res.status(201).json({ success: true, message: 'Admission application started', data: admission });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update admission application status, uploads metadata, or confirm admission
// @route   PUT /api/admissions/:id
// @access  Private
exports.updateAdmission = async (req, res) => {
  try {
    const admission = await Admission.findById(req.params.id);
    if (!admission) {
      return res.status(404).json({ success: false, message: 'Admission application not found' });
    }

    const { status, paymentStatus, document } = req.body;

    const oldStatus = admission.status;

    // Handle document upload metadata appending
    if (document && document.name && document.fileUrl) {
      admission.documents.push({
        name: document.name,
        fileUrl: document.fileUrl,
        fileType: document.fileType || 'PDF',
        uploadedAt: new Date()
      });
      
      await Timeline.create({
        lead: admission.lead,
        eventType: 'NoteAdded',
        message: `Document uploaded: "${document.name}"`,
        user: req.user.id
      });
    }

    if (paymentStatus) {
      admission.paymentStatus = paymentStatus;
    }

    if (status) {
      admission.status = status;
    }

    await admission.save();

    // Trigger onboarding when Confirmed
    if (status && status === 'Admission Confirmed' && oldStatus !== 'Admission Confirmed') {
      admission.admissionDate = new Date();
      await admission.save();

      // Check if student record already exists
      const existingStudent = await Student.findOne({ admissionNumber: admission.applicationNumber });
      if (!existingStudent) {
        const studentId = await generateUniqueCode('STU', Student, 'studentId');
        const admissionNumber = await generateUniqueCode('ADM', Student, 'admissionNumber');

        // Fetch lead detail for contact info
        const lead = await Lead.findById(admission.lead);

        await Student.create({
          studentId,
          admissionNumber,
          studentName: admission.studentName,
          parentName: admission.parentName,
          phone: lead ? lead.phone : '0000000000',
          email: lead ? lead.email : '',
          dob: lead ? lead.dob : null,
          gender: lead ? lead.gender : 'Other',
          address: lead ? lead.address : '',
          class: admission.classInterested,
          academicYear: admission.academicYear,
          admissionDate: new Date(),
          status: 'Active'
        });

        // Update Lead state to Confirmed
        if (lead) {
          lead.status = 'Admission Confirmed';
          await lead.save();

          await Timeline.create({
            lead: lead._id,
            eventType: 'StatusChange',
            message: `Admission confirmed. Student record created: ${studentId}`,
            user: req.user.id
          });
        }

        // Notify admissions staff
        const staff = await User.find({ role: { $in: ['Super Admin', 'Admin', 'Admission Staff'] } });
        for (const s of staff) {
          await Notification.create({
            user: s._id,
            type: 'ADMISSION_CONFIRMED',
            message: `Admission Confirmed for ${admission.studentName}. Student ID: ${studentId}`,
            lead: admission.lead
          });
        }

        // Log audit
        await AuditLog.create({
          user: req.user.id,
          action: 'Admission Confirmed',
          entity: 'Student',
          entityId: studentId,
          details: `Student onboarded from application ${admission.applicationNumber}`
        });
      }
    } else if (status && oldStatus !== status) {
      // General status update sync to Lead
      await Lead.findByIdAndUpdate(admission.lead, { status });

      await Timeline.create({
        lead: admission.lead,
        eventType: 'StatusChange',
        message: `Admission status updated from "${oldStatus}" to "${status}"`,
        user: req.user.id
      });
    }

    res.status(200).json({ success: true, message: 'Admission application updated successfully', data: admission });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
