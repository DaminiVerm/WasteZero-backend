const express = require("express");
const router = express.Router();

const {
  registerUser,
  verifyRegisterOtp,
  loginUser,
  verifyLoginOtp,
  resendOtp
} = require("../controllers/authController");


const { protect, authorizeRoles } = require("../middleware/authMiddleware");


// =============== AUTH ROUTES ==============

// Register → Send OTP
router.post("/register", registerUser);

// Verify Register OTP
router.post("/verify-register-otp", verifyRegisterOtp);

// Login → Send OTP
router.post("/login", loginUser);

// Verify Login OTP → Generate JWT
router.post("/verify-login-otp", verifyLoginOtp);

// Resend OTP
router.post("/resend-otp", resendOtp);


// ============ PROTECTED ROUTES ============

// Profile (Any Logged-in User)
router.get("/profile", protect, (req, res) => {
  res.status(200).json(req.user);
});

// Admin Dashboard (Admin Only)
router.get(
  "/admin-dashboard",
  protect,
  authorizeRoles("admin"),
  (req, res) => {
    res.status(200).json({ message: "Welcome Admin!" });
  }
);

module.exports = router;
