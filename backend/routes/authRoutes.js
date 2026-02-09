// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login returns JWT for React
router.post('/login', authController.login);

module.exports = router;


// Login (no middleware)
//router.post('/login', authValidator.login, authController.login);

// Protected dashboard
//router.get('/dashboard', authMiddleware, authController.dashboard);

module.exports = router;
