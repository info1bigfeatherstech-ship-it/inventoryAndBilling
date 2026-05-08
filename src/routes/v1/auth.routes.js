const express = require('express');
const router = express.Router();

const AuthController = require('../../controllers/auth.controller');
const { loginValidator } = require('../../validators/auth.validators');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');

router.post('/login', loginValidator, validateRequest, AuthController.login);
router.get('/me', requireAuth, AuthController.me);

module.exports = router;

