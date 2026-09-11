const express = require('express');
const router = express.Router();
const {
  getGoogleConfig,
  updateGoogleConfig,
  regenerateGoogleKey,
  getGoogleWebhookLogs,
  retryGoogleWebhookLog,
  simulateGoogleWebhook,
  getGoogleConversions,
  exportGoogleConversionsCsv,
  uploadGoogleConversionsApi
} = require('../controllers/googleController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);
router.use(authorizeRoles('Super Admin', 'Admin')); // Only Super Admins & Admins

// Integration Config & Setup
router.get('/config', getGoogleConfig);
router.put('/config', updateGoogleConfig);
router.post('/regenerate-key', authorizeRoles('Super Admin'), regenerateGoogleKey);

// Webhook Audit Logs & Manual Retry
router.get('/webhook-logs', getGoogleWebhookLogs);
router.post('/webhook-logs/:id/retry', retryGoogleWebhookLog);

// Interactive Webhook Simulator (Testing & QA)
router.post('/simulate-webhook', simulateGoogleWebhook);

// Offline Conversions (Smart Bidding Optimization)
router.get('/conversions', getGoogleConversions);
router.get('/conversions/export', exportGoogleConversionsCsv);
router.post('/conversions/upload-api', uploadGoogleConversionsApi);

module.exports = router;
