const express = require('express');
const router = express.Router();
const { verifyMetaWebhook, receiveMetaWebhook, ingestWebsiteLead } = require('../controllers/webhookController');

// Meta Webhook Verification and Delivery
router.get('/meta', verifyMetaWebhook);
router.post('/meta', receiveMetaWebhook);

// Website Lead Ingestion
router.post('/website', ingestWebsiteLead);

module.exports = router;
