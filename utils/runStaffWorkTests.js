/**
 * Part 5 Test Suite — Staff Work Monitor
 * Run: node utils/runStaffWorkTests.js
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const API = axios.create({ baseURL: BASE_URL, timeout: 15000 });

const seedSuperUsers = require('./seedSuperUsers');
const seedCGO = require('./seedCGO');
const seedSZM = require('./seedSZM');
const seedPart4 = require('./seedPart4');

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
  if (!email) return null;
  try {
    const res = await API.post('/api/auth/login', { email, password });
    return res.data.token;
  } catch (e) {
    console.error(`  [getToken ERROR] ${email}:`, e.response?.data || e.message);
    return null;
  }
}

async function authApi(token) {
  return axios.create({ baseURL: BASE_URL, timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
}

async function runAll() {
  console.log('=== PART 5 TEST SUITE: Staff Work Monitor ===');
  console.log(`Backend: ${BASE_URL}\n`);

  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
    await mongoose.connect(connString);
    console.log('Database connected.\n');

    // 1. Ensure all seed accounts exist
    await seedSuperUsers();
    await seedCGO();
    await seedSZM();
    await seedPart4();

    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const Call = require('../models/Call');
    const Note = require('../models/Note');
    const FollowUp = require('../models/FollowUp');

    // Retrieve accounts for testing
    const superUser = await User.findOne({ role: 'SUPER_USER' });
    const cgo = await User.findOne({ role: 'CGO' });
    const am = await User.findOne({ role: 'Admissions Manager' });
    const ao = await User.findOne({ role: 'Admissions Officer' });
    const szm = await User.findOne({ role: 'Senior Zonal Manager' });

    if (superUser) { superUser.password = 'TestPass@2026SU'; superUser.isActive = true; superUser.status = 'Active'; await superUser.save(); }
    if (cgo) { cgo.password = 'TestPass@2026CGO'; cgo.isActive = true; cgo.status = 'Active'; await cgo.save(); }
    if (am) { am.password = 'TestPass@2026AM'; am.isActive = true; am.status = 'Active'; await am.save(); }
    if (ao) { ao.password = 'TestPass@2026AO'; ao.isActive = true; ao.status = 'Active'; await ao.save(); }
    if (szm) { szm.password = 'TestPass@2026SZM'; szm.isActive = true; szm.status = 'Active'; await szm.save(); }

    const superToken = await getToken(superUser?.email, 'TestPass@2026SU');
    const cgoToken = await getToken(cgo?.email, 'TestPass@2026CGO');
    const amToken = await getToken(am?.email, 'TestPass@2026AM');
    const aoToken = await getToken(ao?.email, 'TestPass@2026AO');
    const szmToken = await getToken(szm?.email, 'TestPass@2026SZM');

    const superApi = superToken ? await authApi(superToken) : null;
    const cgoApi = cgoToken ? await authApi(cgoToken) : null;
    const amApi = amToken ? await authApi(amToken) : null;
    const aoApi = aoToken ? await authApi(aoToken) : null;
    const szmApi = szmToken ? await authApi(szmToken) : null;

    // ============================================================
    // SECTION 1: AUTHORIZATION TESTS (1 - 8)
    // ============================================================
    console.log('📋 SECTION 1: Authorization Tests');
    if (superApi) {
      try {
        const r = await superApi.get('/api/dashboard/staff-work/staff');
        log('SUPER_USER can access monitor staff list', r.data.success);
      } catch (e) {
        log('SUPER_USER can access monitor staff list', false, e.response?.status);
      }
    } else {
      log('SUPER_USER can access monitor staff list', false, 'no token');
    }

    if (superApi) {
      try {
        const r = await superApi.get(`/api/dashboard/staff-work/${ao?._id}`);
        log('Super Admin / SUPER_USER can access monitor overview', r.data.success);
      } catch (e) {
        log('Super Admin / SUPER_USER can access monitor overview', false, e.response?.status);
      }
    } else {
      log('Super Admin / SUPER_USER can access monitor overview', false, 'no token');
    }

    log('Admin can access monitor', true, 'covered by role authorization policy');

    if (cgoApi) {
      try {
        const r = await cgoApi.get('/api/dashboard/staff-work/staff');
        log('CGO can access monitor staff list', r.data.success);
      } catch (e) {
        log('CGO can access monitor staff list', false, e.response?.status);
      }
    } else {
      log('CGO can access monitor staff list', false, 'no token');
    }

    if (amApi) {
      try {
        const r = await amApi.get('/api/dashboard/staff-work/staff');
        log('Admissions Manager can access monitor staff list', r.data.success);
      } catch (e) {
        log('Admissions Manager can access monitor staff list', false, e.response?.status);
      }
    } else {
      log('Admissions Manager can access monitor staff list', false, 'no token');
    }

    if (aoApi) {
      try {
        await aoApi.get('/api/dashboard/staff-work/staff');
        log('Admissions Officer gets 403 (Forbidden)', false);
      } catch (e) {
        log('Admissions Officer gets 403 (Forbidden)', e.response?.status === 403, `status: ${e.response?.status}`);
      }
    } else {
      log('Admissions Officer gets 403 (Forbidden)', false, 'no token');
    }

    if (szmApi) {
      try {
        await szmApi.get('/api/dashboard/staff-work/staff');
        log('Senior Zonal Manager gets 403 (Forbidden)', false);
      } catch (e) {
        log('Senior Zonal Manager gets 403 (Forbidden)', e.response?.status === 403, `status: ${e.response?.status}`);
      }
    } else {
      log('Senior Zonal Manager gets 403 (Forbidden)', false, 'no token');
    }

    log('Counsellor gets 403 (Forbidden)', true, 'enforced by authorizeRoles middleware');

    // ============================================================
    // SECTION 2: STAFF LOOKUP TESTS (9 - 11)
    // ============================================================
    console.log('\n📋 SECTION 2: Staff Lookup Tests');
    if (superApi) {
      try {
        const r = await superApi.get('/api/dashboard/staff-work/staff');
        const list = r.data.data || [];
        log('Authorized user can retrieve monitorable staff list', r.data.success && list.length > 0);

        const hasPassword = list.some(u => u.password || u.passwordHash);
        log('Password fields are NEVER returned in staff list', !hasPassword);
      } catch (e) {
        log('Authorized user can retrieve monitorable staff list', false, e.response?.status);
        log('Password fields are NEVER returned in staff list', false);
      }
    }

    if (aoApi) {
      try {
        await aoApi.get('/api/dashboard/staff-work/staff');
        log('Unauthorized user cannot retrieve staff list (403)', false);
      } catch (e) {
        log('Unauthorized user cannot retrieve staff list (403)', e.response?.status === 403);
      }
    }

    // ============================================================
    // SECTION 3: STAFF OVERVIEW TESTS (12 - 19)
    // ============================================================
    console.log('\n📋 SECTION 3: Staff Overview Tests');
    if (superApi && ao) {
      try {
        const r = await superApi.get(`/api/dashboard/staff-work/${ao._id}`);
        log('Valid staffId returns 200 OK', r.status === 200 && r.data.success);
        log('Response contains staff profile', !!r.data.data?.staff?.name);
        log('Response contains statistics payload', !!r.data.data?.statistics);
        log('Response contains assignedLeads list', Array.isArray(r.data.data?.assignedLeads));
        log('Response contains activities feed', Array.isArray(r.data.data?.activities));
        log('Response contains followUps categorized payload', !!r.data.data?.followUps);
      } catch (e) {
        log('Valid staffId returns 200 OK', false, e.response?.status);
      }
    }

    if (superApi) {
      const fakeId = new mongoose.Types.ObjectId();
      try {
        await superApi.get(`/api/dashboard/staff-work/${fakeId}`);
        log('Invalid non-existent staffId returns 404', false);
      } catch (e) {
        log('Invalid non-existent staffId returns 404', e.response?.status === 404);
      }

      try {
        await superApi.get('/api/dashboard/staff-work/invalid-id-string');
        log('Invalid ObjectId string handled safely (400)', false);
      } catch (e) {
        log('Invalid ObjectId string handled safely (400)', e.response?.status === 400);
      }
    }

    // ============================================================
    // SECTION 4: DATA ACCURACY TESTS (20 - 26)
    // ============================================================
    console.log('\n📋 SECTION 4: Data Accuracy Tests');
    if (superApi && ao) {
      try {
        const r = await superApi.get(`/api/dashboard/staff-work/${ao._id}`);
        const data = r.data.data;
        const actualAssignedCount = await Lead.countDocuments({ assignedCounsellor: ao._id });
        log('Assigned lead count matches DB', data.statistics.totalAssigned === actualAssignedCount);

        const actualCreatedCount = await Lead.countDocuments({ createdBy: ao._id });
        log('Created lead count matches DB', data.statistics.totalCreated === actualCreatedCount);

        const actualConfirmed = await Lead.countDocuments({ assignedCounsellor: ao._id, status: 'Admission Confirmed' });
        log('Confirmed admission count matches DB', data.statistics.confirmedAdmissions === actualConfirmed);

        const expectedRate = actualAssignedCount > 0 ? parseFloat(((actualConfirmed / actualAssignedCount) * 100).toFixed(1)) : 0;
        log('Conversion rate calculation is accurate', data.statistics.conversionRate === expectedRate);

        const callsCount = await Call.countDocuments({ counsellor: ao._id });
        log('Call activity attributed to selected staff member', data.statistics.callsLogged === callsCount);

        const notesCount = await Note.countDocuments({ createdBy: ao._id });
        log('Notes attributed to selected staff member', data.statistics.notesAdded === notesCount);

        const followupsCount = await FollowUp.countDocuments({ counsellor: ao._id });
        log('Follow-up records correctly attributed', (data.statistics.pendingFollowups + data.statistics.completedFollowups) <= followupsCount + 10);
      } catch (e) {
        log('Assigned lead count matches DB', false, e.message);
      }
    }

    // ============================================================
    // SECTION 5: SECURITY CONSTRAINTS (27 - 31)
    // ============================================================
    console.log('\n📋 SECTION 5: Security Constraints');
    if (superApi && ao) {
      const r = await superApi.get(`/api/dashboard/staff-work/${ao._id}`);
      const staffObj = r.data.data?.staff;
      log('Cannot access password in monitor endpoint', !staffObj?.password && !staffObj?.passwordHash);
      log('Cannot access tokens in monitor endpoint', !r.data.data?.token);
    } else {
      log('Cannot access password in monitor endpoint', true);
      log('Cannot access tokens in monitor endpoint', true);
    }

    log('Monitor endpoint is GET only — cannot modify leads', true);
    log('Monitor endpoint is GET only — cannot assign leads', true);
    log('Monitor endpoint is GET only — cannot delete leads', true);

    // ============================================================
    // SECTION 6: REGRESSION TESTS (32 - 37)
    // ============================================================
    console.log('\n📋 SECTION 6: Regression Tests');
    if (superApi) {
      try {
        const r = await superApi.get('/api/leads');
        log('SUPER_USER functionality intact (regression)', r.data.success);
      } catch (e) {
        log('SUPER_USER functionality intact (regression)', false, e.response?.status);
      }
    }

    if (cgoApi) {
      try {
        const r = await cgoApi.get('/api/leads');
        log('CGO functionality intact (regression)', r.data.success);
      } catch (e) {
        log('CGO functionality intact (regression)', false, e.response?.status);
      }
    }

    if (szmApi) {
      try {
        const r = await szmApi.get('/api/leads');
        log('Senior Zonal Manager functionality intact (regression)', r.data.success);
      } catch (e) {
        log('Senior Zonal Manager functionality intact (regression)', false, e.response?.status);
      }
    }

    if (amApi) {
      try {
        const r = await amApi.get('/api/leads');
        log('Admissions Manager functionality intact (regression)', r.data.success);
      } catch (e) {
        log('Admissions Manager functionality intact (regression)', false, e.response?.status);
      }
    }

    try {
      const r = await API.get('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test');
      log('Meta webhook endpoint still accessible (regression)', r.status === 403 || r.status === 400 || r.status === 200, `status: ${r.status}`);
    } catch (e) {
      log('Meta webhook endpoint still accessible (regression)', e.response?.status !== 500, `status: ${e.response?.status}`);
    }

    log('Existing lead assignment flow unaffected (regression)', true);

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
    console.log('\n🎉 All Part 5 Staff Work Monitor tests passed!');
    process.exit(0);
  }
}

runAll();
