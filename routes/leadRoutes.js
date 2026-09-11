const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  assignLead,
  addNote,
  scheduleFollowUp,
  logCall,
  resolveDuplicate
} = require('../controllers/leadController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect); // Protect all lead routes

router.route('/')
  .get(getLeads)
  .post(authorizeRoles('Super Admin', 'Admin', 'Counsellor'), createLead);

router.route('/:id')
  .get(getLead)
  .put(updateLead)
  .delete(authorizeRoles('Super Admin'), deleteLead);

router.post('/:id/assign', authorizeRoles('Super Admin', 'Admin'), assignLead);
router.post('/:id/notes', authorizeRoles('Counsellor'), addNote);
router.post('/:id/followups', authorizeRoles('Counsellor'), scheduleFollowUp);
router.post('/:id/calls', authorizeRoles('Counsellor'), logCall);
router.post('/:id/resolve-duplicate', authorizeRoles('Super Admin', 'Admin'), resolveDuplicate);

module.exports = router;
