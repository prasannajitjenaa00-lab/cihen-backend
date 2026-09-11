/**
 * Resilient Google Ads Webhook Payload Parser
 *
 * Google Ads sends lead form extension submissions via HTTP POST.
 * Standard format:
 * {
 *   "lead_id": "string",
 *   "user_column_data": [
 *     { "column_id": "FULL_NAME", "string_value": "..." },
 *     { "column_id": "PHONE_NUMBER", "string_value": "..." },
 *     { "column_id": "EMAIL", "string_value": "..." },
 *     { "column_id": "FIRST_NAME", "string_value": "..." },
 *     { "column_id": "LAST_NAME", "string_value": "..." },
 *     { "column_id": "CITY", "string_value": "..." },
 *     { "column_id": "POSTAL_CODE", "string_value": "..." },
 *     { "column_id": "CLASS_INTERESTED", "string_value": "..." }
 *   ],
 *   "api_version": "1.0",
 *   "form_id": "...",
 *   "campaign_id": "...",
 *   "google_key": "...",
 *   "is_test": false,
 *   "gclid": "...",
 *   "gbraid": "...",
 *   "wbraid": "...",
 *   "adgroup_id": "...",
 *   "creative_id": "..."
 * }
 */

const normalizeKey = (key) => (key || '').toString().trim().toUpperCase().replace(/[\s-_]+/g, '_');

