const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const Admission = require('../models/Admission');
const User = require('../models/User');

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

    // Role guard: Counsellors and Senior Zonal Managers
    if (req.user.role === 'Counsellor') {
      leadsQuery.assignedCounsellor = req.user.id;
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Senior Zonal Manager') {
      leadsQuery.$or = [{ assignedCounsellor: req.user.id }, { createdBy: req.user.id }];
      followUpQuery.counsellor = req.user.id;
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

    if (req.user.role === 'Counsellor') {
      baseQuery.assignedCounsellor = req.user.id;
      followUpQuery.counsellor = req.user.id;
    } else if (req.user.role === 'Senior Zonal Manager') {
      baseQuery.$or = [{ assignedCounsellor: req.user.id }, { createdBy: req.user.id }];
      followUpQuery.counsellor = req.user.id;
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

    // 4. Counsellor Performance (not exposed to Counsellors or Senior Zonal Managers)
    let counsellorPerformance = [];
    if (!['Counsellor', 'Senior Zonal Manager'].includes(req.user.role)) {
      const counsellors = await User.find({ role: 'Counsellor' });

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
