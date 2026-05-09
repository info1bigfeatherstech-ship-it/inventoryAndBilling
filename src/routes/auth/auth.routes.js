const express = require('express');
const router = express.Router();

const AuthController = require('../../controllers/auth/auth.controller');
const { loginValidator } = require('../../validators/auth/auth.validators');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');

router.post('/login', loginValidator, validateRequest, AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/me', requireAuth, AuthController.me);

module.exports = router;
