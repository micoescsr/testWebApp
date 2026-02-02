// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authValidator = require('../validators/authValidator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');  // Fixed path

// Login returns JWT for React
router.post('/login', /* authValidator.login, */ authController.login);



// Login (no middleware)
//router.post('/login', authValidator.login, authController.login);

// Protected dashboard
//router.get('/dashboard', authMiddleware, authController.dashboard);

module.exports = router;
