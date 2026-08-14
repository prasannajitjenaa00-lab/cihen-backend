// Default Meta Field Mapping Heuristics
const DEFAULT_MAPPING = {
  'full_name': 'studentName',
  'parent_name': 'parentName',
  'phone_number': 'phone',
  'email': 'email',
  'class': 'classInterested',
  'academic_year': 'academicYear'
};

// Fetch Lead Details
const getLeadById = async (leadId, pageAccessToken) => {
  if (pageAccessToken === 'mock_token') {
    return {
      id: leadId,
      created_time: new Date().toISOString(),
      ad_id: 'ad_123456',
      ad_name: 'Admission Open 2026',
      adset_id: 'adset_123456',
      adset_name: 'Parents Bhubaneswar',
      campaign_id: 'camp_123456',
      campaign_name: 'School Admission 2026',
      platform: 'facebook',
      field_data: [
        { name: 'full_name', values: ['Aryan Mohanty'] },
        { name: 'parent_name', values: ['Sanjay Mohanty'] },
        { name: 'phone_number', values: ['+919988776655'] },
        { name: 'email', values: ['aryan.parent@example.com'] },
        { name: 'class', values: ['Class 10'] },
        { name: 'academic_year', values: ['2026-2027'] }
      ]
    };
  }

  const url = `https://graph.facebook.com/v20.0/${leadId}?fields=created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform,field_data&access_token=${pageAccessToken}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Error fetching lead details from Meta Graph API');
  }

  return data;
};

// Map Meta Fields to CRM Structure
const mapLeadFields = (rawLead, fieldMapping = DEFAULT_MAPPING) => {
  const crmFieldData = {
    metaLeadId: rawLead.id,
    metaPageId: rawLead.page_id || '',
    metaFormId: rawLead.form_id || '',
    leadSource: rawLead.platform === 'instagram' ? 'Instagram' : 'Facebook',
    platform: rawLead.platform || 'facebook',
    campaign: rawLead.campaign_name || 'Meta Advertisement',
    adSet: rawLead.adset_name || '',
    ad: rawLead.ad_name || '',
    academicYear: '2026-2027', // Default fallback
    customFields: {}
  };

  const fieldDataArray = rawLead.field_data || [];
  
  // Create a normalized lookup map of mappings
  const mapping = new Map();
  if (fieldMapping instanceof Map) {
    fieldMapping.forEach((val, key) => mapping.set(key.toLowerCase(), val));
  } else if (fieldMapping && typeof fieldMapping === 'object') {
    Object.entries(fieldMapping).forEach(([key, val]) => mapping.set(key.toLowerCase(), val));
  }

  fieldDataArray.forEach((field) => {
    const fieldNameLower = field.name.toLowerCase();
    const fieldValue = field.values && field.values.length > 0 ? field.values[0] : '';

    if (!fieldValue) return;

    // Check if there is an explicit mapping
    if (mapping.has(fieldNameLower)) {
      const crmField = mapping.get(fieldNameLower);
      crmFieldData[crmField] = fieldValue;
    } else {
      // Default heuristic mappers if not explicitly mapped
      if (fieldNameLower.includes('phone') || fieldNameLower === 'phone_number') {
        crmFieldData.phone = fieldValue;
      } else if (fieldNameLower.includes('name') && !fieldNameLower.includes('parent')) {
        crmFieldData.studentName = fieldValue;
      } else if (fieldNameLower.includes('parent')) {
        crmFieldData.parentName = fieldValue;
      } else if (fieldNameLower.includes('email')) {
        crmFieldData.email = fieldValue;
      } else if (fieldNameLower.includes('class')) {
        crmFieldData.classInterested = fieldValue;
      } else if (fieldNameLower.includes('year')) {
        crmFieldData.academicYear = fieldValue;
      } else {
        // Collect extra custom fields
        crmFieldData.customFields[field.name] = fieldValue;
      }
    }
  });

  // Handle required fields fallbacks
  if (!crmFieldData.studentName && crmFieldData.parentName) {
    crmFieldData.studentName = crmFieldData.parentName;
  }
  if (!crmFieldData.studentName) {
    crmFieldData.studentName = 'Meta Lead';
  }
  if (!crmFieldData.parentName) {
    crmFieldData.parentName = 'Not Provided';
  }
  if (!crmFieldData.phone) {
    crmFieldData.phone = '0000000000';
  }
  if (!crmFieldData.classInterested) {
    crmFieldData.classInterested = 'Class 1';
  }

  return crmFieldData;
};

module.exports = {
  getLeadById,
  mapLeadFields
};
