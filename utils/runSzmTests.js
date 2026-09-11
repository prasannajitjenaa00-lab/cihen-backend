require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const Note = require('../models/Note');
const Call = require('../models/Call');
const seedSuperUsers = require('./seedSuperUsers');
const seedCGO = require('./seedCGO');
const seedSZM = require('./seedSZM');

const BASE_URL = 'http://localhost:5000/api';

let passed = 0;
let failed = 0;

const originalFetch = global.fetch;
global.fetch = async function (url, options = {}, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await originalFetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
};

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING SENIOR ZONAL MANAGER (SZM) TEST SUITE');
  console.log('====================================================\n');

  // Connect to MongoDB with retry
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      console.log(`MongoDB connection attempt ${attempt} failed, retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 1. Seed accounts
  await seedSuperUsers();
  await seedCGO();
  await seedSZM();

  // Reset all official accounts to initial mobile passwords with mustChangePassword: true
  const salt = await bcrypt.genSalt(10);
  const accountsToReset = [
    { email: 'pramod.rath@coheninternationalschool.com', mobile: '9777440456', role: 'Senior Zonal Manager' },
    { email: 'subrat.moharana@coheninternationalschool.com', mobile: '9777440458', role: 'Senior Zonal Manager' },
    { email: 'nihar.patra@coheninternationalschool.com', mobile: '9777440461', role: 'Senior Zonal Manager' },
    { email: 'srinivas.dash@coheninternationalschool.com', mobile: '9777440467', role: 'CGO' },
    { email: 'chairman@coheninternationalschool.com', mobile: '9439112233', role: 'SUPER_USER' }
  ];

  for (const acc of accountsToReset) {
    const hash = await bcrypt.hash(acc.mobile, salt);
    await User.updateOne(
      { email: acc.email },
      { $set: { password: hash, mustChangePassword: true, isActive: true, status: 'Active' } }
    );
  }

  console.log('All test accounts reset to initial mobile password. Waiting for server...\n');

  // Wait for server to be responsive
  for (let i = 0; i < 15; i++) {
    try {
      await fetch(`${BASE_URL}/auth/login`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  const szmUser = await User.findOne({ email: 'pramod.rath@coheninternationalschool.com' });
  const szmUser2 = await User.findOne({ email: 'subrat.moharana@coheninternationalschool.com' });
  const cgoUser = await User.findOne({ email: 'srinivas.dash@coheninternationalschool.com' });
  const superUser = await User.findOne({ email: 'chairman@coheninternationalschool.com' });

  let szmToken = '';
  let cgoToken = '';
  let superToken = '';

  // --- TEST 1 & 2: SZM Login & Correct Role ---
  console.log('--- TEST 1 & 2: SZM Login & Role ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pramod.rath@coheninternationalschool.com',
      password: '9777440456'
    })
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200, 'TEST 1 - SZM login HTTP Status 200 OK');
  assert(loginData.success === true, 'TEST 1 - loginData.success === true');
  assert(loginData.user.role === 'Senior Zonal Manager', 'TEST 2 - User role is Senior Zonal Manager');
  assert(loginData.user.designation === 'Senior Zonal Manager – Operations & Admissions', 'TEST 2 - Correct designation returned');
  assert(loginData.user.mustChangePassword === true, 'TEST 1 - mustChangePassword is true on initial login');
  assert(!!loginData.token, 'TEST 1 - JWT token received');
  szmToken = loginData.token;

  // Login CGO to test lead assignments
  const cgoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'srinivas.dash@coheninternationalschool.com',
      password: '9777440467'
    })
  });
  const cgoLoginData = await cgoLoginRes.json();
  cgoToken = cgoLoginData.token;

  // Login SUPER_USER to test system-level access
  const superLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'chairman@coheninternationalschool.com',
      password: '9439112233'
    })
  });
  const superLoginData = await superLoginRes.json();
  superToken = superLoginData.token;

  const szmHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${szmToken}`
  };
  const cgoHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cgoToken}`
  };
  const superHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superToken}`
  };

  // --- TEST 3, 4, 5: SZM Creates Lead, createdBy is set, Lead in SZM list ---
  console.log('\n--- TEST 3, 4, 5: SZM Creates Lead, createdBy Recorded, Visible in List ---');
  const createLeadRes = await fetch(`${BASE_URL}/leads`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({
      studentName: 'Field Inquiry Student A',
      parentName: 'Field Parent A',
      phone: '9123456781',
      email: 'field.student.a@example.com',
      classInterested: 'Class 8',
      academicYear: '2026-2027',
      leadSource: 'Manual'
    })
  });
  const createLeadData = await createLeadRes.json();
  assert(createLeadRes.status === 201, 'TEST 3 - SZM creates lead HTTP 201 Created');
  assert(createLeadData.success === true, 'TEST 3 - Lead created successfully');
  const createdLeadId = createLeadData.data._id;

  // Verify createdBy and unassigned status in DB
  const dbLead = await Lead.findById(createdLeadId);
  assert(dbLead.createdBy.toString() === szmUser._id.toString(), 'TEST 4 - Lead createdBy stored correctly as SZM ID');
  assert(!dbLead.assignedCounsellor, 'TEST 4 - Field lead created by SZM is unassigned (not round-robin assigned to counsellor)');

  // Verify created lead appears in SZM lead list
  const szmLeadsRes = await fetch(`${BASE_URL}/leads`, { headers: szmHeaders });
  const szmLeadsData = await szmLeadsRes.json();
  assert(szmLeadsRes.status === 200, 'TEST 5 - SZM GET /api/leads HTTP 200 OK');
  const hasCreatedLead = szmLeadsData.data.some(l => l._id.toString() === createdLeadId.toString());
  assert(hasCreatedLead, 'TEST 5 - Created lead appears in SZM list');

  // --- TEST 6 & 7: CGO Assigns Lead to SZM & SZM Can View It ---
  console.log('\n--- TEST 6 & 7: CGO Assigns Lead to SZM & SZM Views It ---');
  // Create an unrelated lead by Admin/SUPER_USER
  const unrelatedLead = await Lead.create({
    studentName: 'Unrelated Lead X',
    parentName: 'Parent X',
    phone: '9988776651',
    classInterested: 'Class 6',
    academicYear: '2026-2027',
    leadSource: 'Website'
  });

  // CGO allocates unrelatedLead to SZM
  const assignRes = await fetch(`${BASE_URL}/leads/${unrelatedLead._id}/assign`, {
    method: 'POST',
    headers: cgoHeaders,
    body: JSON.stringify({ targetStaffId: szmUser._id.toString() })
  });
  const assignData = await assignRes.json();
  assert(assignRes.status === 200, 'TEST 6 - CGO allocates lead to SZM HTTP 200 OK');
  assert(assignData.data.assignedCounsellor.toString() === szmUser._id.toString(), 'TEST 6 - Lead assignedCounsellor updated to SZM');

  // SZM views assigned lead
  const viewAssignedRes = await fetch(`${BASE_URL}/leads/${unrelatedLead._id}`, { headers: szmHeaders });
  const viewAssignedData = await viewAssignedRes.json();
  assert(viewAssignedRes.status === 200, 'TEST 7 - SZM can view assigned lead HTTP 200 OK');
  assert(viewAssignedData.data.lead.studentName === 'Unrelated Lead X', 'TEST 7 - Assigned lead details accessible');

  // --- TEST 8: SZM Blocked from Unrelated Lead ---
  console.log('\n--- TEST 8: SZM Blocked from Unrelated Lead ---');
  // Create a lead neither assigned to nor created by SZM
  const foreignLead = await Lead.create({
    studentName: 'Foreign Secret Lead',
    parentName: 'Parent Secret',
    phone: '9988776652',
    classInterested: 'Class 10',
    academicYear: '2026-2027',
    leadSource: 'Google Ads',
    assignedCounsellor: szmUser2._id // assigned to someone else
  });

  const viewForeignRes = await fetch(`${BASE_URL}/leads/${foreignLead._id}`, { headers: szmHeaders });
  assert(viewForeignRes.status === 403, 'TEST 8 - SZM receives HTTP 403 Forbidden for unrelated lead');

  // Verify foreign lead is NOT in SZM lead list
  const szmLeadsCheck = await fetch(`${BASE_URL}/leads?limit=100`, { headers: szmHeaders });
  const szmLeadsCheckData = await szmLeadsCheck.json();
  const foreignInList = szmLeadsCheckData.data.some(l => l._id.toString() === foreignLead._id.toString());
  assert(!foreignInList, 'TEST 8 - Unrelated lead does NOT appear in SZM lead list');

  // Verify query parameter bypass attempt fails
  const bypassRes = await fetch(`${BASE_URL}/leads?assignedCounsellor=${szmUser2._id}`, { headers: szmHeaders });
  const bypassData = await bypassRes.json();
  const hasForeignInBypass = bypassData.data.some(l => l._id.toString() === foreignLead._id.toString());
  assert(!hasForeignInBypass, 'TEST 8 - Query parameter assignedCounsellor cannot bypass SZM visibility restriction');

  // --- TEST 9: SZM Logs Call on Permitted Lead ---
  console.log('\n--- TEST 9: SZM Logs Call Activity ---');
  const callRes = await fetch(`${BASE_URL}/leads/${createdLeadId}/calls`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({
      outcome: 'Connected',
      notes: 'Parent interested in campus tour next Saturday',
      callTime: '11:00 AM'
    })
  });
  const callData = await callRes.json();
  assert(callRes.status === 201, 'TEST 9 - SZM logs call on permitted lead HTTP 201 Created');
  assert(callData.data.outcome === 'Connected', 'TEST 9 - Call record outcome verified');

  // Unauthorized call attempt on foreign lead
  const foreignCallRes = await fetch(`${BASE_URL}/leads/${foreignLead._id}/calls`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ outcome: 'Connected', notes: 'Hacking attempt' })
  });
  assert(foreignCallRes.status === 403, 'TEST 9 - SZM blocked from logging call on foreign lead (HTTP 403)');

  // --- TEST 10: SZM Adds Note on Permitted Lead ---
  console.log('\n--- TEST 10: SZM Adds Note ---');
  const noteRes = await fetch(`${BASE_URL}/leads/${createdLeadId}/notes`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ text: 'Student has excellent academic record in Olympiads' })
  });
  const noteData = await noteRes.json();
  assert(noteRes.status === 201, 'TEST 10 - SZM adds note on permitted lead HTTP 201 Created');
  assert(noteData.data.text.includes('Olympiads'), 'TEST 10 - Note text verified');

  // Unauthorized note attempt on foreign lead
  const foreignNoteRes = await fetch(`${BASE_URL}/leads/${foreignLead._id}/notes`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ text: 'Unauthorized note' })
  });
  assert(foreignNoteRes.status === 403, 'TEST 10 - SZM blocked from adding note to foreign lead (HTTP 403)');

  // --- TEST 11: SZM Schedules Follow-up on Permitted Lead ---
  console.log('\n--- TEST 11: SZM Schedules Follow-up ---');
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 2);
  const followupRes = await fetch(`${BASE_URL}/leads/${createdLeadId}/followups`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({
      date: followUpDate.toISOString(),
      time: '03:30 PM',
      type: 'School Visit',
      notes: 'Campus visit and meeting with principal'
    })
  });
  const followupData = await followupRes.json();
  assert(followupRes.status === 201, 'TEST 11 - SZM schedules follow-up on permitted lead HTTP 201 Created');
  assert(followupData.data.type === 'School Visit', 'TEST 11 - Follow-up type verified');

  // Unauthorized follow-up attempt on foreign lead
  const foreignFollowupRes = await fetch(`${BASE_URL}/leads/${foreignLead._id}/followups`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ date: new Date().toISOString(), time: '10:00 AM', type: 'Call' })
  });
  assert(foreignFollowupRes.status === 403, 'TEST 11 - SZM blocked from scheduling follow-up on foreign lead (HTTP 403)');

  // --- TEST 12 & 13: SZM Updates Lead Details & Status ---
  console.log('\n--- TEST 12 & 13: SZM Updates Lead Details and Stage ---');
  const updateRes = await fetch(`${BASE_URL}/leads/${createdLeadId}`, {
    method: 'PUT',
    headers: szmHeaders,
    body: JSON.stringify({
      priority: 'Urgent',
      status: 'Visit Scheduled',
      alternatePhone: '9123456789'
    })
  });
  const updateData = await updateRes.json();
  assert(updateRes.status === 200, 'TEST 12 - SZM updates lead info HTTP 200 OK');
  assert(updateData.data.priority === 'Urgent', 'TEST 12 - Lead priority updated to Urgent');
  assert(updateData.data.status === 'Visit Scheduled', 'TEST 13 - Lead status advanced to Visit Scheduled');

  // Unauthorized update attempt on foreign lead
  const foreignUpdateRes = await fetch(`${BASE_URL}/leads/${foreignLead._id}`, {
    method: 'PUT',
    headers: szmHeaders,
    body: JSON.stringify({ status: 'Lost' })
  });
  assert(foreignUpdateRes.status === 403, 'TEST 13 - SZM blocked from updating foreign lead (HTTP 403)');

  // --- TEST 14 & 15: SZM Cannot Assign or Reassign Leads ---
  console.log('\n--- TEST 14 & 15: SZM Cannot Assign or Reassign Leads ---');
  const assignAttempt = await fetch(`${BASE_URL}/leads/${createdLeadId}/assign`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ targetStaffId: szmUser2._id.toString() })
  });
  assert(assignAttempt.status === 403, 'TEST 14 - SZM blocked from POST /api/leads/:id/assign (HTTP 403)');

  const reassignAttempt = await fetch(`${BASE_URL}/leads/${unrelatedLead._id}/assign`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ targetStaffId: szmUser2._id.toString() })
  });
  assert(reassignAttempt.status === 403, 'TEST 15 - SZM blocked from reassigning lead (HTTP 403)');

  // --- TEST 16: SZM Cannot Bulk Assign Leads ---
  console.log('\n--- TEST 16: SZM Cannot Bulk Assign Leads ---');
  const bulkAttempt = await fetch(`${BASE_URL}/leads/bulk-assign`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({
      leadIds: [createdLeadId, unrelatedLead._id],
      targetStaffId: szmUser2._id.toString()
    })
  });
  assert(bulkAttempt.status === 403, 'TEST 16 - SZM blocked from POST /api/leads/bulk-assign (HTTP 403)');

  // --- TEST 17 & 18: SZM Cannot Tamper with createdBy or assignment fields ---
  console.log('\n--- TEST 17 & 18: SZM Cannot Modify createdBy or Assignment Fields ---');
  // Attempt to change createdBy or assignedCounsellor via update
  const tamperRes = await fetch(`${BASE_URL}/leads/${createdLeadId}`, {
    method: 'PUT',
    headers: szmHeaders,
    body: JSON.stringify({
      createdBy: szmUser2._id.toString(),
      assignedCounsellor: szmUser2._id.toString()
    })
  });
  assert(tamperRes.status === 200, 'TEST 17 - PUT /api/leads/:id accepts valid payload');
  const verifyLead = await Lead.findById(createdLeadId);
  assert(verifyLead.createdBy.toString() === szmUser._id.toString(), 'TEST 17 - createdBy was NOT overwritten');
  assert(!verifyLead.assignedCounsellor, 'TEST 18 - assignedCounsellor was NOT overwritten via updateLead');

  // Attempt to assign lead during creation as SZM
  const createWithAssign = await fetch(`${BASE_URL}/leads`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({
      studentName: 'Attempt Assign On Create',
      parentName: 'Parent Tamper',
      phone: '9123456799',
      classInterested: 'Class 9',
      academicYear: '2026-2027',
      assignedCounsellor: szmUser2._id.toString(),
      targetStaffId: szmUser2._id.toString()
    })
  });
  const createWithAssignData = await createWithAssign.json();
  const verifyNewLead = await Lead.findById(createWithAssignData.data._id);
  assert(!verifyNewLead.assignedCounsellor, 'TEST 18 - SZM cannot assign a lead during creation');

  // --- TEST 19: SZM Blocked from User Management ---
  console.log('\n--- TEST 19: SZM Blocked from User Management ---');
  const createUserRes = await fetch(`${BASE_URL}/settings/users`, {
    method: 'POST',
    headers: szmHeaders,
    body: JSON.stringify({ name: 'Hacker', email: 'hacker@test.com', role: 'Admin', password: 'pass' })
  });
  assert(createUserRes.status === 403, 'TEST 19 - SZM blocked from POST /api/settings/users (HTTP 403)');

  const updateUserRes = await fetch(`${BASE_URL}/settings/users/${szmUser._id}`, {
    method: 'PUT',
    headers: szmHeaders,
    body: JSON.stringify({ role: 'Super Admin' })
  });
  assert(updateUserRes.status === 403, 'TEST 19 - SZM blocked from PUT /api/settings/users/:id (HTTP 403)');

  // --- TEST 20: SZM Blocked from System Settings ---
  console.log('\n--- TEST 20: SZM Blocked from System Settings ---');
  const putSettingsRes = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: szmHeaders,
    body: JSON.stringify({ schoolName: 'Compromised School' })
  });
  assert(putSettingsRes.status === 403, 'TEST 20 - SZM blocked from PUT /api/settings (HTTP 403)');

  const regenKeyRes = await fetch(`${BASE_URL}/settings/regenerate-api-key`, {
    method: 'POST',
    headers: szmHeaders
  });
  assert(regenKeyRes.status === 403, 'TEST 20 - SZM blocked from /api/settings/regenerate-api-key (HTTP 403)');

  const auditRes = await fetch(`${BASE_URL}/settings/audit-logs`, {
    headers: szmHeaders
  });
  assert(auditRes.status === 403, 'TEST 20 - SZM blocked from /api/settings/audit-logs (HTTP 403)');

  // --- TEST 21: SZM Blocked from Google/Meta Integration Config ---
  console.log('\n--- TEST 21: SZM Blocked from Google & Meta Technical Config ---');
  const googleConfigRes = await fetch(`${BASE_URL}/google/config`, { headers: szmHeaders });
  assert(googleConfigRes.status === 403, 'TEST 21 - SZM blocked from GET /api/google/config (HTTP 403)');

  const metaLogsRes = await fetch(`${BASE_URL}/meta/webhook-logs`, { headers: szmHeaders });
  assert(metaLogsRes.status === 403, 'TEST 21 - SZM blocked from GET /api/meta/webhook-logs (HTTP 403)');

  // --- TEST 22: SZM Blocked from Deleting Leads ---
  console.log('\n--- TEST 22: SZM Blocked from Deleting Leads ---');
  const deleteLeadRes = await fetch(`${BASE_URL}/leads/${createdLeadId}`, {
    method: 'DELETE',
    headers: szmHeaders
  });
  assert(deleteLeadRes.status === 403, 'TEST 22 - SZM blocked from DELETE /api/leads/:id (HTTP 403)');

  // --- TEST 23: Existing CGO Functionality Maintained ---
  console.log('\n--- TEST 23: Existing CGO Functionality Maintained ---');
  // CGO sees organization-wide leads
  const cgoLeadsRes = await fetch(`${BASE_URL}/leads?limit=100`, { headers: cgoHeaders });
  const cgoLeadsData = await cgoLeadsRes.json();
  assert(cgoLeadsRes.status === 200, 'TEST 23 - CGO accesses organization-wide leads HTTP 200 OK');
  assert(cgoLeadsData.count >= 2, 'TEST 23 - CGO sees multiple leads across all staff');

  // CGO can reassign lead to another SZM
  const cgoReassignRes = await fetch(`${BASE_URL}/leads/${createdLeadId}/assign`, {
    method: 'POST',
    headers: cgoHeaders,
    body: JSON.stringify({ targetStaffId: szmUser2._id.toString() })
  });
  const cgoReassignData = await cgoReassignRes.json();
  assert(cgoReassignRes.status === 200, 'TEST 23 - CGO can reassign SZM-created lead HTTP 200 OK');
  assert(cgoReassignData.data.assignedCounsellor.toString() === szmUser2._id.toString(), 'TEST 23 - Lead re-allocated to second SZM');

  // --- TEST 24: Existing SUPER_USER Access Maintained ---
  console.log('\n--- TEST 24: Existing SUPER_USER Access Maintained ---');
  const superAuditRes = await fetch(`${BASE_URL}/settings/audit-logs`, { headers: superHeaders });
  assert(superAuditRes.status === 200, 'TEST 24 - SUPER_USER accesses /api/settings/audit-logs HTTP 200 OK');

  // --- TEST 25: Meta Webhook Ingestion Still Works ---
  console.log('\n--- TEST 25: Meta Webhook Ingestion Preserved ---');
  const verifyToken = process.env.META_VERIFY_TOKEN || 'cohen_verify_token_2026';
  const metaWebhookRes = await fetch(`${BASE_URL}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=test_challenge_12345`);
  const metaChallenge = await metaWebhookRes.text();
  assert(metaWebhookRes.status === 200, 'TEST 25 - Meta webhook verification GET /api/webhooks/meta returns 200');
  assert(metaChallenge === 'test_challenge_12345', 'TEST 25 - Meta webhook echoes challenge string');

  // --- TEARDOWN & RESET ---
  console.log('\n--- TEARDOWN: Resetting all test accounts to initial mobile passwords ---');
  // Clean up created test leads
  await Lead.deleteMany({ phone: { $in: ['9123456781', '9988776651', '9988776652', '9123456799'] } });
  await Call.deleteMany({ notes: /interested in campus tour|hacking attempt/i });
  await Note.deleteMany({ text: /olympiads/i });
  await FollowUp.deleteMany({ notes: /campus visit/i });

  // Reset passwords
  for (const acc of accountsToReset) {
    const hash = await bcrypt.hash(acc.mobile, salt);
    await User.updateOne(
      { email: acc.email },
      { $set: { password: hash, mustChangePassword: true, isActive: true, status: 'Active' } }
    );
  }
  console.log('Teardown complete. All test accounts restored to initial mobile passwords with mustChangePassword = true.\n');

  console.log('====================================================');
  console.log(`SZM TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error running SZM tests:', err);
  process.exit(1);
});
