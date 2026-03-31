import Stats from "../model/stats.js";
import Pickup from "../model/pickup.js";
import Opportunity from "../model/opportunity.js";
import ActivityLog from "../model/activitylog.js";
import Message from "../model/messages.js"
import User from "../model/user.js";
import Notification from "../model/notification.js";
import { emitNotificationToUser } from "../utils/socket.js";
import { scoreOpportunityForVolunteer } from "../utils/matching.js";

// ensure stats document exists
const ensureStats = async () => {
  let stats = await Stats.findOne();
  if (!stats) {
    stats = await Stats.create({
      totalPickups: 0,
      recycledItems: 0,
      co2Saved: 0,
      volunteerHours: 0
    });
  }
  return stats;
};

const calculateCO2 = (type, qty) => {
 if (!type || !qty) return 0;

 const factors = {
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

 return (factors[type.toLowerCase()] || 0) * qty;
};

const buildVolunteerStats = (pickups = []) => {
  const totalPickups = pickups.length;
  const recycledItems = pickups.reduce(
    (sum, pickup) => sum + (Array.isArray(pickup.wasteTypes) ? pickup.wasteTypes.length : 0),
    0
  );
  const co2Saved = pickups.reduce((sum, pickup) => {
    const pickupCo2 = (pickup.wasteTypes || []).reduce(
      (pickupSum, type) => pickupSum + calculateCO2(type, 1),
      0
    );

    return sum + pickupCo2;
  }, 0);
  const volunteerHours = pickups.filter((pickup) =>
    ["Accepted", "In Progress", "Completed", "Closed"].includes(pickup.status)
  ).length * 2;

  return {
    totalPickups,
    recycledItems,
    co2Saved,
    volunteerHours,
  };
};

const normalizeApplicant = (applicant) => {
  if (!applicant) return null;

  if (applicant.user) {
    return {
      user: applicant.user,
      status: applicant.status || "pending",
      appliedAt: applicant.appliedAt || null,
    };
  }

  return {
    user: applicant,
    status: "pending",
    appliedAt: null,
  };
};

const normalizeOpportunityApplicants = (opportunity) => ({
  ...opportunity.toObject(),
  applicants: (opportunity.applicants || [])
    .map(normalizeApplicant)
    .sort((a, b) => {
      const statusOrder = { pending: 0, accepted: 1, rejected: 2 };
      const aStatus = statusOrder[a.status] ?? 99;
      const bStatus = statusOrder[b.status] ?? 99;

      if (aStatus !== bStatus) return aStatus - bStatus;

      const aDate = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
      const bDate = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
      return bDate - aDate;
    })
    .filter(Boolean),
});

const getApplicationOpportunities = (opportunities) =>
  opportunities
    .map(normalizeOpportunityApplicants)
    .filter((opportunity) => opportunity.applicants.length > 0);

const getVolunteerApplicationSummaries = (opportunities, userId) =>
  opportunities
    .map(normalizeOpportunityApplicants)
    .map((opportunity) => {
      const applicant = opportunity.applicants.find((item) => {
        const applicantUserId =
          typeof item.user === "object" ? item.user?._id?.toString() : item.user?.toString();
        return applicantUserId === userId.toString();
      });

      if (!applicant) return null;

      return {
        _id: opportunity._id,
        title: opportunity.title,
        location: opportunity.location,
        date: opportunity.date,
        appliedAt: applicant.appliedAt || null,
        applicationStatus: applicant.status || "pending",
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const statusOrder = { accepted: 0, rejected: 1, pending: 2 };
      const aStatus = statusOrder[a.applicationStatus] ?? 99;
      const bStatus = statusOrder[b.applicationStatus] ?? 99;

      if (aStatus !== bStatus) return aStatus - bStatus;

      const aDate = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
      const bDate = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
      return bDate - aDate;
    });

const buildNgoStats = (opportunities, pickups) => {
  const uniqueVolunteerIds = new Set();

  opportunities.forEach((opportunity) => {
    (opportunity.applicants || []).forEach((applicant) => {
      const applicantUserId =
        typeof applicant.user === "object"
          ? applicant.user?._id?.toString()
          : applicant.user?.toString();

      if (applicantUserId) {
        uniqueVolunteerIds.add(applicantUserId);
      }
    });
  });

  return {
    activeOpportunities: opportunities.filter((opportunity) => opportunity.status === "Open").length,
    totalVolunteers: uniqueVolunteerIds.size,
    completedPickups: pickups.filter((pickup) => ["Completed", "Closed"].includes(pickup.status)).length,
    pendingPickups: pickups.filter((pickup) => pickup.status === "Pending").length,
  };
};

const MATERIAL_DISPLAY_ORDER = [
  "Plastic",
  "Metal",
  "Electronic Waste",
  "Paper",
  "Glass",
];

const MATERIAL_CATEGORY_ALIASES = {
  plastic: "Plastic",
  "plastic waste": "Plastic",
  metal: "Metal",
  "metal waste": "Metal",
  paper: "Paper",
  "paper waste": "Paper",
  electronic: "Electronic Waste",
  electronics: "Electronic Waste",
  "electronic waste": "Electronic Waste",
  "e-waste": "Electronic Waste",
  ewaste: "Electronic Waste",
  glass: "Glass",
  "glass waste": "Glass",
};

const normalizeMaterialType = (value) => {
  const normalized = value.toString().trim().toLowerCase();
  return MATERIAL_CATEGORY_ALIASES[normalized] || normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const splitMaterialValues = (value) =>
  value
    .toString()
    .split(/,|\/|&|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

const buildMaterialBreakdown = (values = []) => {
  const counts = new Map();

  values
    .flat()
    .filter(Boolean)
    .flatMap((value) => splitMaterialValues(value))
    .filter(Boolean)
    .forEach((value) => {
      const normalizedValue = normalizeMaterialType(value);

      counts.set(normalizedValue, (counts.get(normalizedValue) || 0) + 1);
    });

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const allMaterialTypes = [
    ...MATERIAL_DISPLAY_ORDER,
    ...Array.from(counts.keys()).filter((type) => !MATERIAL_DISPLAY_ORDER.includes(type)),
  ];

  return allMaterialTypes
    .map((type) => ({
      type,
      count: counts.get(type) || 0,
    }))
    .map((item) => ({
      ...item,
      percent: total ? Math.round((item.count / total) * 100) : 0,
    }))
    .sort((a, b) => {
      const aIndex = MATERIAL_DISPLAY_ORDER.indexOf(a.type);
      const bIndex = MATERIAL_DISPLAY_ORDER.indexOf(b.type);

      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }

      return b.count - a.count || a.type.localeCompare(b.type);
    });
};


export const ngoDashboard = async (req, res) => {
  try {
    const opportunities = await Opportunity.find({
      createdBy: req.user._id   // FIXED
    })
    .populate("applicants.user", "name email")
    .select("title description applicants date location duration wasteType requiredSkills status");

    console.log("Dashboard opportunities:", opportunities);

    res.json({
      applications: getApplicationOpportunities(opportunities)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error" });
  }
};

export const createPickup = async (req,res)=>{
 try{

  const pickup = await Pickup.create(req.body);

  res.status(201).json({
   success:true,
   data:pickup
  });

 }catch(err){
  res.status(500).json({msg:err.message});
 }
};


export const completePickup = async (req,res)=>{
 try{

  const pickup = await Pickup.findById(req.params.id);

  if(!pickup)
   return res.status(404).json({msg:"Pickup not found"});

  pickup.status="Completed";
  await pickup.save();

  res.json({
   message:"Pickup Completed",
   data:pickup
  });

 }catch(err){
  res.status(500).json({msg:err.message});
 }
};


export const getPickups = async (req,res)=>{
  try{
    console.log("GET pickups hit");
    const pickups = await Pickup.find();
    res.json(pickups);
  }catch(err){
    console.log(err);
    res.status(500).json({error:err.message});
  }
};



// add volunteer hours
export const createOpportunity = async (req, res) => {
  try {
    console.log("REQ.USER:", req.user);   // 🔹 check this
    console.log("REQ.BODY:", req.body);
    console.log("REQ.FILE:", req.file);

    const { title, description, location, date, duration, status } = req.body;
    const image = req.file ? req.file.path : null;


    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    const newOpportunity = await Opportunity.create({
      title,
      description,
      location,
      date,
      duration,
      status: status || "Open",
      image,
      createdBy: req.user._id
    });

    const volunteers = await User.find({ role: "volunteer", isSuspended: false }).select("_id name skills location locationCoords");

    if (volunteers.length > 0) {
      const matchedVolunteers = [];

      for (const volunteer of volunteers) {
        const match = await scoreOpportunityForVolunteer(volunteer, newOpportunity);
        if (match.isMatch && match.score >= 60) {
          matchedVolunteers.push(volunteer);
        }
      }

      const volunteerNotifications = matchedVolunteers.map((volunteer) => ({
        recipient: volunteer._id,
        sender: req.user._id,
        type: "opportunity_status",
        content: `New opportunity match: "${newOpportunity.title}" fits your waste interests and location.`,
        link: "/opportunities",
      }));

      if (volunteerNotifications.length > 0) {
        await Notification.insertMany(volunteerNotifications);
        matchedVolunteers.forEach((volunteer) => emitNotificationToUser(volunteer._id));
      }
    }

    res.status(201).json({ success: true, opportunity: newOpportunity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};



export const updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const existingOpportunity = await Opportunity.findById(id).populate("applicants.user", "name");

    if (!existingOpportunity) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    const updatedData = {
      title: req.body.title,
      description: req.body.description,
      location: req.body.location,
      date: req.body.date,
      duration: req.body.duration,
      status: req.body.status,
    };

    // If image uploaded
    if (req.file) {
      updatedData.image = req.file.path;
    }

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updatedData,
      { new: true }
    );

    const applicantRecipients = (existingOpportunity.applicants || [])
      .map((applicant) => applicant?.user?._id?.toString() || applicant?.user?.toString())
      .filter(Boolean)
      .filter((userId, index, list) => list.indexOf(userId) === index)
      .filter((userId) => userId !== req.user._id.toString());

    if (applicantRecipients.length > 0) {
      const applicantNotifications = applicantRecipients.map((recipient) => ({
        recipient,
        sender: req.user._id,
        type: "opportunity_status",
        content: `${req.user.name} updated the opportunity "${updatedOpportunity.title}". Please review the latest details.`,
        link: `/opportunity/${updatedOpportunity._id}`,
      }));

      await Notification.insertMany(applicantNotifications);
      applicantRecipients.forEach((recipient) => emitNotificationToUser(recipient));
    }

    res.status(200).json(updatedOpportunity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Update failed" });
  }
};



// get dashboard data
export const getDashboardData = async (req, res) => {
  try {
    await ensureStats();

    if (req.user.role === "ngo") {
      const ngoOpportunitiesRaw = await Opportunity.find({
        createdBy: req.user._id
      })
        .populate("applicants.user", "name email")
        .select("title description applicants date location duration wasteType requiredSkills status");

      const ngoOpportunities = getApplicationOpportunities(ngoOpportunitiesRaw);
      const allNgoOpportunities = ngoOpportunitiesRaw.map(normalizeOpportunityApplicants);

      const ngoPickups = await Pickup.find({
        $or: [
          { ngo: req.user._id },
          { ngo: { $exists: false }, status: "Pending" },
          { ngo: null, status: "Pending" },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(20);

      const activeOpportunities = await Opportunity.countDocuments({
        createdBy: req.user._id,
        status: "Open",
      });

      const completedPickups = await Pickup.countDocuments({
        ngo: req.user._id,
        status: { $in: ["Completed", "Closed"] },
      });

      const pendingPickups = await Pickup.countDocuments({
        $or: [
          { ngo: req.user._id, status: "Pending" },
          { ngo: { $exists: false }, status: "Pending" },
          { ngo: null, status: "Pending" },
        ],
      });

      const derivedStats = buildNgoStats(allNgoOpportunities, ngoPickups);
      const breakdown = buildMaterialBreakdown([
        ngoPickups.map((pickup) => pickup.wasteTypes || []),
        allNgoOpportunities.map((opportunity) => opportunity.wasteType || null),
      ]);

      return res.json({
        stats: {
          ...derivedStats,
          activeOpportunities,
          completedPickups,
          pendingPickups,
        },
        pickups: ngoPickups,
        breakdown,
        applications: ngoOpportunities,
        volunteerApplications: [],
      });
    }

    const allVolunteerPickups = await Pickup.find({ volunteer: req.user._id })
      .sort({ createdAt: -1 })
      .select("address city date timeSlot wasteTypes notes status createdAt");
    const pickups = allVolunteerPickups.slice(0, 5);
    const stats = buildVolunteerStats(allVolunteerPickups);

    const volunteerApplications = await Opportunity.find({
      $or: [
        { "applicants.user": req.user._id },
        { applicants: req.user._id },
      ],
    })
      .populate("applicants.user", "name email")
      .select("title applicants date location wasteType");

    const breakdown = buildMaterialBreakdown([
      allVolunteerPickups.map((pickup) => pickup.wasteTypes || []),
      volunteerApplications.map((opportunity) => opportunity.wasteType || null),
    ]);

    res.json({
      stats,
      pickups,
      breakdown,
      applications: [],
      volunteerApplications: getVolunteerApplicationSummaries(volunteerApplications, req.user._id),
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// add recycled items manually
export const addRecycledItems = async (req, res) => {
  try {
    await ensureStats();

    const { items } = req.body;

    if (!items || isNaN(items)) {
      return res.status(400).json({ msg: "Valid items value required" });
    }

    await Stats.updateOne({}, { $inc: { recycledItems: items } });

    await ActivityLog.create({
      user: "User",
      action: "Added Recycled Items",
      value: items
    });

    res.json({ message: "Recycled items added successfully" });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};


export const sendMessage = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const senderId = req.user._id;
    const { receiverId, text } = req.body;

    if (!receiverId || !text) {
      return res.status(400).json({
        message: "receiverId and text are required",
      });
    }

    const newMessage = await Message.create({
      senderId: senderId.toString(),
      receiverId: receiverId.toString(),
      text,
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("sendMessage Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { receiverId } = req.params;
    if (!req.user?._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const senderId = req.user._id.toString();

    const messages = await Message.find({
      $or: [
        { senderId, receiverId: receiverId.toString() },
        { senderId: receiverId.toString(), receiverId: senderId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("getMessages Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const clearConversation = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    if (!req.user?._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const currentUserId = req.user._id.toString();

    await Message.deleteMany({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId.toString() },
        { senderId: otherUserId.toString(), receiverId: currentUserId },
      ],
    });

    res.status(200).json({ message: "Conversation cleared successfully" });
  } catch (error) {
    console.error("clearConversation Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    if (!req.user?._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const currentUserId = req.user._id.toString();

    await Message.updateMany(
      { senderId: otherUserId.toString(), receiverId: currentUserId, isRead: { $ne: true } },
      { $set: { isRead: true } }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("markAsRead Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getUnreadCounts = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const currentUserId = req.user._id.toString();

    const result = await Message.aggregate([
      { $match: { receiverId: currentUserId, isRead: { $ne: true } } },
      { $group: { _id: "$senderId", count: { $sum: 1 } } }
    ]);

    const counts = {};
    result.forEach((item) => {
      counts[item._id] = item.count;
    });

    res.status(200).json(counts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export const applyOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);

    if (!opp) {
      return res.status(404).json({ msg: "Opportunity not found" });
    }

    const applicants = (opp.applicants || []).map((applicant) =>
      applicant?.user
        ? { user: applicant.user, status: applicant.status || "pending" }
        : { user: applicant, status: "pending" }
    );

    const alreadyApplied = applicants.some(
      (applicant) => applicant.user.toString() === req.user._id.toString()
    );

    if (!alreadyApplied) {
      opp.applicants = applicants;
      opp.applicants.push({ user: req.user._id, status: "pending" });
      await opp.save();
    }

    console.log("Applicants after apply:", opp.applicants);

    res.json({ msg: "Applied successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error" });
  }
};

