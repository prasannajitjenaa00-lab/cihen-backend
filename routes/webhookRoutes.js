const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { verifyMetaWebhook, receiveMetaWebhook, ingestWebsiteLead } = require('../controllers/webhookController');
const { handleGoogleWebhook, getGoogleWebhookStatus } = require('../controllers/googleController');

// Dedicated Rate Limiter for Google Ads Webhook (Security)
const googleWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per 15m
  message: { success: false, message: 'Too many requests to Google webhook endpoint. Please try again later.' }
});

// Meta Webhook Verification and Delivery
router.get('/meta', verifyMetaWebhook);
router.post('/meta', receiveMetaWebhook);

// Google Ads Lead Form Webhook Ingestion & Status
router.get('/google', getGoogleWebhookStatus);
router.post('/google', googleWebhookLimiter, handleGoogleWebhook);

// Website Lead Ingestion
router.post('/website', ingestWebsiteLead);

module.exports = router;

