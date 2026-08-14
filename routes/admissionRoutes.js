const express = require('express');
const router = express.Router();
const { getAdmissions, createAdmission, updateAdmission } = require('../controllers/admissionController');
const { protect } = require('../middleware/auth');

router.use(protect); // Protect all admission routes

router.route('/')
  .get(getAdmissions)
  .post(createAdmission);

router.route('/:id')
  .put(updateAdmission);

module.exports = router;
