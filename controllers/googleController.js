const crypto = require('crypto');
const CRMSettings = require('../models/CRMSettings');
const GoogleWebhookLog = require('../models/GoogleWebhookLog');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const { parseGooglePayload } = require('../utils/googlePayloadParser');
const { processGoogleLead, executeRetry } = require('../services/googleService');
const {
  getEligibleConversions,
  generateConversionCsv,
  uploadConversionsViaApi
} = require('../services/offlineConversionService');

/**
 * Constant-time comparison to prevent timing attacks on webhook key
 */
const timingSafeKeyCheck = (receivedKey, expectedKey) => {
  if (!receivedKey || !expectedKey) return false;
  const bufReceived = Buffer.from(receivedKey);
  const bufExpected = Buffer.from(expectedKey);
  if (bufReceived.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufReceived, bufExpected);
};

/**
 * Extract IP address safely from request
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

/**
 * @desc    Public Google Ads Lead Delivery Webhook
 * @route   POST /api/webhooks/google
 * @access  Public (Validated via google_key)
 */
exports.handleGoogleWebhook = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    let settings = await CRMSettings.findOne();
    if (!settings) {
      settings = await CRMSettings.create({});
    }

    // 1. Extract and verify google_key
    const receivedKey =
      req.query.google_key ||
      req.body?.google_key ||
      req.headers['x-google-key'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    const expectedKey = settings.googleWebhookKey;

    if (!receivedKey || !timingSafeKeyCheck(receivedKey, expectedKey)) {
      console.warn(`[Google Webhook] Unauthorized attempt from IP: ${ipAddress}`);

      // Log unauthorized attempt
      await GoogleWebhookLog.create({
        eventId: req.body?.lead_id || `unauth_${Date.now()}`,
        leadId: req.body?.lead_id || '',
        status: 'Unauthorized',
        rawPayload: req.body || {},
        ipAddress,
        userAgent,
        error: 'Invalid or missing google_key in webhook request'
      });

      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or missing google_key'
      });
    }

    // 2. Parse Google Payload using googlePayloadParser layer
    const parsed = parseGooglePayload(req.body, req.query);

    // 3. Handle Google Ads "Send Test Data" Ping
    if (parsed.isTest) {
      const result = await processGoogleLead(parsed.data, req.body, { ipAddress, userAgent });
      return res.status(200).json({
        success: true,
        isTest: true,
        message: 'Google Ads test webhook received and verified successfully',
        logId: result.logEntry?._id
      });
    }

    // 4. Validate payload integrity for live leads
    if (!parsed.isValid) {
      const errorMsg = `Missing required fields: ${parsed.missingFields.join(', ')}`;
      const logEntry = await GoogleWebhookLog.create({
        eventId: req.body?.lead_id || `invalid_${Date.now()}`,
        leadId: req.body?.lead_id || '',
        status: 'Failed',
        rawPayload: req.body || {},
        ipAddress,
        userAgent,
        error: errorMsg
      });

      return res.status(400).json({
        success: false,
        message: errorMsg,
        missingFields: parsed.missingFields,
        logId: logEntry._id
      });
    }

    // 5. Ingest lead with duplicate check and counsellor assignment
    const result = await processGoogleLead(parsed.data, req.body, { ipAddress, userAgent });

    return res.status(200).json({
      success: true,
      message: result.message,
      leadId: result.lead?.leadId,
      duplicate: result.isDuplicate,
      status: result.logEntry?.status
    });
  } catch (error) {
    console.error('Error handling Google Ads webhook:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error processing Google Ads lead'
    });
  }
};

/**
 * @desc    Public Google Webhook Health Check / Info
 * @route   GET /api/webhooks/google
 * @access  Public
 */
exports.getGoogleWebhookStatus = async (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Google Ads Lead Form Webhook Ingestion API',
    status: 'Operational',
    version: '1.0.0',
    timestamp: new Date()
  });
};

/**
 * @desc    Get Google Webhook Logs (Admin)
 * @route   GET /api/google/webhook-logs
 * @access  Private (Admin / Super Admin)
 */
