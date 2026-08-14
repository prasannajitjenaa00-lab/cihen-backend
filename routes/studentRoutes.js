const express = require('express');
const router = express.Router();
const { getStudents } = require('../controllers/studentController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getStudents);

module.exports = router;