const parseGooglePayload = (payload = {}, queryParams = {}) => {
  if (!payload || typeof payload !== 'object') {
    return {
      isValid: false,
      isTest: false,
      missingFields: ['payload_body'],
      data: null,
      error: 'Invalid or empty payload received'
    };
  }

  const isTest = Boolean(payload.is_test || payload.isTest || payload.test);
  const rawLeadId = payload.lead_id || payload.leadId || payload.id || '';
  const formId = (payload.form_id || payload.formId || '').toString();
  const campaignId = (payload.campaign_id || payload.campaignId || '').toString();
  const campaignName = payload.campaign_name || payload.campaignName || payload.campaign || 'Google Ads Campaign';
  const adGroupId = (payload.adgroup_id || payload.adGroupId || payload.ad_group_id || '').toString();
  const adGroupName = payload.adgroup_name || payload.adGroupName || '';
  const creativeId = (payload.creative_id || payload.creativeId || '').toString();

  // Click & App Attribution IDs
  const gclid = payload.gclid || queryParams.gclid || '';
  const gbraid = payload.gbraid || queryParams.gbraid || '';
  const wbraid = payload.wbraid || queryParams.wbraid || '';

  // UTM Parameters (from body or query)
  const utmSource = payload.utm_source || queryParams.utm_source || 'google';
  const utmMedium = payload.utm_medium || queryParams.utm_medium || 'cpc';
  const utmCampaign = payload.utm_campaign || queryParams.utm_campaign || campaignName || '';
  const utmTerm = payload.utm_term || queryParams.utm_term || '';
  const utmContent = payload.utm_content || queryParams.utm_content || '';

  let studentName = '';
  let parentName = '';
  let firstName = '';
  let lastName = '';
  let phone = '';
  let email = '';
  let classInterested = '';
  let academicYear = payload.academic_year || payload.academicYear || '2026-2027';
  let city = '';
  let state = '';
  let address = '';
  const customFields = {};

  // 1. Process Google's standard user_column_data array if available
  const columnData = Array.isArray(payload.user_column_data)
    ? payload.user_column_data
    : Array.isArray(payload.column_data)
    ? payload.column_data
    : [];

  columnData.forEach((col) => {
    if (!col) return;
    const colId = normalizeKey(col.column_id || col.column_name || col.id || col.name);
    const rawVal = col.string_value ?? col.value ?? '';
    const val = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal).trim();

    if (!val) return;

    switch (colId) {
      case 'FULL_NAME':
      case 'NAME':
      case 'STUDENT_NAME':
        studentName = val;
        break;
      case 'FIRST_NAME':
        firstName = val;
        break;
      case 'LAST_NAME':
        lastName = val;
        break;
      case 'PARENT_NAME':
      case 'GUARDIAN_NAME':
        parentName = val;
        break;
      case 'PHONE_NUMBER':
      case 'PHONE':
      case 'MOBILE':
      case 'CONTACT_NUMBER':
        phone = val;
        break;
      case 'EMAIL':
      case 'EMAIL_ADDRESS':
        email = val;
        break;
      case 'CITY':
        city = val;
        break;
      case 'STATE':
      case 'PROVINCE':
        state = val;
        break;
      case 'POSTAL_CODE':
      case 'ZIP':
      case 'ZIP_CODE':
      case 'PINCODE':
        customFields.postalCode = val;
        break;
      case 'STREET_ADDRESS':
      case 'ADDRESS':
        address = val;
        break;
      default:
        // Handle question fields (e.g. custom questions created in Google Ads lead form)
        if (colId.includes('CLASS') || colId.includes('GRADE') || colId.includes('STANDARD')) {
          classInterested = val;
        } else if (colId.includes('PARENT') || colId.includes('GUARDIAN')) {
          parentName = val;
        } else {
          customFields[col.column_name || col.column_id || colId] = val;
        }
        break;
    }
  });

  // 2. Fallback to flat payload keys if user_column_data didn't supply them
  if (!studentName && payload.studentName) studentName = payload.studentName;
  if (!studentName && payload.full_name) studentName = payload.full_name;
  if (!studentName && (firstName || lastName)) {
    studentName = `${firstName} ${lastName}`.trim();
  }
  if (!parentName && payload.parentName) parentName = payload.parentName;
  if (!parentName && payload.parent_name) parentName = payload.parent_name;
  if (!phone && (payload.phone || payload.phone_number || payload.mobile)) {
    phone = payload.phone || payload.phone_number || payload.mobile;
  }
  if (!email && (payload.email || payload.email_address)) {
    email = payload.email || payload.email_address;
  }
  if (!classInterested && (payload.classInterested || payload.class_interested || payload.grade || payload.class)) {
    classInterested = payload.classInterested || payload.class_interested || payload.grade || payload.class;
  }
  if (!address && payload.address) address = payload.address;
  if (!city && payload.city) city = payload.city;

  // Defaults and normalizations
  if (!studentName && parentName) studentName = parentName;
  if (!studentName && isTest) studentName = 'Google Ads Test Student';
  if (!parentName) parentName = isTest ? 'Google Ads Test Parent' : 'Parent / Guardian';
  if (!classInterested) classInterested = 'Class 1';

  // Validation
  const missingFields = [];
  if (!isTest) {
    if (!studentName) missingFields.push('studentName');
    if (!phone) missingFields.push('phone');
  }

  const isValid = missingFields.length === 0;

  return {
    isValid,
    isTest,
    missingFields,
    data: {
      googleLeadId: rawLeadId || (isTest ? `test_lead_${Date.now()}` : `g_lead_${Date.now()}`),
      studentName: studentName || 'Google Ads Lead',
      parentName: parentName || 'Not Provided',
      phone: phone || (isTest ? '+919999999999' : ''),
      email: email ? email.toLowerCase() : '',
      classInterested: classInterested || 'Class 1',
      academicYear,
      city,
      state,
      address,
      leadSource: 'Google Ads',
      platform: 'google',
      campaign: campaignName,
      googleCampaignId: campaignId,
      googleCampaignName: campaignName,
      googleFormId: formId,
      googleAdGroupId: adGroupId,
      googleAdGroupName: adGroupName,
      googleCreativeId: creativeId,
      gclid,
      gbraid,
      wbraid,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      customFields
    }
  };
};

module.exports = {
  parseGooglePayload
};
