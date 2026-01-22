// validators/userValidators.js
function createUserValidator(req, res, next) {
  const { first_name, last_name, username, email, role } = req.body;

  if (!first_name || !last_name || !username || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // basic example; you can add regex/email checks, etc.
  next();
}

module.exports = { createUserValidator };
