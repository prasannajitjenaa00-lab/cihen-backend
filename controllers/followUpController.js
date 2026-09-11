const FollowUp = require('../models/FollowUp');
const Lead = require('../models/Lead');
const Timeline = require('../models/Timeline');

// @desc    Get follow-ups list with filters
// @route   GET /api/followups
// @access  Private
exports.getFollowUps = async (req, res) => {
  try {
    let query = {};
    const { filter, status } = req.query;

    // Role guard: Counsellor / Senior Zonal Manager restriction
    if (req.user.role === 'Counsellor') {
      query.counsellor = req.user.id;
    } else if (req.user.role === 'Senior Zonal Manager') {
      const permittedLeads = await Lead.find({
        $or: [{ assignedCounsellor: req.user.id }, { createdBy: req.user.id }]
      }).select('_id');
      const permittedLeadIds = permittedLeads.map(l => l._id);
      query.$or = [
        { counsellor: req.user.id },
        { lead: { $in: permittedLeadIds } }
      ];
    }

    if (status) {
      query.status = status;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    if (filter === 'today') {
      query.status = 'Pending';
      query.date = { $gte: todayStart, $lte: todayEnd };
    } else if (filter === 'overdue') {
      query.status = 'Pending';
      query.date = { $lt: todayStart };
    } else if (filter === 'pending') {
      query.status = 'Pending';
    } else if (filter === 'completed') {
      query.status = 'Completed';
    }

    const followUps = await FollowUp.find(query)
      .populate('lead', 'leadId studentName parentName phone classInterested status nextFollowUp')
      .populate('counsellor', 'name')
      .sort({ date: 1, time: 1 });

    res.status(200).json({ success: true, count: followUps.length, data: followUps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update a follow-up status (Complete, Reschedule, Cancel)
// @route   PUT /api/followups/:id
// @access  Private
exports.updateFollowUp = async (req, res) => {
  try {
    const followUp = await FollowUp.findById(req.params.id);
    if (!followUp) {
      return res.status(404).json({ success: false, message: 'Follow-up not found' });
    }

    // Role-based auth
    if (req.user.role === 'Counsellor' && followUp.counsellor.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this follow-up' });
    }

    if (req.user.role === 'Senior Zonal Manager') {
      const isCounsellor = followUp.counsellor.toString() === req.user.id;
      let isLeadAuthorized = false;
      if (!isCounsellor) {
        const lead = await Lead.findById(followUp.lead);
        if (lead) {
          const leadAssigned = lead.assignedCounsellor?.toString();
          const leadCreator = lead.createdBy?.toString();
          isLeadAuthorized = (leadAssigned === req.user.id || leadCreator === req.user.id);
        }
      }
      if (!isCounsellor && !isLeadAuthorized) {
        return res.status(403).json({ success: false, message: 'Not authorized to modify this follow-up' });
      }
    }

    const { status: newStatus, date: newDate, time: newTime, notes: newNotes } = req.body;

    const oldStatus = followUp.status;
    followUp.status = newStatus || followUp.status;
    if (newNotes) followUp.notes = newNotes;

    // Rescheduling logic
    if (newStatus === 'Rescheduled') {
      if (!newDate || !newTime) {
        return res.status(400).json({ success: false, message: 'Rescheduled follow-ups require a new date and time' });
      }
      
      const oldDateStr = followUp.date.toDateString();
      const oldTimeStr = followUp.time;

      followUp.date = new Date(newDate);
      followUp.time = newTime;
      followUp.status = 'Pending'; // Reset to pending after reschedule

      // Update lead next follow up
      await Lead.findByIdAndUpdate(followUp.lead, { nextFollowUp: new Date(newDate) });

      await Timeline.create({
        lead: followUp.lead,
        eventType: 'FollowUpCreated',
        message: `Follow-up rescheduled from ${oldDateStr} at ${oldTimeStr} to ${newDate} at ${newTime}`,
        user: req.user.id
      });
    } else if (newStatus === 'Completed') {
      // Clear lead follow up or keep it
      // Let's write a timeline event
      await Timeline.create({
        lead: followUp.lead,
        eventType: 'StatusChange',
        message: `Follow-up completed: "${followUp.notes || 'No extra notes'}"`,
        user: req.user.id
      });
    } else if (newStatus === 'Cancelled') {
      await Timeline.create({
        lead: followUp.lead,
        eventType: 'StatusChange',
        message: `Follow-up cancelled: "${followUp.notes || 'No extra notes'}"`,
        user: req.user.id
      });
    }

    await followUp.save();

    res.status(200).json({
      success: true,
      message: `Follow-up ${newStatus === 'Rescheduled' ? 'rescheduled' : 'updated'} successfully`,
      data: followUp
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
