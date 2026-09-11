const express = require('express');
const router = express.Router();
const { getStats, getLeadsCharts, getMonitorableStaff, getStaffWorkOverview } = require('../controllers/dashboardController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect); // Protect all dashboard endpoints

router.get('/stats', getStats);
router.get('/leads', getLeadsCharts); // Mapping GET /api/dashboard/leads to getLeadsCharts

// Staff Work Monitor endpoints
const monitorRoles = ['Super Admin', 'Admin', 'SUPER_USER', 'CGO', 'Admissions Manager'];
router.get('/staff-work/staff', authorizeRoles(...monitorRoles), getMonitorableStaff);
router.get('/staff-work/:staffId', authorizeRoles(...monitorRoles), getStaffWorkOverview);

module.exports = router;
