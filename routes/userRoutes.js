import express from "express"
const router = express.Router();
import bcrypt from "bcryptjs";
import User from "../model/user.js";

import {
  registerUser,
  verifyRegisterOtp,
  loginUser,
  verifyLoginOtp,
  resendOtp,
} from "../controller/auth.js";


import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

// ===================================================
// ============ REGISTER USER ========================
// ===================================================


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

// Check Auth
router.get("/check", protect, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

// Get Profile
router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json(user);
});

// Update Profile
router.put("/me", protect, async (req, res) => {
  const { name, location, skills } = req.body;

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { name, location, skills },
    { new: true }
  ).select("-password");

  res.json(updated);
});

// Change Password
router.put("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch)
    return res.status(400).json({ message: "Wrong current password" });

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ message: "Password updated" });
});





// ✅ GET ALL USERS
router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ ADMIN: GET ALL USERS WITH STATS
router.get("/admin/all-users", protect, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password -otp -otpExpiry -loginOtp -loginOtpExpire");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ ADMIN: SUSPEND / UNSUSPEND USER
router.put("/admin/suspend/:userId", protect, authorizeRoles("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot suspend admin" });

    user.isSuspended = !user.isSuspended;
    await user.save();

    res.json({ message: `User ${user.isSuspended ? "suspended" : "unsuspended"} successfully`, isSuspended: user.isSuspended });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ ADMIN: DELETE USER
router.delete("/admin/delete/:userId", protect, authorizeRoles("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot delete admin" });

    await User.findByIdAndDelete(req.params.userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ ADMIN: PLATFORM STATS
router.get("/admin/stats", protect, authorizeRoles("admin"), async (req, res) => {
  try {
    const Message = (await import("../model/messages.js")).default;
    const Opportunity = (await import("../model/opportunity.js")).default;
    const Pickup = (await import("../model/pickup.js")).default;

    const [totalUsers, volunteers, ngos, admins, totalMessages, totalOpportunities, totalPickups, suspendedUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "volunteer" }),
      User.countDocuments({ role: "ngo" }),
      User.countDocuments({ role: "admin" }),
      Message.countDocuments(),
      Opportunity.countDocuments().catch(() => 0),
      Pickup.countDocuments().catch(() => 0),
      User.countDocuments({ isSuspended: true }),
    ]);

    res.json({
      totalUsers,
      volunteers,
      ngos,
      admins,
      totalMessages,
      totalOpportunities,
      totalPickups,
      suspendedUsers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
