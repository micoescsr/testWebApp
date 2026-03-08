// backend/validators/authValidator.js

const { body, validationResult } = require('express-validator');

exports.login = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Enter valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be 6+ characters')
];

// Run validation
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

//module.exports = { saLoginValidator, saOtpValidator };
module.exports = { login: exports.login, validate: exports.validate };
