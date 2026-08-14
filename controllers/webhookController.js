const crypto = require('crypto');
const MetaWebhookLog = require('../models/MetaWebhookLog');
const CRMSettings = require('../models/CRMSettings');
const User = require('../models/User');
const Lead = require('../models/Lead');
const { createProcessedLead } = require('../services/leadService');
const metaService = require('../services/metaService');

// Process Meta lead in background
const processMetaLeadInBackground = async (logId, leadId, pageId, formId) => {
  const logEntry = await MetaWebhookLog.findById(logId);
  if (!logEntry) return;

  try {
    logEntry.status = 'Processing';
    await logEntry.save();

    const accessToken = process.env.META_ACCESS_TOKEN || 'mock_token';
    const rawLeadData = await metaService.getLeadById(leadId, accessToken);

    // Extract fields using default mapping
    const crmFieldData = metaService.mapLeadFields(rawLeadData);

    // Make sure identifiers from webhook are populated if missing
    if (!crmFieldData.metaPageId && pageId) crmFieldData.metaPageId = pageId;
    if (!crmFieldData.metaFormId && formId) crmFieldData.metaFormId = formId;

    // Create / Ingest Lead using leadService
    await createProcessedLead(crmFieldData);

    logEntry.status = 'Success';
    logEntry.error = undefined;
    logEntry.processedAt = new Date();
    await logEntry.save();
  } catch (error) {
    console.error(`Error processing Meta Lead: ${error.message}`);
    logEntry.status = 'Failed';
    logEntry.error = error.message;
    await logEntry.save();
  }
};

