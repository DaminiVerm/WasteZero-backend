import express from "express";
import { getDashboardData } from "../controller/dashboardController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ================= DASHBOARD =================
// If dashboard should be protected (recommended)
router.get("/", protect, getDashboardData);

// If you don't want auth protection, use this instead:
// router.get("/", getDashboardData);

export default router;