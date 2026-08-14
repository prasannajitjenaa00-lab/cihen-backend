const express = require('express');
const router = express.Router();
const {
  getWebhookLogs,
  retryWebhookLog,
  simulateWebhook
} = require('../controllers/webhookController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);
router.use(authorizeRoles('Super Admin')); // Only Super Admins can access integration credentials/logs

router.get('/webhook-logs', getWebhookLogs);
router.post('/webhook-logs/:id/retry', retryWebhookLog);
router.post('/simulate-webhook', simulateWebhook);

module.exports = router;
