import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendMessage, getMessages, clearConversation, getUnreadCounts, markAsRead } from "../controller/dashboardController.js";

const router = express.Router();

// Static routes first
router.get("/unread", protect, getUnreadCounts);
router.put("/read", protect, markAsRead);

// Dynamic routes
router.get("/:receiverId", protect, getMessages);
router.post("/", protect, sendMessage);
router.delete("/:otherUserId", protect, clearConversation);

export default router;