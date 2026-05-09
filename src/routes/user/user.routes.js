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

router.use(requireAuth);
router.use(authorizeRoles('SUPER_ADMIN'));

router.post('/', createUserValidator, validateRequest, UserController.create);
router.get('/', listUsersValidator, validateRequest, UserController.list);
router.get('/:userId', userIdParam, validateRequest, UserController.getById);
router.put('/:userId', updateUserValidator, validateRequest, UserController.update);
router.patch('/:userId/status', updateUserStatusValidator, validateRequest, UserController.updateStatus);
router.post('/:userId/reset-password', resetPasswordValidator, validateRequest, UserController.resetPassword);

module.exports = router;
