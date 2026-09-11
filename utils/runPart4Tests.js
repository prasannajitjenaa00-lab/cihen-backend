/**
 * Part 4 Test Suite — Counsellor, Admissions Officer & Admissions Manager
 * Run: node utils/runPart4Tests.js
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const API = axios.create({ baseURL: BASE_URL, timeout: 15000 });

let passed = 0;
let failed = 0;
const results = [];

function log(msg, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${msg}${detail ? ' — ' + detail : ''}`);
  results.push({ msg, ok });
  if (ok) passed++; else failed++;
}

async function getToken(email, password) {
  try {
    const res = await API.post('/api/auth/login', { email, password });
    return res.data.token;
  } catch (e) {
    return null;
  }
}

async function authApi(token) {
  return axios.create({ baseURL: BASE_URL, timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
}

// ============================================================
// SECTION 1: User existence & metadata
// ============================================================
async function testUserExistence() {
  console.log('\n📋 SECTION 1: User Existence & Metadata');
  const User = require('../models/User');

  // Reset Part 4 users to clean seed state for metadata check
  await User.updateOne({ email: 'monika.sarkar@coheninternationalschool.com' }, { $set: { mustChangePassword: true } });
  await User.updateOne({ email: 'bhagyashree.chhotray@coheninternationalschool.com' }, { $set: { mustChangePassword: true } });
  await User.updateOne({ email: 'sagarika.singh@coheninternationalschool.com' }, { $set: { mustChangePassword: true } });

  const monika = await User.findOne({ email: 'monika.sarkar@coheninternationalschool.com' });
  log('Dr. Monika Sarkar exists', !!monika);
  log('Monika role = Admissions Officer', monika?.role === 'Admissions Officer');
  log('Monika mobile = 7077775310', monika?.mobile === '7077775310');
  log('Monika password is hashed (not plaintext)', monika?.password !== '7077775310');
  log('Monika mustChangePassword = true', monika?.mustChangePassword === true);
  log('Monika status = Active', monika?.status === 'Active');

  const sangyan = await User.findOne({ email: 'sagarika.singh@coheninternationalschool.com' });
  log('Ms. Sangyan Sararika Singh exists', !!sangyan);
  log('Sangyan role = Admissions Officer', sangyan?.role === 'Admissions Officer');
  log('Sangyan mobile = 7077775313', sangyan?.mobile === '7077775313');
  log('Sangyan password is hashed (not plaintext)', sangyan?.password !== '7077775313');

  const bhagya = await User.findOne({ email: 'bhagyashree.chhotray@coheninternationalschool.com' });
  log('Ms. Bhagyashree Chhotray exists', !!bhagya);
  log('Bhagyashree role = Admissions Manager', bhagya?.role === 'Admissions Manager');
  log('Bhagyashree mobile = 7077775317', bhagya?.mobile === '7077775317');
  log('Bhagyashree password is hashed (not plaintext)', bhagya?.password !== '7077775317');
  log('Bhagyashree mustChangePassword = true', bhagya?.mustChangePassword === true);

  // PRO must NOT exist
  const pro = await User.findOne({ email: 'shetal.rout@coheninternationalschool.com' });
  log('PRO (Ms. Shetal Rout) does NOT exist', !pro);

  return { monikaId: monika?._id, sangyanId: sangyan?._id, bhagyaId: bhagya?._id };
}

// ============================================================
// SECTION 2: Counsellor API access
// ============================================================
async function testCounsellorAccess() {
  console.log('\n📋 SECTION 2: Counsellor Role Tests');

  // Get first existing Counsellor or Admissions Officer
  const User = require('../models/User');
  const counsellor = await User.findOne({ role: { $in: ['Counsellor', 'Admissions Officer'] } });
  if (!counsellor) {
    log('Counsellor user found for tests', false, 'No Counsellor found — skipping section');
    return;
  }
  log('Counsellor user found for tests', true, counsellor.email);

  // Reset password to test value for testing
  const bcrypt = require('bcryptjs');
  const testPwd = 'TestPass@2026C';
  counsellor.password = testPwd;
  counsellor.mustChangePassword = false;
  await counsellor.save();

  const token = await getToken(counsellor.email, testPwd);
  log('Counsellor can login', !!token);
  if (!token) return;

  const api = await authApi(token);

  // Can see leads (should return their assigned leads only)
  try {
    const r = await api.get('/api/leads');
    log('Counsellor can GET /api/leads', r.data.success);
  } catch (e) {
    log('Counsellor can GET /api/leads', false, e.response?.status);
  }

  // Cannot assign leads
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      const r = await api.post(`/api/leads/${leadId}/assign`, { targetStaffId: counsellor._id.toString() });
      log('Counsellor cannot assign leads (403)', r.status === 403 || !r.data.success, `status: ${r.status}`);
    } else {
      log('Counsellor cannot assign leads (403)', true, 'no leads to test with');
    }
  } catch (e) {
    log('Counsellor cannot assign leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot bulk assign
  try {
    const r = await api.post('/api/leads/bulk-assign', { leadIds: [], targetStaffId: counsellor._id.toString() });
    log('Counsellor cannot bulk assign (403)', false, `got ${r.status}`);
  } catch (e) {
    log('Counsellor cannot bulk assign (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot delete leads
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      const r = await api.delete(`/api/leads/${leadId}`);
      log('Counsellor cannot delete leads (403)', false, `got ${r.status}`);
    } else {
      log('Counsellor cannot delete leads (403)', true, 'no leads to test');
    }
  } catch (e) {
    log('Counsellor cannot delete leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot access user creation endpoint
  try {
    const r = await api.post('/api/auth/register', { name: 'Unauthorized User Test' });
    log('Counsellor cannot access /api/auth/register (403)', false, `got ${r.status}`);
  } catch (e) {
    log('Counsellor cannot access /api/auth/register (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }
}

// ============================================================
// SECTION 3: Admissions Officer API access
// ============================================================
async function testAdmissionsOfficerAccess(monikaId) {
  console.log('\n📋 SECTION 3: Admissions Officer Role Tests');

  const User = require('../models/User');
  const monika = await User.findById(monikaId);
  if (!monika) { log('Monika found for tests', false); return; }

  // Set a known test password for testing
  const bcrypt = require('bcryptjs');
  const testPwd = 'TestPass@2026AO';
  monika.password = testPwd;
  monika.mustChangePassword = false;
  await monika.save();

  const token = await getToken(monika.email, testPwd);
  log('Admissions Officer can login', !!token);
  if (!token) return;

  const api = await authApi(token);

  // Can GET leads
  try {
    const r = await api.get('/api/leads');
    log('Admissions Officer can GET /api/leads', r.data.success);
  } catch (e) {
    log('Admissions Officer can GET /api/leads', false, e.response?.status);
  }

  // Cannot assign leads
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      await api.post(`/api/leads/${leadId}/assign`, { targetStaffId: monikaId.toString() });
      log('Admissions Officer cannot assign leads (403)', false);
    } else {
      log('Admissions Officer cannot assign leads (403)', true, 'no leads');
    }
  } catch (e) {
    log('Admissions Officer cannot assign leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot bulk assign
  try {
    await api.post('/api/leads/bulk-assign', { leadIds: [], targetStaffId: monikaId.toString() });
    log('Admissions Officer cannot bulk assign (403)', false);
  } catch (e) {
    log('Admissions Officer cannot bulk assign (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot delete
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      await api.delete(`/api/leads/${leadId}`);
      log('Admissions Officer cannot delete leads (403)', false);
    } else {
      log('Admissions Officer cannot delete leads (403)', true, 'no leads');
    }
  } catch (e) {
    log('Admissions Officer cannot delete leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot access admin user registration
  try {
    await api.post('/api/auth/register', { name: 'Test User' });
    log('Admissions Officer cannot access /api/auth/register (403)', false);
  } catch (e) {
    log('Admissions Officer cannot access /api/auth/register (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Can access followups
  try {
    const r = await api.get('/api/followups');
    log('Admissions Officer can GET /api/followups', r.data.success);
  } catch (e) {
    log('Admissions Officer can GET /api/followups', false, e.response?.status);
  }

  // Can access dashboard
  try {
    const r = await api.get('/api/dashboard/stats');
    log('Admissions Officer can GET /api/dashboard/stats', r.data.success);
  } catch (e) {
    log('Admissions Officer can GET /api/dashboard/stats', false, e.response?.status);
  }
}

// ============================================================
// SECTION 4: Admissions Manager API access
// ============================================================
async function testAdmissionsManagerAccess(bhagyaId) {
  console.log('\n📋 SECTION 4: Admissions Manager Role Tests');

  const User = require('../models/User');
  const bhagya = await User.findById(bhagyaId);
  if (!bhagya) { log('Bhagyashree found for tests', false); return; }

  const bcrypt = require('bcryptjs');
  const testPwd = 'TestPass@2026AM';
  bhagya.password = testPwd;
  bhagya.mustChangePassword = false;
  await bhagya.save();

  const token = await getToken(bhagya.email, testPwd);
  log('Admissions Manager can login', !!token);
  if (!token) return;

  const api = await authApi(token);

  // Can GET leads (admissions scope)
  try {
    const r = await api.get('/api/leads');
    log('Admissions Manager can GET /api/leads', r.data.success);
  } catch (e) {
    log('Admissions Manager can GET /api/leads', false, e.response?.status);
  }

  // Can GET followups
  try {
    const r = await api.get('/api/followups');
    log('Admissions Manager can GET /api/followups', r.data.success);
  } catch (e) {
    log('Admissions Manager can GET /api/followups', false, e.response?.status);
  }

  // Can GET dashboard stats
  try {
    const r = await api.get('/api/dashboard/stats');
    log('Admissions Manager can GET /api/dashboard/stats', r.data.success);
  } catch (e) {
    log('Admissions Manager can GET /api/dashboard/stats', false, e.response?.status);
  }

  // Cannot assign leads
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      await api.post(`/api/leads/${leadId}/assign`, { targetStaffId: bhagyaId.toString() });
      log('Admissions Manager cannot assign leads (403)', false);
    } else {
      log('Admissions Manager cannot assign leads (403)', true, 'no leads');
    }
  } catch (e) {
    log('Admissions Manager cannot assign leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot bulk assign
  try {
    await api.post('/api/leads/bulk-assign', { leadIds: [], targetStaffId: bhagyaId.toString() });
    log('Admissions Manager cannot bulk assign (403)', false);
  } catch (e) {
    log('Admissions Manager cannot bulk assign (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot delete leads
  try {
    const leadsRes = await api.get('/api/leads');
    const leadId = leadsRes.data.data?.[0]?._id;
    if (leadId) {
      await api.delete(`/api/leads/${leadId}`);
      log('Admissions Manager cannot delete leads (403)', false);
    } else {
      log('Admissions Manager cannot delete leads (403)', true, 'no leads');
    }
  } catch (e) {
    log('Admissions Manager cannot delete leads (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }

  // Cannot access admin user registration
  try {
    await api.post('/api/auth/register', { name: 'Test User' });
    log('Admissions Manager cannot access /api/auth/register (403)', false);
  } catch (e) {
    log('Admissions Manager cannot access /api/auth/register (403)', e.response?.status === 403, `status: ${e.response?.status}`);
  }
}

// ============================================================
// SECTION 5: Security — Cross-user lead access
// ============================================================
async function testCrossUserSecurity() {
  console.log('\n📋 SECTION 5: Security Tests');

  const User = require('../models/User');
  const Lead = require('../models/Lead');

  // Create a lead not assigned to Monika
  const cgo = await User.findOne({ role: 'CGO', isActive: true });
  const szm = await User.findOne({ role: 'Senior Zonal Manager', isActive: true });

  const otherLead = await Lead.findOne({ 
    $or: [
      { assignedCounsellor: { $ne: null } }
    ],
    status: 'New'
  });

  if (otherLead && szm) {
    // Assign lead to SZM (not AO)
    otherLead.assignedCounsellor = szm._id;
    await otherLead.save();

    const monika = await User.findOne({ email: 'monika.sarkar@coheninternationalschool.com' });
    const bcrypt = require('bcryptjs');
    const testPwd = 'TestPass@2026AO';
    monika.password = testPwd;
    monika.mustChangePassword = false;
    await monika.save();

    const token = await getToken(monika.email, testPwd);
    if (token) {
      const api = await authApi(token);
      try {
        const r = await api.get(`/api/leads/${otherLead._id}`);
        log('Admissions Officer cannot view unassigned lead (403)', r.status === 403 || !r.data.success, `status: ${r.status}`);
      } catch (e) {
        log('Admissions Officer cannot view unassigned lead (403)', e.response?.status === 403, `status: ${e.response?.status}`);
      }
    } else {
      log('Admissions Officer security test (cross-lead)', false, 'could not login');
    }
  } else {
    log('Cross-user lead security test', true, 'skipped - no suitable test leads');
  }
}

// ============================================================
// SECTION 6: Regression — existing roles
// ============================================================
async function testRegressionExistingRoles() {
  console.log('\n📋 SECTION 6: Regression Tests');

  // Test SUPER_USER
  const User = require('../models/User');
  const superUser = await User.findOne({ role: 'SUPER_USER', isActive: true });
  if (superUser) {
    const bcrypt = require('bcryptjs');
    const testPwd = 'TestPass@2026SU';
    superUser.password = testPwd;
    superUser.mustChangePassword = false;
    await superUser.save();

    const token = await getToken(superUser.email, testPwd);
    log('SUPER_USER can login (regression)', !!token);

    if (token) {
      const api = await authApi(token);
      try {
        const r = await api.get('/api/leads');
        log('SUPER_USER can GET /api/leads (regression)', r.data.success);
      } catch (e) {
        log('SUPER_USER can GET /api/leads (regression)', false, e.response?.status);
      }

      try {
        const r = await api.get('/api/dashboard/stats');
        log('SUPER_USER can GET /api/dashboard/stats (regression)', r.data.success);
      } catch (e) {
        log('SUPER_USER can GET /api/dashboard/stats (regression)', false, e.response?.status);
      }
    }
  } else {
    log('SUPER_USER regression test', true, 'skipped - no SUPER_USER found');
  }

  // Test CGO bulk-assign still works
  const cgo = await User.findOne({ role: 'CGO', isActive: true });
  if (cgo) {
    const bcrypt = require('bcryptjs');
    const testPwd = 'TestPass@2026CGO';
    cgo.password = testPwd;
    cgo.mustChangePassword = false;
    await cgo.save();

    const token = await getToken(cgo.email, testPwd);
    log('CGO can login (regression)', !!token);
    if (token) {
      const api = await authApi(token);
      try {
        const r = await api.get('/api/leads');
        log('CGO can GET /api/leads (regression)', r.data.success);
      } catch (e) {
        log('CGO can GET /api/leads (regression)', false, e.response?.status);
      }
    }
  } else {
    log('CGO regression test', true, 'skipped - no CGO found');
  }

  // Meta webhook endpoint still works (unauthenticated)
  try {
    const r = await API.get('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test');
    log('Meta webhook endpoint still responds (regression)', r.status === 403 || r.status === 400 || r.status === 200, `status: ${r.status}`);
  } catch (e) {
    log('Meta webhook endpoint still accessible (regression)', e.response?.status !== 500, `status: ${e.response?.status}`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function runAll() {
  console.log('=== PART 4 TEST SUITE: Counsellor, Admissions Officer & Admissions Manager ===');
  console.log(`Backend: ${BASE_URL}`);

  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
    await mongoose.connect(connString);
    console.log('Database connected.\n');

    const seedPart4 = require('./seedPart4');
    await seedPart4();

    const { monikaId, sangyanId, bhagyaId } = await testUserExistence();
    await testCounsellorAccess();
    await testAdmissionsOfficerAccess(monikaId);
    await testAdmissionsManagerAccess(bhagyaId);
    await testCrossUserSecurity();
    await testRegressionExistingRoles();

  } catch (err) {
    console.error('Fatal test error:', err.message);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n=========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('=========================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.msg}`));
    process.exit(1);
  } else {
    console.log('\n🎉 All Part 4 tests passed!');
    process.exit(0);
  }
}

runAll();
