// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { createUserValidator } = require("../validators/userValidators"); //when it needs to be validated

router.get("/user_account", userController.getAllUsers);

// fetch("http://localhost:3000/api/users/user_account")

router.post("/user_account", createUserValidator, userController.createUser);

/*fetch("http://localhost:3000/api/users/user_account", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(newUser),
}); */

module.exports = router;

