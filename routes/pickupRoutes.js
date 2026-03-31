import express from "express";
import Pickup from "../model/pickup.js";
import Notification from "../model/notification.js";
import User from "../model/user.js";
import { createPickup, getPickups } from "../controller/dashboardController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { emitNotificationToUser } from "../utils/socket.js";

const router = express.Router();

console.log("Pickup routes loaded");

// ===================================================
// 🔹 VOLUNTEER → CREATE PICKUP REQUEST
// ===================================================
router.post(
  "/",
  protect,
  authorizeRoles("volunteer"),
  async (req, res) => {
    try {
      const { address, city, date, timeSlot, wasteTypes, notes } = req.body;
      const pickup = await Pickup.create({
        address,
        city,
        date,
        timeSlot,
        wasteTypes,
        notes,
        volunteer: req.user._id,
        status: "Pending",
      });

      const recipients = await User.find({ role: { $in: ["ngo", "admin"] } }).select("_id");
      if (recipients.length > 0) {
        const notifications = recipients.map((recipient) => ({
          recipient: recipient._id,
          sender: req.user._id,
          type: "pickup_status",
          content: `${req.user.name} scheduled a pickup request in ${city}.`,
          link: "/notifications",
        }));

        await Notification.insertMany(notifications);
        recipients.forEach((recipient) => emitNotificationToUser(recipient._id));
      }

      res.status(201).json(pickup);
    } catch (error) {
      console.error("Error creating pickup:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ===================================================
// 🔹 GET ALL PICKUPS (Both NGO & Volunteer)
// ===================================================
router.get("/", protect, getPickups);

// 🔹 GET USER-SPECIFIC PICKUPS
router.get("/user/:id", protect, async (req, res) => {
  try {
    const volunteerId =
      req.user.role === "volunteer" ? req.user._id : req.params.id;

    const pickups = await Pickup.find({ volunteer: volunteerId }).sort({ createdAt: -1 });
    res.status(200).json(pickups);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user pickups" });
  }
});

// 🔹 DYNAMIC STATUS UPDATE
router.put("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Pending", "Accepted", "In Progress", "Completed", "Rejected", "Closed"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: "Pickup not found" });

    // Permissions check: volunteer can cancel (Closed/Rejected?), NGO can update (Accepted, In Progress, Completed)
    // For simplicity, let's allow the assigned actor to update.
    
    pickup.status = status;
    if (req.user.role === 'ngo') {
      pickup.ngo = req.user._id;
    }
    
    await pickup.save();

    // Create Notification
    const isSelfNotification =
      pickup.volunteer?.toString() === req.user._id.toString();

    if (!isSelfNotification) {
      await Notification.create({
        recipient: pickup.volunteer,
        sender: req.user._id,
        type: "pickup_status",
        content: `Your pickup status is now: ${status}`,
        link: "/dashboard",
      });
      emitNotificationToUser(pickup.volunteer);
    }

    res.status(200).json(pickup);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ===================================================
// 🔹 NGO → ACCEPT PICKUP
// ===================================================
router.put(
  "/:id/accept",
  protect,
  authorizeRoles("ngo"),
  async (req, res) => {
    try {
      const pickup = await Pickup.findByIdAndUpdate(
        req.params.id,
        { status: "Accepted", ngo: req.user._id },
        { new: true }
      );

      if (!pickup) {
        return res.status(404).json({ message: "Pickup not found" });
      }

      // Create Notification for volunteer
      await Notification.create({
        recipient: pickup.volunteer,
        sender: req.user._id,
        type: "pickup_status",
        content: `Your pickup request has been accepted by ${req.user.name}`,
        link: "/dashboard",
      });
      emitNotificationToUser(pickup.volunteer);

      res.status(200).json(pickup);
    } catch (error) {
      console.error("Error accepting pickup:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ===================================================
// 🔹 NGO → REJECT PICKUP
// ===================================================
router.put(
  "/:id/reject",
  protect,
  authorizeRoles("ngo"),
  async (req, res) => {
    try {
      const pickup = await Pickup.findByIdAndUpdate(
        req.params.id,
        { status: "Rejected", ngo: req.user._id },
        { new: true }
      );

      if (!pickup) {
        return res.status(404).json({ message: "Pickup not found" });
      }

      // Create Notification for volunteer
      await Notification.create({
        recipient: pickup.volunteer,
        sender: req.user._id,
        type: "pickup_status",
        content: `Your pickup request has been rejected by ${req.user.name}`,
        link: "/dashboard",
      });
      emitNotificationToUser(pickup.volunteer);

      res.status(200).json(pickup);
    } catch (error) {
      console.error("Error rejecting pickup:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ===================================================
// 🔹 MARK AS CLOSED (After completion)
// ===================================================
router.put(
  "/:id/complete",
  protect,
  authorizeRoles("ngo"),
  async (req, res) => {
    try {
      const pickup = await Pickup.findByIdAndUpdate(
        req.params.id,
        { status: "Closed", ngo: req.user._id },
        { new: true }
      );

      if (!pickup) {
        return res.status(404).json({ message: "Pickup not found" });
      }

      // Create Notification for volunteer
      await Notification.create({
        recipient: pickup.volunteer,
        sender: req.user._id,
        type: "pickup_status",
        content: `Your pickup has been marked as completed by ${req.user.name}`,
        link: "/dashboard",
      });
      emitNotificationToUser(pickup.volunteer);

      res.status(200).json(pickup);
    } catch (error) {
      console.error("Error completing pickup:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ===================================================
// 🔹 DELETE PICKUP (Optional - Admin or NGO)
// ===================================================
router.delete(
  "/:id",
  protect,
  authorizeRoles("ngo", "admin"),
  async (req, res) => {
    try {
      const pickup = await Pickup.findByIdAndDelete(req.params.id);

      if (!pickup) {
        return res.status(404).json({ message: "Pickup not found" });
      }

      res.status(200).json({ message: "Pickup deleted" });
    } catch (error) {
      console.error("Error deleting pickup:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
