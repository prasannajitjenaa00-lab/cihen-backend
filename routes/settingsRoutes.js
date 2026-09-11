const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  regenerateApiKey,
  regenerateGoogleKey,
  getUsers,
  createUser,
  updateUser,
  getNotifications,
  markNotificationsRead,
  getAuditLogs
} = require('../controllers/settingsController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect); // Protect all routes

router.route('/')
  .get(getSettings)
  .put(authorizeRoles('Super Admin'), updateSettings);

router.post('/regenerate-api-key', authorizeRoles('Super Admin'), regenerateApiKey);
router.post('/regenerate-google-key', authorizeRoles('Super Admin'), regenerateGoogleKey);

router.route('/users')
  .get(getUsers)
  .post(authorizeRoles('Super Admin'), createUser);

router.put('/users/:id', authorizeRoles('Super Admin'), updateUser);

router.get('/notifications', getNotifications);
router.put('/notifications/read', markNotificationsRead);

router.get('/audit-logs', authorizeRoles('Super Admin'), getAuditLogs);

module.exports = router;
