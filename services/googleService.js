const Lead = require('../models/Lead');
const GoogleWebhookLog = require('../models/GoogleWebhookLog');
const CRMSettings = require('../models/CRMSettings');
const AuditLog = require('../models/AuditLog');
const { createProcessedLead } = require('./leadService');
const { parseGooglePayload } = require('../utils/googlePayloadParser');

const MAX_AUTO_RETRIES = 5;

/**
 * Ingest / Process a Google Ads Lead with Idempotency & Duplicate Protection
 */
const processGoogleLead = async (parsedData, rawPayload, metadata = {}) => {
  const { ipAddress = '', userAgent = '', logId = null } = metadata;
  const leadId = parsedData.googleLeadId;

  let logEntry = logId ? await GoogleWebhookLog.findById(logId) : null;
  if (!logEntry) {
    logEntry = await GoogleWebhookLog.create({
      eventId: leadId,
      leadId,
      formId: parsedData.googleFormId,
      campaignId: parsedData.googleCampaignId,
      campaignName: parsedData.googleCampaignName,
      adGroupId: parsedData.googleAdGroupId,
      creativeId: parsedData.googleCreativeId,
      gclid: parsedData.gclid,
      gbraid: parsedData.gbraid,
      wbraid: parsedData.wbraid,
      isTest: Boolean(parsedData.isTest),
      status: 'Processing',
      rawPayload,
      ipAddress,
      userAgent
    });
  } else {
    logEntry.status = 'Processing';
    await logEntry.save();
  }

  // 1. Check Idempotency: Has this Google Lead ID already been processed into a lead?
  if (leadId) {
    const existingLead = await Lead.findOne({ googleLeadId: leadId });
    if (existingLead) {
      logEntry.status = 'Duplicate';
      logEntry.error = `Lead with Google Lead ID ${leadId} already ingested (CRM ID: ${existingLead.leadId})`;
      logEntry.processedAt = new Date();
      await logEntry.save();

      return {
        success: true,
        isDuplicate: true,
        message: `Idempotent: Lead with Google Lead ID ${leadId} already exists.`,
        lead: existingLead,
        logEntry
      };
    }
  }

  // 2. If it is a pure Google Test Ping (`is_test: true`)
  if (parsedData.isTest) {
    logEntry.status = 'Test';
    logEntry.processedAt = new Date();
    await logEntry.save();

    return {
      success: true,
      isTest: true,
      message: 'Google Ads Webhook test ping verified successfully.',
      logEntry
    };
  }

  // 3. Process & Ingest Lead into CRM
  try {
    const lead = await createProcessedLead(parsedData, null);

    logEntry.status = 'Success';
    logEntry.error = undefined;
    logEntry.processedAt = new Date();
    await logEntry.save();

    // Audit Trail
    await AuditLog.create({
      action: 'Google Ads Lead Ingested',
      entity: 'Lead',
      entityId: lead._id.toString(),
      details: `Google Ads lead received (GCLID: ${parsedData.gclid || 'N/A'}, Campaign: ${parsedData.googleCampaignName || 'N/A'}, Form: ${parsedData.googleFormId || 'N/A'})`
    });

    return {
      success: true,
      isDuplicate: false,
      message: 'Google Ads lead ingested successfully.',
      lead,
      logEntry
    };
  } catch (err) {
    console.error('Error in processGoogleLead:', err);
    logEntry.status = 'Failed';
    logEntry.error = err.message;
    await logEntry.save();

    // Schedule automatic retry with exponential backoff
    await scheduleRetry(logEntry._id, err.message);

    throw err;
  }
};

/**
 * Schedule automatic retry with exponential backoff
 * Delays: retry 1 = 1m, retry 2 = 2m, retry 3 = 4m, retry 4 = 8m, retry 5 = 16m
 */
const scheduleRetry = async (logId, errorMessage) => {
  try {
    const log = await GoogleWebhookLog.findById(logId);
    if (!log) return;

    if (log.retryCount >= MAX_AUTO_RETRIES) {
      log.status = 'Failed';
      log.error = `Permanently failed after ${log.retryCount} retries: ${errorMessage}`;
      log.nextRetryAt = undefined;
      await log.save();
      return;
    }

    const backoffMinutes = Math.pow(2, log.retryCount);
    const delayMs = Math.min(backoffMinutes * 60 * 1000, 60 * 60 * 1000); // capped at 1 hr
    log.nextRetryAt = new Date(Date.now() + delayMs);
    log.error = errorMessage;
    await log.save();

    console.log(`[Google Ads Retry] Scheduled retry #${log.retryCount + 1} for log ${logId} in ${backoffMinutes} min`);
  } catch (e) {
    console.error('Error scheduling retry:', e);
  }
};

/**
 * Execute Retry (invoked either automatically or manually via Admin button)
 */
const executeRetry = async (logId) => {
  const log = await GoogleWebhookLog.findById(logId);
  if (!log) {
    throw new Error('Google webhook log not found');
  }

  log.retryCount += 1;
  log.lastRetryAt = new Date();
  log.status = 'Processing';
  await log.save();

  try {
    // Re-parse raw payload
    const parsed = parseGooglePayload(log.rawPayload);
    if (!parsed.isValid && !parsed.isTest) {
      throw new Error(`Payload validation failed: Missing fields [${parsed.missingFields.join(', ')}]`);
    }

    const result = await processGoogleLead(parsed.data, log.rawPayload, {
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      logId: log._id
    });

    log.status = result.isDuplicate ? 'Duplicate' : result.isTest ? 'Test' : 'Success';
    log.error = undefined;
    log.nextRetryAt = undefined;
    log.processedAt = new Date();
    await log.save();

    return {
      success: true,
      message: `Retry successful: Lead ${result.lead ? result.lead.studentName : 'processed'}`,
      logEntry: log
    };
  } catch (error) {
    log.status = 'Failed';
    log.error = error.message;
    await log.save();

    if (log.retryCount < MAX_AUTO_RETRIES) {
      await scheduleRetry(log._id, error.message);
    }

    throw error;
  }
};

/**
 * Background runner to process pending retries
 */
const runPendingRetries = async () => {
  try {
    const pendingLogs = await GoogleWebhookLog.find({
      status: 'Failed',
      nextRetryAt: { $lte: new Date() },
      retryCount: { $lt: MAX_AUTO_RETRIES }
    }).limit(10);

    for (const log of pendingLogs) {
      try {
        await executeRetry(log._id);
      } catch (e) {
        console.error(`Automatic retry failed for log ${log._id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('Error running pending retries:', err);
  }
};

// Check for pending retries periodically (every 5 minutes)
setInterval(runPendingRetries, 5 * 60 * 1000);

module.exports = {
  processGoogleLead,
  scheduleRetry,
  executeRetry,
  runPendingRetries
};
