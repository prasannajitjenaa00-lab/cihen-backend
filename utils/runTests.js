const http = require('http');

const API_BASE = 'http://localhost:5000';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = body ? JSON.stringify(body) : null;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const User = require('../models/User');

async function resetSuperUsersForTesting() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm');
  }
  const users = [
    { email: 'chairman@coheninternationalschool.com', mobile: '9439112233', name: 'Jyoti Ranjan Tripathy', designation: 'Chairman' },
    { email: 'vicechairman@coheninternationalschool.com', mobile: '8093770221', name: 'Vikas Bahinipati', designation: 'Vice Chairman' },
    { email: 'secretary@coheninternationalschool.com', mobile: '8249112840', name: 'Janmejay Mandal', designation: 'Secretary' }
  ];
  for (const u of users) {
    let existing = await User.findOne({ email: u.email });
    if (!existing) {
      await User.create({
        name: u.name,
        designation: u.designation,
        email: u.email,
        mobile: u.mobile,
        password: u.mobile,
        role: 'SUPER_USER',
        isActive: true,
        status: 'Active',
        mustChangePassword: true
      });
    } else {
      existing.password = u.mobile;
      existing.mustChangePassword = true;
      existing.role = 'SUPER_USER';
      existing.isActive = true;
      existing.status = 'Active';
      await existing.save();
    }
  }
  await mongoose.disconnect();
}

