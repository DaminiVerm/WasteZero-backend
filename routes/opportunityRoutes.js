import express from "express";
import upload from "../middleware/multer.js";
import { createOpportunity, updateOpportunity } from "../controller/dashboardController.js";
import Opportunity from "../model/opportunity.js";
import User from "../model/user.js";
import Notification from "../model/notification.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { emitNotificationToUser } from "../utils/socket.js";
import { scoreOpportunityForVolunteer } from "../utils/matching.js";

const router = express.Router();

console.log("Opportunity routes loaded");

const normalizeApplicants = (applicants = []) =>
  applicants.map((applicant) => {
    if (applicant?.user) {
      return {
        user: applicant.user,
        status: applicant.status || "pending",
        appliedAt: applicant.appliedAt || new Date(),
      };
    }

    return {
      user: applicant,
      status: "pending",
      appliedAt: new Date(),
    };
  });

// ================= CREATE =================
// Admin & NGO can create
router.post(
  "/create",
  protect,
  authorizeRoles("ngo"),
  upload.single("image"),
  createOpportunity
);

// ================= GET ALL =================
// All logged-in users (Admin, NGO, Volunteer)
router.get("/", async (req, res) => {
  try {
    const data = await Opportunity.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/matches/top", protect, authorizeRoles("volunteer"), async (req, res) => {
  try {
    const volunteer = await User.findById(req.user._id).select("name skills location locationCoords");
    if (!volunteer) {
      return res.status(404).json({ msg: "Volunteer not found" });
    }

    const opportunities = await Opportunity.find({ status: "Open" })
      .sort({ createdAt: -1 })
      .limit(50);

    const scoredMatches = [];

    for (const opportunity of opportunities) {
      const match = await scoreOpportunityForVolunteer(volunteer, opportunity);
      if (!match.isMatch) continue;

      scoredMatches.push({
        ...opportunity.toObject(),
        matchScore: match.score,
        distanceKm: match.distanceKm,
        matchedSkills: match.matchedSkills,
        wasteMatch: match.wasteMatch,
      });
    }

    scoredMatches.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;

      const aDistance = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const bDistance = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
      return aDistance - bDistance;
    });

    res.json(scoredMatches.slice(0, 6));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await Opportunity.findById(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ================= UPDATE =================
// Admin & NGO can update
router.put(
  "/:id",
  protect,
  authorizeRoles("ngo"),
  upload.single("image"),
  updateOpportunity
);

// ================= DELETE =================
// Admin & NGO can delete
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin", "ngo"),
  async (req, res) => {
    try {
      const opportunity = await Opportunity.findById(req.params.id);

      if (!opportunity)
        return res.status(404).json({ msg: "Opportunity not found" });

      // 🔐 NGO restriction
      if (
        req.user.role === "ngo" &&
        opportunity.createdBy &&
        opportunity.createdBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ msg: "Not authorized to delete this opportunity" });
      }

      await opportunity.deleteOne();

      res.json({ msg: "Opportunity deleted successfully" });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Volunteer applies to an opportunity
router.post(
  "/apply/:id",
  protect,
  authorizeRoles("volunteer"),
  async (req, res) => {
    try {
      const opportunity = await Opportunity.findById(req.params.id);

      if (!opportunity)
        return res.status(404).json({ msg: "Opportunity not found" });

      opportunity.applicants = normalizeApplicants(opportunity.applicants);

      const alreadyApplied = opportunity.applicants.some(
        (app) => app.user?.toString() === req.user._id.toString()
      );

      if (alreadyApplied) {
        return res.status(400).json({ msg: "You have already applied" });
      }

      opportunity.applicants.push({
        user: req.user._id,
        status: "pending",
        appliedAt: new Date(),
      });

      await opportunity.save();
      await Notification.create({
        recipient: opportunity.createdBy,
        sender: req.user._id,
        type: "opportunity_status",
        content: `${req.user.name} applied for "${opportunity.title}". Review the request to accept or reject.`,
        link: "/dashboard",
      });
      emitNotificationToUser(opportunity.createdBy);

      const admins = await User.find({ role: "admin" }).select("_id");
      if (admins.length > 0) {
        const adminNotifications = admins.map((admin) => ({
          recipient: admin._id,
          sender: req.user._id,
          type: "opportunity_status",
          content: `${req.user.name} applied for "${opportunity.title}".`,
          link: "/notifications",
        }));

        await Notification.insertMany(adminNotifications);
        admins.forEach((admin) => emitNotificationToUser(admin._id));
      }

      res.json({ success: true, msg: "Applied successfully" });

    } catch (err) {
      res.status(500).json({ msg: err.message });
    }
  }
);

// NGO Accept / Reject Application
router.put(
  "/application/:opportunityId/:userId",
  protect,
  authorizeRoles("ngo"),
  async (req, res) => {
    try {
      const { opportunityId, userId } = req.params;
      const { status } = req.body;
      const normalizedStatus =
        status === "accept"
          ? "accepted"
          : status === "reject"
            ? "rejected"
            : status;

      if (!["accepted", "rejected"].includes(normalizedStatus)) {
        return res.status(400).json({ msg: "Invalid status" });
      }

      const opportunity = await Opportunity.findById(opportunityId);

      if (!opportunity)
        return res.status(404).json({ msg: "Opportunity not found" });

      // NGO can only manage their own opportunity
      if (opportunity.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ msg: "Not authorized" });
      }

      opportunity.applicants = normalizeApplicants(opportunity.applicants);

      const applicant = opportunity.applicants.find(
        (app) => app.user?.toString() === userId
      );

      if (!applicant)
        return res.status(404).json({ msg: "Applicant not found" });

      applicant.status = normalizedStatus;

      await opportunity.save();

      await Notification.create({
        recipient: userId,
        sender: req.user._id,
        type: "opportunity_status",
        content: `Your application for "${opportunity.title}" was ${normalizedStatus} by ${req.user.name}.`,
        link: "/opportunities",
      });
      emitNotificationToUser(userId);

      res.json({ success: true, opportunity });

    } catch (err) {
      res.status(500).json({ msg: err.message });
    }
  }
);

// ================= MATCHING ALGORITHM =================
// GET /api/opportunity/matches/:userId
router.get("/matches/:userId", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Build query based on proximity and skills
    const matches = await Opportunity.aggregate([
      {
        $geoNear: {
          near: user.locationCoords || { type: "Point", coordinates: [0, 0] },
          distanceField: "distance",
          maxDistance: 50 * 1000, 
          spherical: true,
          query: { status: "Open" }
        }
      },
      {
        $match: {
          $or: [
            { requiredSkills: { $in: user.skills } },
            { wasteType: { $in: user.skills } }
          ]
        }
      },
      { $sort: { distance: 1 } }
    ]);

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
