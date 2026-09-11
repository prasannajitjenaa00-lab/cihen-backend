const express = require('express');
const router = express.Router();
const { login, register, getMe, changePassword, logout } = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.post('/login', login);
router.post('/change-password', protect, changePassword);
router.post('/logout', logout);
router.post('/register', protect, authorizeRoles('Super Admin', 'SUPER_USER'), register);
router.get('/me', protect, getMe);

module.exports = router;
