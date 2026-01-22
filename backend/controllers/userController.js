// controllers/userController.js
const userService = require("../services/userService");


async function createUser(req, res) {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
}

// ----ito ung wla pang services.js
    const userRepository = require("../repositories/userRepository");

    async function getAllUsers(req, res) {
    try {
        const users = await userRepository.findFirstUsers(10);
        res.json(users);
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
    }

    /* async function createUser(req, res) { 
    try {
        const newUser = req.body;

        // simple example insert; adapt to your schema
        const created = await userRepository.insertUser(newUser);
        res.status(201).json(created);
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
    } */

module.exports = {createUser, getAllUsers };
