const { Router } = require("express");
const router = Router();
const authController = require("../controllers/auth");

router.post("/signup", authController.authSignup);

module.exports = router;
