// backend/validators/authValidator.js

const { body } = require('express-validator');

const saLoginValidator = [
  body('username').isEmail().withMessage('Valid SA email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
];

const saOtpValidator = [
  body('user_id').isUUID().withMessage('Valid user UUID required'),
  body('otp_code').isLength({ min: 6, max: 6 }).withMessage('6-digit OTP required')
];

module.exports = { saLoginValidator, saOtpValidator };
