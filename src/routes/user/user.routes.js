const express = require('express');
const router = express.Router();

const UserController = require('../../controllers/user/user.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  userIdParam,
  createUserValidator,
  updateUserValidator,
  updateUserStatusValidator,
  resetPasswordValidator,
  listUsersValidator,
} = require('../../validators/user/user.validators');
const {
  listTeamValidator,
  createTeamMemberValidator,
  updateTeamMemberValidator,
  updateTeamMemberStatusValidator,
  resetTeamMemberPasswordValidator,
} = require('../../validators/user/team.validators');

const TEAM_MANAGERS = ['SHOP_OWNER', 'WH_MANAGER'];

router.use(requireAuth);

// ── Team management (shop owner / warehouse manager) — must be before /:userId ──
router.get(
  '/team/context',
  authorizeRoles(...TEAM_MANAGERS),
  UserController.teamContext
);
router.get(
  '/team',
  authorizeRoles(...TEAM_MANAGERS),
  listTeamValidator,
  validateRequest,
  UserController.teamList
);
router.post(
  '/team',
  authorizeRoles(...TEAM_MANAGERS),
  createTeamMemberValidator,
  validateRequest,
  UserController.teamCreate
);
router.get(
  '/team/:userId',
  authorizeRoles(...TEAM_MANAGERS),
  userIdParam,
  validateRequest,
  UserController.teamGetById
);
router.put(
  '/team/:userId',
  authorizeRoles(...TEAM_MANAGERS),
  updateTeamMemberValidator,
  validateRequest,
  UserController.teamUpdate
);
router.patch(
  '/team/:userId/status',
  authorizeRoles(...TEAM_MANAGERS),
  updateTeamMemberStatusValidator,
  validateRequest,
  UserController.teamUpdateStatus
);
router.post(
  '/team/:userId/reset-password',
  authorizeRoles(...TEAM_MANAGERS),
  resetTeamMemberPasswordValidator,
  validateRequest,
  UserController.teamResetPassword
);

// ── Super admin user administration ──
router.use(authorizeRoles('SUPER_ADMIN'));

router.post('/', createUserValidator, validateRequest, UserController.create);
router.get('/', listUsersValidator, validateRequest, UserController.list);
router.get('/:userId', userIdParam, validateRequest, UserController.getById);
router.put('/:userId', updateUserValidator, validateRequest, UserController.update);
router.patch('/:userId/status', updateUserStatusValidator, validateRequest, UserController.updateStatus);
router.post('/:userId/reset-password', resetPasswordValidator, validateRequest, UserController.resetPassword);

module.exports = router;
