import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { 
  getAllUsers, 
  toggleUserStatus, 
  deleteOpportunityAdmin, 
  getStats, 
  getActivityLogs, downloadMasterReport 
} from "../controller/adminController.js";
import Opportunity from "../model/opportunity.js";

const router = express.Router();

// Middleware: All admin routes are protected and require 'admin' role
router.use(protect);
router.use(authorizeRoles("admin"));

// User Management
router.get("/users", getAllUsers);
router.put("/users/:id/status", toggleUserStatus);

// Opportunity Moderation
router.get("/opportunities", async (req, res) => {
  try {
    const data = await Opportunity.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.delete("/opportunities/:id", deleteOpportunityAdmin);

// Reporting & Analytics
router.get("/stats", getStats);
router.get("/logs", getActivityLogs);
router.get("/download/master", downloadMasterReport);

export default router;
