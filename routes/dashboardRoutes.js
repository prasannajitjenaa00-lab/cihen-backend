const express = require('express');
const router = express.Router();
const { getStats, getLeadsCharts } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect); // Protect all dashboard endpoints

router.get('/stats', getStats);
router.get('/leads', getLeadsCharts); // Mapping GET /api/dashboard/leads to getLeadsCharts

module.exports = router;
