const express = require('express');
const router = express.Router();
const { getFollowUps, updateFollowUp } = require('../controllers/followUpController');
const { protect } = require('../middleware/auth');

router.use(protect); // Protect all follow-up routes

router.route('/')
  .get(getFollowUps);

router.route('/:id')
  .put(updateFollowUp);

module.exports = router;
