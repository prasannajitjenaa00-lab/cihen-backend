const express = require('express');
const router = express.Router();
const { login, register, getMe } = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', protect, authorizeRoles('Super Admin'), register);
router.get('/me', protect, getMe);

module.exports = router;
