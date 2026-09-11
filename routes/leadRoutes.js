const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  assignLead,
  bulkAssignLeads,
  addNote,
  scheduleFollowUp,
  logCall,
  resolveDuplicate
} = require('../controllers/leadController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect); // Protect all lead routes

router.route('/')
  .get(getLeads)
  .post(authorizeRoles('Super Admin', 'Admin', 'Counsellor', 'CGO', 'Senior Zonal Manager'), createLead);

// Bulk lead allocation route (must be defined before /:id)
router.post('/bulk-assign', authorizeRoles('Super Admin', 'Admin', 'CGO'), bulkAssignLeads);

router.route('/:id')
  .get(getLead)
  .put(updateLead)
  .delete(authorizeRoles('Super Admin'), deleteLead);

router.post('/:id/assign', authorizeRoles('Super Admin', 'Admin', 'CGO'), assignLead);
router.post('/:id/notes', authorizeRoles('Counsellor', 'Super Admin', 'Admin', 'CGO', 'Senior Zonal Manager'), addNote);
router.post('/:id/followups', authorizeRoles('Counsellor', 'Super Admin', 'Admin', 'CGO', 'Senior Zonal Manager'), scheduleFollowUp);
router.post('/:id/calls', authorizeRoles('Counsellor', 'Super Admin', 'Admin', 'CGO', 'Senior Zonal Manager'), logCall);
router.post('/:id/resolve-duplicate', authorizeRoles('Super Admin', 'Admin', 'CGO'), resolveDuplicate);

module.exports = router;