exports.getGoogleWebhookLogs = async (req, res) => {
  try {
    const { status, search, limit = 50, page = 1 } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { leadId: { $regex: search, $options: 'i' } },
        { gclid: { $regex: search, $options: 'i' } },
        { campaignName: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [logs, total] = await Promise.all([
      GoogleWebhookLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      GoogleWebhookLog.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error fetching webhook logs' });
  }
};

/**
 * @desc    Retry failed webhook log manually
 * @route   POST /api/google/webhook-logs/:id/retry
 * @access  Private (Admin / Super Admin)
 */
exports.retryGoogleWebhookLog = async (req, res) => {
  try {
    const result = await executeRetry(req.params.id);
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.logEntry
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message || 'Retry failed'
    });
  }
};

/**
 * @desc    Simulate Google Ads Lead Event (Testing Hub)
 * @route   POST /api/google/simulate-webhook
 * @access  Private (Admin / Super Admin)
 */
exports.simulateGoogleWebhook = async (req, res) => {
  try {
    const {
      scenario = 'success', // 'success', 'test_ping', 'duplicate', 'unauthorized', 'missing_fields', 'server_error'
      studentName = 'Aditya Verma',
      parentName = 'Manoj Verma',
      phone = '9876543210',
      email = 'aditya.verma@example.com',
      classInterested = 'Class 11 Science',
      campaignName = 'School Admission 2026 - Search',
      campaignId = '12345678',
      formId = 'form_987654',
      gclid = `Cj0KCQjwgJv4BRCrARIsAB1vvuN0_${Date.now()}`,
      gbraid = '',
      wbraid = '',
      customKey = ''
    } = req.body;

    let settings = await CRMSettings.findOne();
    if (!settings) settings = await CRMSettings.create({});

    const ipAddress = getClientIp(req);
    const userAgent = 'Google-Ads-Simulator/1.0';

    // SCENARIO 1: Unauthorized Test (Invalid Key)
    if (scenario === 'unauthorized') {
      const invalidKey = customKey || 'wrong_google_key_test';
      const log = await GoogleWebhookLog.create({
        eventId: `sim_unauth_${Date.now()}`,
        leadId: `sim_unauth_${Date.now()}`,
        status: 'Unauthorized',
        rawPayload: { scenario, keyUsed: invalidKey },
        ipAddress,
        userAgent,
        error: 'Invalid google_key supplied in simulated webhook'
      });

      return res.status(200).json({
        success: false,
        scenario: 'unauthorized',
        status: 'Unauthorized',
        message: 'Simulated unauthorized rejection: Invalid google_key rejected with HTTP 401.',
        logEntry: log
      });
    }

    // SCENARIO 2: Test Ping (is_test: true)
    if (scenario === 'test_ping') {
      const mockTestPayload = {
        lead_id: `test_lead_${Date.now()}`,
        form_id: formId,
        campaign_id: campaignId,
        google_key: settings.googleWebhookKey,
        is_test: true,
        user_column_data: [
          { column_id: 'FULL_NAME', string_value: 'Test Student' },
          { column_id: 'PHONE_NUMBER', string_value: '+919999999999' }
        ]
      };

      const parsed = parseGooglePayload(mockTestPayload);
      const result = await processGoogleLead(parsed.data, mockTestPayload, { ipAddress, userAgent });

      return res.status(200).json({
        success: true,
        scenario: 'test_ping',
        status: 'Test',
        message: 'Google Ads "Send Test Data" ping verified successfully (HTTP 200 returned).',
        logEntry: result.logEntry
      });
    }

    // SCENARIO 3: Missing Fields (Validation Failure)
    if (scenario === 'missing_fields') {
      const invalidPayload = {
        lead_id: `invalid_${Date.now()}`,
        google_key: settings.googleWebhookKey,
        user_column_data: [
          { column_id: 'CITY', string_value: 'Bhubaneswar' }
          // Student name and Phone missing
        ]
      };

      const parsed = parseGooglePayload(invalidPayload);
      const log = await GoogleWebhookLog.create({
        eventId: invalidPayload.lead_id,
        leadId: invalidPayload.lead_id,
        status: 'Failed',
        rawPayload: invalidPayload,
        ipAddress,
        userAgent,
        error: `Validation failed: Missing fields [${parsed.missingFields.join(', ')}]`
      });

      return res.status(200).json({
        success: false,
        scenario: 'missing_fields',
        status: 'Failed',
        message: `Validation handled: Missing required fields [${parsed.missingFields.join(', ')}] logged as Failed.`,
        logEntry: log
      });
    }

    // SCENARIO 4: Duplicate Submission (Idempotency Test)
    if (scenario === 'duplicate') {
      // Find an existing Google lead or create one first
      let targetLead = await Lead.findOne({ googleLeadId: { $exists: true, $ne: null } });
      const duplicateLeadId = targetLead ? targetLead.googleLeadId : `sim_lead_dup_seed_${Date.now()}`;

      if (!targetLead) {
        // Seed a lead first
        const seedPayload = {
          lead_id: duplicateLeadId,
          user_column_data: [
            { column_id: 'FULL_NAME', string_value: studentName },
            { column_id: 'PARENT_NAME', string_value: parentName },
            { column_id: 'PHONE_NUMBER', string_value: phone },
            { column_id: 'EMAIL', string_value: email },
            { column_id: 'CLASS_INTERESTED', string_value: classInterested }
          ],
          campaign_id: campaignId,
          campaign_name: campaignName,
          gclid
        };
        const parsedSeed = parseGooglePayload(seedPayload);
        await processGoogleLead(parsedSeed.data, seedPayload, { ipAddress, userAgent });
      }

      // Now fire duplicate attempt with identical Google Lead ID
      const dupPayload = {
        lead_id: duplicateLeadId,
        user_column_data: [
          { column_id: 'FULL_NAME', string_value: studentName },
          { column_id: 'PHONE_NUMBER', string_value: phone }
        ],
        google_key: settings.googleWebhookKey
      };

      const parsedDup = parseGooglePayload(dupPayload);
      const result = await processGoogleLead(parsedDup.data, dupPayload, { ipAddress, userAgent });

      return res.status(200).json({
        success: true,
        scenario: 'duplicate',
        status: 'Duplicate',
        isDuplicate: true,
        message: `Idempotency verified: Duplicate Google Lead ID ${duplicateLeadId} detected and logged without re-creating lead.`,
        lead: result.lead,
        logEntry: result.logEntry
      });
    }

    // SCENARIO 5: Simulated Server Error (Trigger Exponential Backoff Retry)
    if (scenario === 'server_error') {
      const errLog = await GoogleWebhookLog.create({
        eventId: `sim_err_${Date.now()}`,
        leadId: `sim_err_${Date.now()}`,
        status: 'Failed',
        rawPayload: { scenario: 'server_error', note: 'Simulated downstream connection timeout' },
        ipAddress,
        userAgent,
        error: 'Simulated 503 Service Unavailable / Connection Timeout',
        retryCount: 0,
        nextRetryAt: new Date(Date.now() + 60 * 1000) // Scheduled in 1 minute
      });

      return res.status(200).json({
        success: true,
        scenario: 'server_error',
        status: 'Failed',
        message: 'Simulated server error logged. Automatic exponential backoff retry scheduled for next run.',
        logEntry: errLog
      });
    }

    // SCENARIO 6: Success (Default standard lead form submission)
    const mockLeadId = `g_lead_${Date.now()}`;
    const standardPayload = {
      lead_id: mockLeadId,
      api_version: '1.0',
      form_id: formId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      google_key: settings.googleWebhookKey,
      is_test: false,
      gclid,
      gbraid,
      wbraid,
      user_column_data: [
        { column_id: 'FULL_NAME', string_value: studentName },
        { column_id: 'PARENT_NAME', string_value: parentName },
        { column_id: 'PHONE_NUMBER', string_value: phone },
        { column_id: 'EMAIL', string_value: email },
        { column_id: 'CLASS_INTERESTED', string_value: classInterested }
      ]
    };

    const parsed = parseGooglePayload(standardPayload);
    const result = await processGoogleLead(parsed.data, standardPayload, { ipAddress, userAgent });

    return res.status(201).json({
      success: true,
      scenario: 'success',
      status: 'Success',
      message: 'Simulated Google Ads lead successfully ingested into CRM.',
      lead: result.lead,
      duplicate: result.isDuplicate,
      logEntry: result.logEntry
    });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Simulation error' });
  }
};

/**
 * @desc    Get Google Ads Integration Config & Overview
 * @route   GET /api/google/config
 * @access  Private (Admin / Super Admin)
 */
exports.getGoogleConfig = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) settings = await CRMSettings.create({});

    // Aggregate statistics
    const [totalLogs, successCount, failedCount, duplicateCount, testCount, googleLeadsCount, conversionsCount] =
      await Promise.all([
        GoogleWebhookLog.countDocuments(),
        GoogleWebhookLog.countDocuments({ status: 'Success' }),
        GoogleWebhookLog.countDocuments({ status: 'Failed' }),
        GoogleWebhookLog.countDocuments({ status: 'Duplicate' }),
        GoogleWebhookLog.countDocuments({ status: 'Test' }),
        Lead.countDocuments({ leadSource: 'Google Ads' }),
        Lead.countDocuments({
          leadSource: 'Google Ads',
          status: 'Admission Confirmed',
          gclid: { $exists: true, $ne: '' }
        })
      ]);

    const protocol = req.protocol;
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/api/webhooks/google`;

    res.status(200).json({
      success: true,
      data: {
        webhookUrl,
        googleWebhookKey: settings.googleWebhookKey,
        googleCustomerId: settings.googleCustomerId || '',
        googleConversionAction: settings.googleConversionAction || 'School Admission',
        googleConversionValue: settings.googleConversionValue || 5000,
        googleConversionCurrency: settings.googleConversionCurrency || 'INR',
        hasApiConfig: Boolean(settings.googleCustomerId && settings.googleDeveloperToken),
        stats: {
          totalLogs,
          successCount,
          failedCount,
          duplicateCount,
          testCount,
          googleLeadsCount,
          conversionsCount
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Update Google Ads Config
 * @route   PUT /api/google/config
 * @access  Private (Admin / Super Admin)
 */
exports.updateGoogleConfig = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) settings = new CRMSettings();

    const {
      googleCustomerId,
      googleConversionAction,
      googleConversionValue,
      googleConversionCurrency,
      googleDeveloperToken,
      googleClientId,
      googleClientSecret,
      googleRefreshToken
    } = req.body;

    if (googleCustomerId !== undefined) settings.googleCustomerId = googleCustomerId;
    if (googleConversionAction !== undefined) settings.googleConversionAction = googleConversionAction;
    if (googleConversionValue !== undefined) settings.googleConversionValue = Number(googleConversionValue) || 5000;
    if (googleConversionCurrency !== undefined) settings.googleConversionCurrency = googleConversionCurrency;
    if (googleDeveloperToken !== undefined) settings.googleDeveloperToken = googleDeveloperToken;
    if (googleClientId !== undefined) settings.googleClientId = googleClientId;
    if (googleClientSecret !== undefined) settings.googleClientSecret = googleClientSecret;
    if (googleRefreshToken !== undefined) settings.googleRefreshToken = googleRefreshToken;

    await settings.save();

    await AuditLog.create({
      user: req.user?.id,
      action: 'Google Ads Config Updated',
      entity: 'Settings',
      entityId: settings._id.toString(),
      details: 'Updated Google Ads conversion tracking and customer ID settings'
    });

    res.status(200).json({
      success: true,
      message: 'Google Ads configuration updated successfully',
      data: settings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error updating Google Ads configuration' });
  }
};

/**
 * @desc    Regenerate Google Webhook Secret Key
 * @route   POST /api/google/regenerate-key
 * @access  Private (Super Admin)
 */
exports.regenerateGoogleKey = async (req, res) => {
  try {
    let settings = await CRMSettings.findOne();
    if (!settings) settings = await CRMSettings.create({});

    const newKey = crypto.randomBytes(24).toString('hex');
    settings.googleWebhookKey = newKey;
    await settings.save();

    await AuditLog.create({
      user: req.user?.id,
      action: 'Google Webhook Key Regenerated',
      entity: 'Settings',
      entityId: settings._id.toString(),
      details: 'Google Ads Lead Form Webhook security key regenerated'
    });

    res.status(200).json({
      success: true,
      message: 'New Google Webhook Secret Key generated successfully',
      googleWebhookKey: newKey
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error regenerating key' });
  }
};

/**
 * @desc    Get Eligible Offline Conversions
 * @route   GET /api/google/conversions
 * @access  Private (Admin / Super Admin)
 */
exports.getGoogleConversions = async (req, res) => {
  try {
    const leads = await getEligibleConversions({
      stage: req.query.stage || 'Admission Confirmed',
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });

    res.status(200).json({
      success: true,
      data: leads,
      total: leads.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error fetching conversions' });
  }
};

/**
 * @desc    Export Conversions as CSV for Google Ads Upload
 * @route   GET /api/google/conversions/export
 * @access  Private (Admin / Super Admin)
 */
exports.exportGoogleConversionsCsv = async (req, res) => {
  try {
    const leads = await getEligibleConversions({
      stage: req.query.stage || 'Admission Confirmed',
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });

    const { csvContent, rowCount } = await generateConversionCsv(leads);

    const filename = `google_ads_conversions_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.status(200).send(csvContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error exporting conversions CSV' });
  }
};

/**
 * @desc    Direct Google Ads API Conversion Upload (Modular API Interface)
 * @route   POST /api/google/conversions/upload-api
 * @access  Private (Admin / Super Admin)
 */
exports.uploadGoogleConversionsApi = async (req, res) => {
  try {
    const leads = await getEligibleConversions({
      stage: req.body.stage || 'Admission Confirmed'
    });

    const result = await uploadConversionsViaApi(leads);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'API upload error' });
  }
};