async function runAllTests() {
  console.log('====================================================');
  console.log('STARTING COHEN CRM LOGIN + AUTHENTICATION TEST SUITE');
  console.log('====================================================\n');

  console.log('Resetting super users to initial state for testing...');
  await resetSuperUsersForTesting();
  console.log('Reset complete. Proceeding with tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Login Chairman with initial mobile password
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 1: Chairman First Login ---');
    const res1 = await request('/api/auth/login', { method: 'POST' }, {
      email: 'chairman@coheninternationalschool.com',
      password: '9439112233'
    });
    assert(res1.status === 200, 'TEST 1 - HTTP Status 200 OK');
    assert(res1.body.success === true, 'TEST 1 - success === true');
    assert(!!res1.body.token, 'TEST 1 - JWT token received');
    assert(res1.body.user?.role === 'SUPER_USER', 'TEST 1 - role === SUPER_USER');
    assert(res1.body.user?.mustChangePassword === true, 'TEST 1 - mustChangePassword === true (redirects to /change-password)');
    const chairmanToken = res1.body.token;

    // ----------------------------------------------------
    // TEST 2: Login Vice Chairman with initial mobile password
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 2: Vice Chairman First Login ---');
    const res2 = await request('/api/auth/login', { method: 'POST' }, {
      email: 'vicechairman@coheninternationalschool.com',
      password: '8093770221'
    });
    assert(res2.status === 200, 'TEST 2 - HTTP Status 200 OK');
    assert(res2.body.success === true, 'TEST 2 - success === true');
    assert(!!res2.body.token, 'TEST 2 - JWT token received');
    assert(res2.body.user?.role === 'SUPER_USER', 'TEST 2 - role === SUPER_USER');
    assert(res2.body.user?.mustChangePassword === true, 'TEST 2 - mustChangePassword === true (redirects to /change-password)');

    // ----------------------------------------------------
    // TEST 3: Login Secretary with initial mobile password
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 3: Secretary First Login ---');
    const res3 = await request('/api/auth/login', { method: 'POST' }, {
      email: 'secretary@coheninternationalschool.com',
      password: '8249112840'
    });
    assert(res3.status === 200, 'TEST 3 - HTTP Status 200 OK');
    assert(res3.body.success === true, 'TEST 3 - success === true');
    assert(!!res3.body.token, 'TEST 3 - JWT token received');
    assert(res3.body.user?.role === 'SUPER_USER', 'TEST 3 - role === SUPER_USER');
    assert(res3.body.user?.mustChangePassword === true, 'TEST 3 - mustChangePassword === true (redirects to /change-password)');

    // ----------------------------------------------------
    // TEST 4: Password Change Validations & Successful Change
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 4: Password Change Flow & Validations ---');
    
    // Sub-test 4a: Password mismatch rejection
    const res4a = await request('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chairmanToken}` }
    }, {
      currentPassword: '9439112233',
      newPassword: 'ChairmanPassword2026!',
      confirmPassword: 'MismatchPassword2026!'
    });
    assert(res4a.status === 400 && res4a.body.message.includes('do not match'),
      'TEST 4a - Reject password mismatch', JSON.stringify(res4a.body));

    // Sub-test 4b: Rejection of new password same as mobile number
    const res4b = await request('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chairmanToken}` }
    }, {
      currentPassword: '9439112233',
      newPassword: '9439112233',
      confirmPassword: '9439112233'
    });
    assert(res4b.status === 400 && res4b.body.message.includes('initial mobile-number password'),
      'TEST 4b - Reject new password if identical to mobile number', JSON.stringify(res4b.body));

    // Sub-test 4c: Successful password change for Chairman
    const res4c = await request('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chairmanToken}` }
    }, {
      currentPassword: '9439112233',
      newPassword: 'ChairmanNewSecure2026!',
      confirmPassword: 'ChairmanNewSecure2026!'
    });
    assert(res4c.status === 200, 'TEST 4c - Password changed successfully HTTP 200');
    assert(res4c.body.user?.mustChangePassword === false, 'TEST 4c - mustChangePassword updated to false');

    // Sub-test 4d: Logout
    const resLogout = await request('/api/auth/logout', { method: 'POST' });
    assert(resLogout.status === 200, 'TEST 4d - Logout successful');

    // Sub-test 4e: Login with new password
    const res4e = await request('/api/auth/login', { method: 'POST' }, {
      email: 'chairman@coheninternationalschool.com',
      password: 'ChairmanNewSecure2026!'
    });
    assert(res4e.status === 200, 'TEST 4e - Login with NEW password successful');
    assert(res4e.body.user?.mustChangePassword === false, 'TEST 4e - user.mustChangePassword is false (directly to dashboard)');
    const newChairmanToken = res4e.body.token;

    // ----------------------------------------------------
    // TEST 5: Try using old mobile number after password change
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 5: Login Rejection on Old Mobile Number ---');
    const res5 = await request('/api/auth/login', { method: 'POST' }, {
      email: 'chairman@coheninternationalschool.com',
      password: '9439112233'
    });
    assert(res5.status === 401, 'TEST 5 - Login rejected with old mobile number (HTTP 401)');
    assert(res5.body.message === 'Invalid email or password.', 'TEST 5 - Clean generic error message');

    // ----------------------------------------------------
    // TEST 6: Try accessing protected CRM URLs without authentication
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 6: Protected Route Guards without Token ---');
    const unauthLeads = await request('/api/leads');
    assert(unauthLeads.status === 401, 'TEST 6a - /api/leads unauthenticated rejected 401');

    const unauthSettings = await request('/api/settings');
    assert(unauthSettings.status === 401, 'TEST 6b - /api/settings unauthenticated rejected 401');

    const unauthStats = await request('/api/dashboard/stats');
    assert(unauthStats.status === 401, 'TEST 6c - /api/dashboard/stats unauthenticated rejected 401');

    // ----------------------------------------------------
    // TEST 7: Verify SUPER_USER has complete access to CRM modules
    // ----------------------------------------------------
    console.log('\n--- RUNNING TEST 7: SUPER_USER Access Across All Modules ---');
    const authHeaders = { headers: { Authorization: `Bearer ${newChairmanToken}` } };

    const dashboardRes = await request('/api/dashboard/stats', authHeaders);
    assert(dashboardRes.status === 200, 'TEST 7a - Access Dashboard stats (200 OK)');

    const leadsRes = await request('/api/leads', authHeaders);
    assert(leadsRes.status === 200, 'TEST 7b - Access Leads list (200 OK)');

    const followupsRes = await request('/api/followups', authHeaders);
    assert(followupsRes.status === 200, 'TEST 7c - Access Follow-ups (200 OK)');

    const admissionsRes = await request('/api/admissions', authHeaders);
    assert(admissionsRes.status === 200, 'TEST 7d - Access Admissions (200 OK)');

    const studentsRes = await request('/api/students', authHeaders);
    assert(studentsRes.status === 200, 'TEST 7e - Access Students (200 OK)');

    const settingsRes = await request('/api/settings', authHeaders);
    assert(settingsRes.status === 200, 'TEST 7f - Access CRM Settings (200 OK)');

    const usersRes = await request('/api/settings/users', authHeaders);
    assert(usersRes.status === 200, 'TEST 7g - Access Staff Users list (200 OK)');

    const metaLogsRes = await request('/api/meta/webhook-logs', authHeaders);
    assert(metaLogsRes.status === 200, 'TEST 7h - Access Meta Webhook Logs (200 OK)');

    const auditLogsRes = await request('/api/settings/audit-logs', authHeaders);
    assert(auditLogsRes.status === 200, 'TEST 7i - Access Audit Logs (200 OK)');

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Unexpected error running tests:', err);
    process.exit(1);
  }
}

runAllTests();
