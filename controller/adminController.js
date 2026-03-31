import User from "../model/user.js";
import Opportunity from "../model/opportunity.js";
import Pickup from "../model/pickup.js";
import ActivityLog from "../model/activitylog.js";
import Notification from "../model/notification.js";
import { emitNotificationToUser } from "../utils/socket.js";
import { Parser } from "json2csv";

const CO2_FACTORS = {
  plastic: 6,
  paper: 3,
  metal: 9,
  glass: 1,
  electronic: 8,
  electronics: 8,
  "electronic waste": 8,
  "e-waste": 8,
  ewaste: 8,
};

const MATERIAL_DISPLAY_ORDER = [
  "Plastic",
  "Metal",
  "Electronic Waste",
  "Glass",
  "Paper",
];

const MATERIAL_CATEGORY_ALIASES = {
  plastic: "Plastic",
  "plastic waste": "Plastic",
  metal: "Metal",
  "metal waste": "Metal",
  paper: "Paper",
  "paper waste": "Paper",
  glass: "Glass",
  "glass waste": "Glass",
  electronic: "Electronic Waste",
  electronics: "Electronic Waste",
  "electronic waste": "Electronic Waste",
  "e-waste": "Electronic Waste",
  ewaste: "Electronic Waste",
};

const normalizeWasteType = (value = "") => value.toString().trim().toLowerCase();

const normalizeMaterialLabel = (value = "") => {
  const normalized = normalizeWasteType(value);
  return MATERIAL_CATEGORY_ALIASES[normalized] || null;
};

const splitMaterialValues = (value = "") =>
  value
    .toString()
    .split(/,|\/|&|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

const buildPickupImpactStats = (pickups = []) => {
  const totalPickups = pickups.length;
  const recycledItems = pickups.reduce(
    (sum, pickup) => sum + (Array.isArray(pickup.wasteTypes) ? pickup.wasteTypes.length : 0),
    0
  );

  const co2Saved = pickups.reduce((sum, pickup) => {
    const pickupCo2 = (pickup.wasteTypes || []).reduce((pickupSum, type) => {
      const normalizedType = normalizeWasteType(type);
      return pickupSum + (CO2_FACTORS[normalizedType] || 0);
    }, 0);

    return sum + pickupCo2;
  }, 0);

  return {
    totalPickups,
    recycledItems,
    co2Saved,
  };
};

const buildWasteStats = (pickups = []) => {
  const counts = new Map(MATERIAL_DISPLAY_ORDER.map((type) => [type, 0]));

  pickups.forEach((pickup) => {
    (pickup.wasteTypes || []).flatMap((type) => splitMaterialValues(type)).forEach((type) => {
      const label = normalizeMaterialLabel(type);
      if (label) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    });
  });

  return MATERIAL_DISPLAY_ORDER.map((name) => ({
    name,
    count: counts.get(name) || 0,
  }));
};

// ================= USER MANAGEMENT =================

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Suspend / Activate User
export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.isSuspended = !user.isSuspended;
    await user.save();

    const suspensionAction = user.isSuspended ? "suspended" : "reactivated";

    await Notification.create({
      recipient: user._id,
      sender: req.user._id,
      type: "message",
      content: `Your account has been ${suspensionAction} by the admin.`,
      link: "/notifications",
    });
    emitNotificationToUser(user._id);

    await ActivityLog.create({
      user: req.user.name,
      action: user.isSuspended ? "Suspended User" : "Activated User",
      value: 1
    });

    res.json({ msg: `User status updated to ${user.isSuspended ? 'Suspended' : 'Active'}`, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ================= OPPORTUNITY MODERATION =================

// Delete inappropriate opportunity
export const deleteOpportunityAdmin = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ msg: "Opportunity not found" });

    await opportunity.deleteOne();

    await ActivityLog.create({
      user: req.user.name,
      action: "Deleted Opportunity (Admin)",
      value: 1
    });

    res.json({ msg: "Opportunity removed by admin" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ================= REPORTING & ANALYTICS =================

export const getStats = async (req, res) => {
  try {
    const activeOpportunityQuery = {
      $or: [
        { status: { $exists: false } },
        { status: null },
        { status: "" },
        { status: /^open$/i },
      ],
    };

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isVerified: true, isSuspended: false });
    const totalOpportunities = await Opportunity.countDocuments();
    const activeOpportunities = await Opportunity.countDocuments(activeOpportunityQuery);
    const pendingPickups = await Pickup.countDocuments({ status: "Pending" });
    const completedPickups = await Pickup.countDocuments({ status: { $in: ["Completed", "Closed"] } });
    
    const pickupPipelineStats = await Pickup.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // Aggregation for waste categories
    const allPickups = await Pickup.find().select("wasteTypes");
    const wasteStats = buildWasteStats(allPickups);
    const pickupImpactStats = buildPickupImpactStats(allPickups);
    const totalNGOs = await User.countDocuments({ role: "ngo" });

    res.json({
      totalUsers,
      activeUsers,
      totalNGOs,
      totalOpportunities,
      activeOpportunities,
      pendingPickups,
      completedPickups,
      pickupPipelineStats,
      wasteStats,
      pickups: pickupImpactStats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// View logs
export const getActivityLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




import PDFDocument from "pdfkit";

export const downloadMasterReport = async (req, res) => {
  try {
    const users = await User.find().select("name email role isVerified isSuspended");
    const opportunities = await Opportunity.find().populate("createdBy", "name email");
    const pickups = await Pickup.find().select("wasteTypes");
    const stats = buildPickupImpactStats(pickups);

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=WasteZero_Report.pdf");

    doc.pipe(res);

    // Title
    doc.fontSize(20).text("WasteZero Platform Report", { align: "center" });
    doc.moveDown();

    // ================= TOTAL USERS =================
    doc.fontSize(16).text("Total Users", { underline: true });
    doc.moveDown(0.5);

    users.forEach((user, index) => {
      doc
        .fontSize(12)
        .text(
          `${index + 1}. ${user.name} | ${user.email} | ${user.role} | ${
            user.isSuspended ? "Suspended" : user.isVerified ? "Active" : "Unverified"
          }`
        );
    });

    doc.moveDown();

    // ================= PICKUPS =================
   
    doc.moveDown(0.5);
    doc.fontSize(16).text(`Volunteer Hours: { underline: true }`);
    doc.fontSize(12).text(`Total Pickups: ${stats.totalPickups || 0}`);
    doc.text(`Recycled Items: ${stats.recycledItems || 0}`);
    doc.text(`CO2 Saved: ${stats.co2Saved || 0}`);

    doc.moveDown();

    // ================= OPPORTUNITIES =================
    doc.fontSize(16).text("Opportunities Report", { underline: true });
    doc.moveDown(0.5);

    opportunities.forEach((opp, index) => {
      doc
        .fontSize(12)
        .text(
          `${index + 1}. ${opp.title || "Opportunity"} 
Created By: ${opp.createdBy?.name || "N/A"} 
Email: ${opp.createdBy?.email || "N/A"}`
        );
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
