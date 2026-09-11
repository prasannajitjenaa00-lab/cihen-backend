require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Timeline = require('../models/Timeline');
const seedCGO = require('./seedCGO');
const seedSuperUsers = require('./seedSuperUsers');

const BASE_URL = 'http://localhost:5000/api';

let passed = 0;
let failed = 0;

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
  console.log('STARTING COHEN CRM CGO ROLE & ACCESS TEST SUITE');
  console.log('====================================================\n');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Ensure Super Users and CGO are seeded
  await seedSuperUsers();
  await seedCGO();

  // Reset CGO to initial state for testing
  const cgoMobile = '9777440467';
  const cgoEmail = 'srinivas.dash@coheninternationalschool.com';
  const salt = await bcrypt.genSalt(10);
  const hashedMobile = await bcrypt.hash(cgoMobile, salt);

  await User.updateOne(
    { email: cgoEmail },
    {
      $set: {
        password: hashedMobile,
        mustChangePassword: true,
        isActive: true,
        status: 'Active',
        role: 'CGO',
        designation: 'Chief Growth Officer'
      }
    }
  );

  const superUsers = [
    { email: 'chairman@coheninternationalschool.com', mobile: '9439112233' },
    { email: 'vicechairman@coheninternationalschool.com', mobile: '8093770221' },
    { email: 'secretary@coheninternationalschool.com', mobile: '8249112840' }
  ];
  for (const u of superUsers) {
    const hash = await bcrypt.hash(u.mobile, salt);
    await User.updateOne({ email: u.email }, { $set: { password: hash, mustChangePassword: true, isActive: true, status: 'Active' } });
  }

  console.log('CGO and Super Users reset to initial mobile password. Running test suite...\n');

  // Fetch counsellors / staff for testing assignments
  const counsellor1 = await User.findOne({ role: 'Counsellor', status: 'Active' });
  const counsellor2 = await User.findOne({ role: 'Counsellor', status: 'Active', _id: { $ne: counsellor1?._id } });
  const admissionStaff = await User.findOne({ role: 'Admission Staff' });
  const superUser = await User.findOne({ role: 'SUPER_USER' });

  // Get test leads
  const testLeads = await Lead.find().limit(5);

  let cgoToken = '';

  // --- TEST 1: CGO First Login ---
  console.log('--- RUNNING TEST 1: CGO First Login ---');
  const loginRes1 = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cgoEmail, password: cgoMobile })
  });
  const loginData1 = await loginRes1.json();
  assert(loginRes1.status === 200, 'TEST 1 - HTTP Status 200 OK');
  assert(loginData1.success === true, 'TEST 1 - success === true');
  assert(!!loginData1.token, 'TEST 1 - JWT token received');
  assert(loginData1.user?.role === 'CGO', 'TEST 1 - user.role === CGO');
  assert(loginData1.user?.designation === 'Chief Growth Officer', 'TEST 1 - user.designation === Chief Growth Officer');
  assert(loginData1.user?.mustChangePassword === true, 'TEST 1 - mustChangePassword === true (routes to /change-password)');
  cgoToken = loginData1.token;

  // --- TEST 2: CGO Password Change Validations ---
  console.log('\n--- RUNNING TEST 2: Password Change Flow & Validations ---');
  // 2a: Mismatched password
  const mismatchRes = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ currentPassword: cgoMobile, newPassword: 'NewPassword@123', confirmPassword: 'DifferentPassword@123' })
  });
  assert(mismatchRes.status === 400, 'TEST 2a - Reject password mismatch (HTTP 400)');

  // 2b: Reusing mobile number as new password
  const reuseMobileRes = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ currentPassword: cgoMobile, newPassword: cgoMobile, confirmPassword: cgoMobile })
  });
  assert(reuseMobileRes.status === 400, 'TEST 2b - Reject new password identical to mobile number (HTTP 400)');

  // 2c: Password under 6 characters
  const shortPassRes = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ currentPassword: cgoMobile, newPassword: '123', confirmPassword: '123' })
  });
  assert(shortPassRes.status === 400, 'TEST 2c - Reject new password < 6 characters (HTTP 400)');

  // 2d: Successful password change
  const newCgoPassword = 'CgoGrowth@2026!';
  const changeRes = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ currentPassword: cgoMobile, newPassword: newCgoPassword, confirmPassword: newCgoPassword })
  });
  const changeData = await changeRes.json();
  assert(changeRes.status === 200, 'TEST 2d - Password changed successfully (HTTP 200)');
  assert(changeData.user?.mustChangePassword === false, 'TEST 2d - user.mustChangePassword updated to false');

  // --- TEST 3: CGO Subsequent Login ---
  console.log('\n--- RUNNING TEST 3: CGO Subsequent Login ---');
  // 3a: Old mobile rejected
  const oldLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cgoEmail, password: cgoMobile })
  });
  assert(oldLoginRes.status === 401, 'TEST 3a - Login with old mobile password rejected (HTTP 401)');

  // 3b: Login with new password
  const newLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cgoEmail, password: newCgoPassword })
  });
  const newLoginData = await newLoginRes.json();
  assert(newLoginRes.status === 200, 'TEST 3b - Login with new password successful (HTTP 200)');
  assert(newLoginData.user?.mustChangePassword === false, 'TEST 3b - user.mustChangePassword === false (routes to /dashboard)');
  cgoToken = newLoginData.token;

  // --- TEST 4: CGO All-Lead & Operational Visibility ---
  console.log('\n--- RUNNING TEST 4: Organization-Wide Lead Visibility ---');
  // 4a: View ALL leads
  const leadsRes = await fetch(`${BASE_URL}/leads`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  const leadsData = await leadsRes.json();
  assert(leadsRes.status === 200, 'TEST 4a - CGO GET /api/leads returns 200 OK');
  assert(leadsData.data?.length > 0, `TEST 4a - CGO has organization-wide lead visibility (${leadsData.data?.length} leads loaded)`);

  // 4b: Search & filter leads
  const filterRes = await fetch(`${BASE_URL}/leads?status=New`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  const filterData = await filterRes.json();
  assert(filterRes.status === 200, 'TEST 4b - CGO filter /api/leads?status=New returns 200 OK');

  // 4c: View single lead details + timeline
  const singleLeadId = testLeads[0]._id.toString();
  const leadDetailRes = await fetch(`${BASE_URL}/leads/${singleLeadId}`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  const leadDetailData = await leadDetailRes.json();
  assert(leadDetailRes.status === 200, 'TEST 4c - CGO GET /api/leads/:id returns 200 OK');
  assert(!!leadDetailData.data?.lead, 'TEST 4c - Lead details retrieved');
  assert(Array.isArray(leadDetailData.data?.timeline), 'TEST 4c - Lead timeline retrieved');

  // 4d: Follow-ups organization-wide
  const followupsRes = await fetch(`${BASE_URL}/followups`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(followupsRes.status === 200, 'TEST 4d - CGO GET /api/followups returns 200 OK');

  // 4e: Admissions & Students
  const admissionsRes = await fetch(`${BASE_URL}/admissions`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(admissionsRes.status === 200, 'TEST 4e - CGO GET /api/admissions returns 200 OK');

  const studentsRes = await fetch(`${BASE_URL}/students`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(studentsRes.status === 200, 'TEST 4f - CGO GET /api/students returns 200 OK');

  // 4g: Dashboard stats & charts
  const statsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(statsRes.status === 200, 'TEST 4g - CGO GET /api/dashboard/stats returns 200 OK');

  // --- TEST 5: Single Lead Allocation & Reassignment ---
  console.log('\n--- RUNNING TEST 5: Lead Allocation & Reassignment ---');
  // 5a: Allocate lead using targetStaffId
  const assignRes = await fetch(`${BASE_URL}/leads/${singleLeadId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ targetStaffId: counsellor1._id.toString() })
  });
  const assignData = await assignRes.json();
  assert(assignRes.status === 200, 'TEST 5a - CGO allocate lead with targetStaffId returns 200 OK');
  assert(assignData.data?.assignedCounsellor === counsellor1._id.toString(), 'TEST 5a - Lead assigned to target staff');

  // 5b: Reassign lead to another staff member (counsellor 2 or admission staff)
  const reassignTarget = counsellor2 || admissionStaff;
  const reassignRes = await fetch(`${BASE_URL}/leads/${singleLeadId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ targetStaffId: reassignTarget._id.toString() })
  });
  assert(reassignRes.status === 200, 'TEST 5b - CGO reassign lead returns 200 OK');

  // Verify timeline recorded
  const lastTimeline = await Timeline.findOne({ lead: singleLeadId, eventType: 'Assigned' }).sort({ createdAt: -1 });
  assert(lastTimeline?.message?.includes('re-assigned') || lastTimeline?.message?.includes('assigned'), 'TEST 5c - Assignment timeline event logged');

  // 5d: Reject assigning to SUPER_USER
  if (superUser) {
    const superAssignRes = await fetch(`${BASE_URL}/leads/${singleLeadId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
      body: JSON.stringify({ targetStaffId: superUser._id.toString() })
    });
    assert(superAssignRes.status === 400, 'TEST 5d - Reject allocating lead to SUPER_USER (HTTP 400)');
  }

  // --- TEST 6: Bulk Lead Allocation ---
  console.log('\n--- RUNNING TEST 6: Bulk Lead Allocation ---');
  const bulkLeadIds = testLeads.slice(0, 3).map(l => l._id.toString());
  const bulkRes = await fetch(`${BASE_URL}/leads/bulk-assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({
      leadIds: bulkLeadIds,
      targetStaffId: counsellor1._id.toString()
    })
  });
  const bulkData = await bulkRes.json();
  assert(bulkRes.status === 200, 'TEST 6a - POST /api/leads/bulk-assign returns 200 OK');
  assert(bulkData.count === bulkLeadIds.length, `TEST 6a - Correct count of leads allocated (${bulkData.count})`);

  // Verify all leads updated in DB
  const updatedLeadsCount = await Lead.countDocuments({
    _id: { $in: bulkLeadIds },
    assignedCounsellor: counsellor1._id
  });
  assert(updatedLeadsCount === bulkLeadIds.length, 'TEST 6b - All leads in bulk batch successfully updated in DB');

  // 6c: Reject bulk allocation without required fields
  const badBulkRes = await fetch(`${BASE_URL}/leads/bulk-assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ leadIds: [] })
  });
  assert(badBulkRes.status === 400, 'TEST 6c - Reject empty bulk allocation request (HTTP 400)');

  // --- TEST 7: Restricted Routes Enforcement (HTTP 403) ---
  console.log('\n--- RUNNING TEST 7: Restricted Access Enforcement (HTTP 403) ---');
  // 7a: Settings update
  const settingsRes = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ schoolName: 'Hacked Name' })
  });
  assert(settingsRes.status === 403, 'TEST 7a - CGO blocked from PUT /api/settings (HTTP 403)');

  // 7b: Regenerate Website API key
  const regenKeyRes = await fetch(`${BASE_URL}/settings/regenerate-api-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(regenKeyRes.status === 403, 'TEST 7b - CGO blocked from /api/settings/regenerate-api-key (HTTP 403)');

  // 7c: Audit Logs
  const auditRes = await fetch(`${BASE_URL}/settings/audit-logs`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(auditRes.status === 403, 'TEST 7c - CGO blocked from /api/settings/audit-logs (HTTP 403)');

  // 7d: Lead Deletion
  const deleteRes = await fetch(`${BASE_URL}/leads/${singleLeadId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(deleteRes.status === 403, 'TEST 7d - CGO blocked from DELETE /api/leads/:id (HTTP 403)');

  // 7e: Meta Webhook raw logs
  const metaRes = await fetch(`${BASE_URL}/meta/webhook-logs`, {
    headers: { Authorization: `Bearer ${cgoToken}` }
  });
  assert(metaRes.status === 403, 'TEST 7e - CGO blocked from /api/meta/webhook-logs (HTTP 403)');

  // 7f: Staff account creation
  const createUserRes = await fetch(`${BASE_URL}/settings/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cgoToken}` },
    body: JSON.stringify({ name: 'Test User', email: 'test_fake@school.com', password: 'password123', role: 'Counsellor' })
  });
  assert(createUserRes.status === 403, 'TEST 7f - CGO blocked from POST /api/settings/users (HTTP 403)');

  // --- TEST 8: Confirm SUPER_USER Still Has Full Access ---
  console.log('\n--- RUNNING TEST 8: SUPER_USER Complete Access Confirmation ---');
  // Login as Chairman
  const chairmanRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'chairman@coheninternationalschool.com', password: '9439112233' })
  });
  const chairmanData = await chairmanRes.json();
  const superToken = chairmanData.token;
  assert(chairmanRes.status === 200, 'TEST 8a - Chairman SUPER_USER login 200 OK');

  // SUPER_USER accesses audit logs (200 OK)
  const superAuditRes = await fetch(`${BASE_URL}/settings/audit-logs`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert(superAuditRes.status === 200, 'TEST 8b - SUPER_USER accesses /api/settings/audit-logs (HTTP 200)');

  // SUPER_USER accesses meta webhook logs (200 OK)
  const superMetaRes = await fetch(`${BASE_URL}/meta/webhook-logs`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert(superMetaRes.status === 200, 'TEST 8c - SUPER_USER accesses /api/meta/webhook-logs (HTTP 200)');

  // SUPER_USER accesses bulk allocate (200 OK)
  const superBulkRes = await fetch(`${BASE_URL}/leads/bulk-assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
    body: JSON.stringify({ leadIds: [testLeads[0]._id.toString()], targetStaffId: counsellor1._id.toString() })
  });
  assert(superBulkRes.status === 200, 'TEST 8d - SUPER_USER can use bulk lead allocation (HTTP 200)');

  // --- TEST 9: Counsellor Role Restriction Preserved ---
  console.log('\n--- RUNNING TEST 9: Counsellor Restriction Preservation ---');
  // Login as Counsellor (Rahul)
  const counsellorRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rahul@cohenschool.com', password: 'password123' })
  });
  const counsellorData = await counsellorRes.json();
  if (counsellorData.token) {
    // Counsellor should NOT be able to allocate leads
    const cAssignRes = await fetch(`${BASE_URL}/leads/${singleLeadId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${counsellorData.token}` },
      body: JSON.stringify({ targetStaffId: counsellor2?._id?.toString() || counsellor1._id.toString() })
    });
    assert(cAssignRes.status === 403, 'TEST 9a - Counsellor blocked from allocating leads (HTTP 403)');

    // Counsellor blocked from bulk allocation
    const cBulkRes = await fetch(`${BASE_URL}/leads/bulk-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${counsellorData.token}` },
      body: JSON.stringify({ leadIds: bulkLeadIds, targetStaffId: counsellor1._id.toString() })
    });
    assert(cBulkRes.status === 403, 'TEST 9b - Counsellor blocked from bulk lead allocation (HTTP 403)');
  }

  // Reset all test accounts back to initial mobile passwords with mustChangePassword=true
  const allAccounts = [
    { email: 'chairman@coheninternationalschool.com', mobile: '9439112233' },
    { email: 'vicechairman@coheninternationalschool.com', mobile: '8093770221' },
    { email: 'secretary@coheninternationalschool.com', mobile: '8249112840' },
    { email: cgoEmail, mobile: cgoMobile }
  ];
  for (const a of allAccounts) {
    const hash = await bcrypt.hash(a.mobile, salt);
    await User.updateOne({ email: a.email }, { $set: { password: hash, mustChangePassword: true, isActive: true, status: 'Active' } });
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test execution crashed:', e);
  process.exit(1);
});
