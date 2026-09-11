const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const Admission = require('../models/Admission');
const User = require('../models/User');
const Note = require('../models/Note');
const Call = require('../models/Call');
const Timeline = require('../models/Timeline');
const mongoose = require('mongoose');

// Helper to get date boundaries based on range query
const getDateRangeQuery = (range, startStr, endStr) => {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  // Reset to end of today
  endDate.setHours(23, 59, 59, 999);

  switch (range) {
    case 'Today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'Yesterday':
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'Last 7 Days':
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'Last 30 Days':
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'This Month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'Custom':
      if (startStr && endStr) {
        startDate = new Date(startStr);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(endStr);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate.setDate(startDate.getDate() - 29); // fallback to 30 days
        startDate.setHours(0, 0, 0, 0);
      }
      break;
    default:
      // Default to last 30 days
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
  }

  return { $gte: startDate, $lte: endDate };
};

// @desc    Get dashboard summary counters
// @route   GET /api/dashboard/stats
// @access  Private
exports.getStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let leadsQuery = {};
    let followUpQuery = {};

    // Role guard: scoped dashboard metrics
    if (req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') {
      leadsQuery.assignedCounsellor = req.user.id;
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Senior Zonal Manager') {
      leadsQuery.$or = [{ assignedCounsellor: req.user.id }, { createdBy: req.user.id }];
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Admissions Manager') {
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id);
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      leadsQuery.$or = [
        { assignedCounsellor: { $in: admissionsStaffIds } },
        { status: { $in: ADMISSIONS_STATUSES } }
      ];
      // Show all followups for the admissions team
      followUpQuery.counsellor = { $in: admissionsStaffIds };
    }

    const [
      totalLeads,
      newLeads,
      leadsToday,
      interestedLeads,
      applications,
      admissions,
      pendingFollowups,
      todayFollowups
    ] = await Promise.all([
      Lead.countDocuments(leadsQuery),
      Lead.countDocuments({ ...leadsQuery, status: 'New' }),
      Lead.countDocuments({ ...leadsQuery, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Lead.countDocuments({ ...leadsQuery, status: 'Interested' }),
      Lead.countDocuments({ ...leadsQuery, status: { $in: ['Application Started', 'Application Submitted'] } }),
      Lead.countDocuments({ ...leadsQuery, status: 'Admission Confirmed' }),
      FollowUp.countDocuments({ ...followUpQuery, status: 'Pending' }),
      FollowUp.countDocuments({
        ...followUpQuery,
        status: 'Pending',
        date: { $gte: todayStart, $lte: todayEnd }
      })
    ]);

    const conversionRate = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalLeads,
        newLeads,
        leadsToday,
        pendingFollowups,
        todayFollowups,
        interestedLeads,
        applications,
        confirmedAdmissions: admissions,
        conversionRate: parseFloat(conversionRate)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get dashboard chart data (leads-by-day, source, status, counsellor, campaign)
// @route   GET /api/dashboard/leads
// @access  Private
exports.getLeadsCharts = async (req, res) => {
  try {
    const { range, startDate: startStr, endDate: endStr } = req.query;
    const dateRange = getDateRangeQuery(range, startStr, endStr);

    let baseQuery = { createdAt: dateRange };
    let followUpQuery = { date: dateRange };

    if (req.user.role === 'Counsellor' || req.user.role === 'Admissions Officer') {
      baseQuery.assignedCounsellor = req.user.id;
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Senior Zonal Manager') {
      baseQuery.$or = [{ assignedCounsellor: req.user.id }, { createdBy: req.user.id }];
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Admissions Manager') {
      const admissionsStaffUsers = await User.find({
        role: { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] },
        isActive: true
      }).select('_id');
      const admissionsStaffIds = admissionsStaffUsers.map(u => u._id);
      const ADMISSIONS_STATUSES = [
        'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled',
        'Application Started', 'Application Submitted', 'Admission Confirmed'
      ];
      baseQuery.$or = [
        { assignedCounsellor: { $in: admissionsStaffIds } },
        { status: { $in: ADMISSIONS_STATUSES } }
      ];
      followUpQuery.counsellor = { $in: admissionsStaffIds };
    }

    // 1. Leads by Day (Line/Bar chart)
    const leadsByDayRaw = await Lead.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill empty days in the array for clean line charting
    const dayMap = new Map();
    leadsByDayRaw.forEach((item) => dayMap.set(item._id, item.count));

    const leadsByDay = [];
    const loopDate = new Date(dateRange.$gte);
    const stopDate = new Date(dateRange.$lte);
    
    // Safety cap at 60 days
    let iterations = 0;
    while (loopDate <= stopDate && iterations < 60) {
      const dateString = loopDate.toISOString().split('T')[0];
      leadsByDay.push({
        date: dateString,
        leads: dayMap.get(dateString) || 0
      });
      loopDate.setDate(loopDate.getDate() + 1);
      iterations++;
    }

    // 2. Leads by Source
    const leadsBySource = await Lead.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$leadSource',
          count: { $sum: 1 }
        }
      },
      { $project: { name: '$_id', value: '$count', _id: 0 } }
    ]);

    // 3. Leads by Status
    const leadsByStatus = await Lead.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $project: { name: '$_id', value: '$count', _id: 0 } }
    ]);

    // 4. Counsellor Performance (visible to supervisory/admin roles)
    let counsellorPerformance = [];
    const noPerformanceRoles = ['Counsellor', 'Admissions Officer', 'Senior Zonal Manager'];
    if (!noPerformanceRoles.includes(req.user.role)) {
      // Admissions Manager sees their admissions team; admin/CGO/SUPER_USER see all counsellors
      const isAdmissionsManager = req.user.role === 'Admissions Manager';
      const counsellorRoles = isAdmissionsManager
        ? ['Counsellor', 'Admissions Officer', 'Admissions Manager']
        : ['Counsellor'];
      const counsellors = await User.find({ role: { $in: counsellorRoles } });

      for (const c of counsellors) {
        const [assigned, contacted, interested, admissions] = await Promise.all([
          Lead.countDocuments({ assignedCounsellor: c._id }),
          Lead.countDocuments({ assignedCounsellor: c._id, status: { $ne: 'New' } }),
          Lead.countDocuments({ assignedCounsellor: c._id, status: 'Interested' }),
          Lead.countDocuments({ assignedCounsellor: c._id, status: 'Admission Confirmed' })
        ]);

        const rate = assigned > 0 ? ((admissions / assigned) * 100).toFixed(1) : 0;

        counsellorPerformance.push({
          counsellor: c.name,
          assigned,
          contacted,
          interested,
          admissions,
          conversionRate: parseFloat(rate)
        });
      }
    }

    // 5. Campaign Performance
    // Find all distinct campaigns
    const campaignsList = await Lead.distinct('campaign', baseQuery);
    const campaignPerformance = [];

    for (const campName of campaignsList) {
      if (!campName) continue; // skip null/empty campaign leads

      const [leads, qualified, admissions] = await Promise.all([
        Lead.countDocuments({ ...baseQuery, campaign: campName }),
        Lead.countDocuments({
          ...baseQuery,
          campaign: campName,
          status: { $in: ['Interested', 'Follow-up', 'Visit Scheduled', 'Application Started', 'Application Submitted', 'Admission Confirmed'] }
        }),
        Lead.countDocuments({ ...baseQuery, campaign: campName, status: 'Admission Confirmed' })
      ]);

      const rate = leads > 0 ? ((admissions / leads) * 100).toFixed(1) : 0;

      campaignPerformance.push({
        campaign: campName,
        leads,
        qualified,
        admissions,
        conversionRate: parseFloat(rate)
      });
    }

    res.status(200).json({
      success: true,
      data: {
        leadsByDay,
        leadsBySource,
        leadsByStatus,
        counsellorPerformance,
        campaignPerformance
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get monitorable staff list for Staff Work Monitor
// @route   GET /api/dashboard/staff-work/staff
// @access  Private/Supervision
exports.getMonitorableStaff = async (req, res) => {
  try {
    let roleQuery = {
      role: { $in: ['Admissions Officer', 'Admissions Manager', 'Senior Zonal Manager', 'CGO', 'Counsellor', 'Admission Staff'] },
      isActive: true
    };

    if (req.user.role === 'Admissions Manager') {
      roleQuery.role = { $in: ['Counsellor', 'Admissions Officer', 'Admissions Manager'] };
    }

    const staffList = await User.find(roleQuery)
      .select('_id name email role designation status mobile')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: staffList
    });
  } catch (error) {
    console.error('getMonitorableStaff error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get staff work overview payload for selected staff member
// @route   GET /api/dashboard/staff-work/:staffId
// @access  Private/Supervision
exports.getStaffWorkOverview = async (req, res) => {
  try {
    const { staffId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({ success: false, message: 'Invalid staff ID format.' });
    }

    const targetStaff = await User.findById(staffId).select('_id name email role designation status mobile');
    if (!targetStaff) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    const [
      assignedLeads,
      createdLeads,
      calls,
      notes,
      timelineEvents,
      followUps
    ] = await Promise.all([
      Lead.find({ assignedCounsellor: staffId })
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),
      Lead.find({ createdBy: staffId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Call.find({ counsellor: staffId })
        .populate('lead', 'studentName phone classInterested status')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Note.find({ createdBy: staffId })
        .populate('lead', 'studentName phone classInterested status')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Timeline.find({ user: staffId })
        .populate('lead', 'studentName phone classInterested status')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      FollowUp.find({ counsellor: staffId })
        .populate('lead', 'studentName phone classInterested status priority')
        .sort({ date: 1, time: 1 })
        .limit(150)
        .lean()
    ]);

    // Statistics calculations
    const totalAssigned = assignedLeads.length;
    const totalCreated = createdLeads.length;
    const confirmedAdmissions = assignedLeads.filter(l => l.status === 'Admission Confirmed').length;
    const inProgress = assignedLeads.filter(l => !['New', 'Admission Confirmed', 'Lost', 'Not Interested'].includes(l.status)).length;
    const conversionRate = totalAssigned > 0 ? parseFloat(((confirmedAdmissions / totalAssigned) * 100).toFixed(1)) : 0;

    const pendingFollowups = followUps.filter(f => f.status === 'Pending').length;
    const completedFollowups = followUps.filter(f => f.status === 'Completed').length;

    // Status breakdown
    const statusBreakdown = {
      New: 0, Contacted: 0, Interested: 0, 'Follow-up': 0, 'Visit Scheduled': 0,
      'Application Started': 0, 'Application Submitted': 0, 'Admission Confirmed': 0,
      'Not Interested': 0, Lost: 0
    };
    assignedLeads.forEach(l => {
      if (statusBreakdown[l.status] !== undefined) {
        statusBreakdown[l.status]++;
      }
    });

    // Categorize Follow-ups into Today, Upcoming, Pending/Overdue, Completed
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const followUpCategorized = {
      today: [],
      upcoming: [],
      pending: [],
      completed: []
    };

    followUps.forEach(f => {
      const fDate = new Date(f.date);
      if (f.status === 'Completed') {
        followUpCategorized.completed.push(f);
      } else if (f.status === 'Pending') {
        if (fDate < todayStart) {
          followUpCategorized.pending.push(f); // Overdue
        } else if (fDate >= todayStart && fDate <= todayEnd) {
          followUpCategorized.today.push(f);
        } else {
          followUpCategorized.upcoming.push(f);
        }
      } else {
        followUpCategorized.upcoming.push(f);
      }
    });

    // Combine call, note, and timeline activities into a unified chronological feed
    const combinedActivities = [];

    calls.forEach(c => {
      combinedActivities.push({
        _id: c._id,
        type: 'Call',
        lead: c.lead,
        summary: `Call Outcome: ${c.outcome}`,
        details: c.notes || '',
        timestamp: c.createdAt || c.callDate || new Date()
      });
    });

    notes.forEach(n => {
      combinedActivities.push({
        _id: n._id,
        type: 'Note',
        lead: n.lead,
        summary: 'Added Note',
        details: n.text || '',
        timestamp: n.createdAt || new Date()
      });
    });

    timelineEvents.forEach(t => {
      combinedActivities.push({
        _id: t._id,
        type: t.eventType || 'Timeline',
        lead: t.lead,
        summary: t.eventType || 'Activity',
        details: t.message || '',
        timestamp: t.createdAt || new Date()
      });
    });

    combinedActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      data: {
        staff: targetStaff,
        statistics: {
          totalAssigned,
          totalCreated,
          inProgress,
          confirmedAdmissions,
          conversionRate,
          pendingFollowups,
          completedFollowups,
          callsLogged: calls.length,
          notesAdded: notes.length,
          statusBreakdown
        },
        assignedLeads,
        createdLeads,
        activities: combinedActivities.slice(0, 100),
        followUps: followUpCategorized
      }
    });
  } catch (error) {
    console.error('getStaffWorkOverview error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
