const { Router } = require("express");
const router = Router();
const authController = require("../controllers/auth");

router.post("/signup", authController.authSignup);

router.post("/login", authController.authLogin);

module.exports = router;