// @desc    Verify Meta Webhook callback URL
// @route   GET /api/webhooks/meta
// @access  Public
exports.verifyMetaWebhook = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Retrieve active verify token ONLY from environment variable
    const configToken = process.env.META_VERIFY_TOKEN || 'cohen_verify_token_2026';

    console.log(`Webhook verification attempt: mode=${mode}, receivedToken=${token}, expectedToken=${configToken}`);

    if (mode === 'subscribe' && token === configToken) {
      console.log('Meta Webhook Verified.');
      res.status(200).send(challenge);
    } else {
      console.warn(`Webhook verification failed. Mode: ${mode}, Token mismatch: received='${token}', expected='${configToken}'`);
      res.status(403).json({ success: false, message: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Receive Meta Webhook Event
// @route   POST /api/webhooks/meta
// @access  Public
exports.receiveMetaWebhook = async (req, res) => {
  try {
    const body = req.body;

    // Validate Signature if App Secret is configured in environment
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret && req.headers['x-hub-signature-256']) {
      const signature = req.headers['x-hub-signature-256'];
      const parts = signature.split('=');
      if (parts.length === 2 && parts[0] === 'sha256') {
        const expectedSignature = crypto
          .createHmac('sha256', appSecret)
          .update(req.rawBody || '')
          .digest('hex');
        
        if (parts[1] !== expectedSignature) {
          console.warn('Meta Webhook signature validation failed.');
          return res.status(401).send('Signature verification failed');
        }
      }
    }

    // Acknowledge webhook receipt quickly (200 OK) to prevent timeouts
    res.status(200).send('EVENT_RECEIVED');

    if (body.object === 'page') {
      const entries = body.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value.leadgen_id;
            const formId = change.value.form_id;
            const pageId = change.value.page_id;

            // Check if log already exists (idempotency check)
            const existingLog = await MetaWebhookLog.findOne({ eventId: leadgenId });
            if (existingLog) continue;

            // Log event
            const logEntry = await MetaWebhookLog.create({
              eventId: leadgenId,
              leadId: leadgenId,
              pageId: pageId,
              status: 'Received',
              rawPayload: JSON.stringify(body)
            });

            // Process in background
            processMetaLeadInBackground(logEntry._id, leadgenId, pageId, formId);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in Meta Webhook Receiver:', error);
  }
};

// @desc    Simulate Meta Webhook Event (DEVELOPMENT / TEST ONLY)
// @route   POST /api/meta/simulate-webhook
// @access  Private/Super Admin
exports.simulateWebhook = async (req, res) => {
  try {
    const {
      leadId,
      formId,
      pageId,
      studentName,
      parentName,
      phone,
      email,
      classInterested,
      campaignName,
      platform
    } = req.body;

    if (!leadId || !studentName || !phone) {
      return res.status(400).json({ success: false, message: 'Lead ID, Name, and Phone are required' });
    }

    // Check if log already exists (idempotency check)
    const existingLog = await MetaWebhookLog.findOne({ eventId: leadId });
    if (existingLog) {
      return res.status(400).json({ success: false, message: `Simulated event ID ${leadId} already exists in logs.` });
    }

    const mockPayload = {
      object: 'page',
      entry: [{
        id: pageId || 'mock_page_id',
        time: Math.floor(Date.now() / 1000),
        changes: [{
          value: {
            form_id: formId || 'mock_form_id',
            leadgen_id: leadId,
            page_id: pageId || 'mock_page_id',
            created_time: Math.floor(Date.now() / 1000)
          },
          field: 'leadgen'
        }]
      }]
    };

    const logEntry = await MetaWebhookLog.create({
      eventId: leadId,
      leadId,
      pageId: pageId || 'mock_page_id',
      status: 'Received',
      rawPayload: JSON.stringify(mockPayload)
    });

    logEntry.status = 'Processing';
    await logEntry.save();

    const crmFieldData = {
      metaLeadId: leadId,
      metaPageId: pageId || 'mock_page_id',
      metaFormId: formId || 'mock_form_id',
      studentName,
      parentName: parentName || 'Simulated Parent',
      phone,
      email: email || 'simulated@example.com',
      classInterested: classInterested || 'Class 1',
      academicYear: '2026-2027',
      leadSource: platform === 'instagram' ? 'Instagram' : 'Facebook',
      platform: platform || 'facebook',
      campaign: campaignName || 'School Admission 2026',
      adSet: 'Simulated AdSet',
      ad: 'Simulated Ad'
    };

    const lead = await createProcessedLead(crmFieldData, req.user);

    logEntry.status = 'Success';
    await logEntry.save();

    res.status(201).json({
      success: true,
      message: 'Simulated Meta Webhook event processed successfully',
      data: {
        logEntry,
        lead
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Website Lead Ingestion API
// @route   POST /api/leads/website
// @access  Public (X-API-Key protected)
exports.ingestWebsiteLead = async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'API Key missing in headers (X-API-Key)' });
    }

    let settings = await CRMSettings.findOne();
    if (!settings) {
      settings = await CRMSettings.create({});
    }

    if (apiKey !== settings.websiteApiKey) {
      return res.status(401).json({ success: false, message: 'Invalid API Key' });
    }

    const { studentName, parentName, phone, email, classInterested, academicYear } = req.body;

    if (!studentName || !parentName || !phone || !classInterested) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: studentName, parentName, phone, and classInterested are required'
      });
    }

    const leadData = {
      studentName,
      parentName,
      phone,
      email,
      classInterested,
      academicYear: academicYear || '2026-2027',
      leadSource: 'Website',
      platform: 'website'
    };

    const lead = await createProcessedLead(leadData, null);

    res.status(201).json({
      success: true,
      message: 'Website lead received and queued successfully',
      data: {
        leadId: lead.leadId,
        studentName: lead.studentName,
        assignedCounsellor: lead.assignedCounsellor ? 'Assigned' : 'Unassigned',
        duplicateStatus: lead.duplicateStatus
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get Webhook Logs
// @route   GET /api/meta/webhook-logs
// @access  Private/Super Admin
exports.getWebhookLogs = async (req, res) => {
  try {
    const logs = await MetaWebhookLog.find().sort({ createdAt: -1 }).limit(100);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Retry processing a failed webhook log
// @route   POST /api/meta/webhook-logs/:id/retry
// @access  Private/Super Admin
exports.retryWebhookLog = async (req, res) => {
  try {
    const logEntry = await MetaWebhookLog.findById(req.params.id);

    if (!logEntry) {
      return res.status(404).json({ success: false, message: 'Webhook log not found' });
    }

    logEntry.retryCount += 1;
    await logEntry.save();

    let formId = 'unknown';
    try {
      const payload = JSON.parse(logEntry.rawPayload);
      formId = payload.entry[0].changes[0].value.form_id || 'unknown';
    } catch (e) {}

    // Async process
    processMetaLeadInBackground(logEntry._id, logEntry.leadId, logEntry.pageId, formId);

    res.status(200).json({
      success: true,
      message: 'Retry initiated in the background',
      data: logEntry
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


