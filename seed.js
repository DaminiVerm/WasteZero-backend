import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "./model/user.js";
import Opportunity from "./model/opportunity.js";
import ActivityLog from "./model/activitylog.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const seedData = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    // Clear existing data (optional - be careful in production!)
    await User.deleteMany({ email: { $in: ["admin@test.com", "volunteer@test.com", "ngo@test.com"] } });
    // await Opportunity.deleteMany({});
    // await ActivityLog.deleteMany({});

    const hashedPassword = await bcrypt.hash("password123", 10);

    // 1. Create Sample Users
    const admin = await User.create({
      name: "Admin User",
      email: "admin@test.com",
      username: "admin1",
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      location: "Central Hub",
      locationCoords: { type: "Point", coordinates: [77.5946, 12.9716] } // Bangalore
    });

    const ngo = await User.create({
      name: "Green Earth NGO",
      email: "ngo@test.com",
      username: "greenngo",
      password: hashedPassword,
      role: "ngo",
      isVerified: true,
      location: "North Wing",
      locationCoords: { type: "Point", coordinates: [77.6333, 13.0167] } // Nearby NGO
    });

    const volunteer = await User.create({
      name: "John Volunteer",
      email: "volunteer@test.com",
      username: "johnv",
      password: hashedPassword,
      role: "volunteer",
      isVerified: true,
      skills: ["Heavy Lifting", "Plastic Waste", "Driving"],
      location: "South Sector",
      locationCoords: { type: "Point", coordinates: [77.5806, 12.9279] } // Near Bangalore
    });

    console.log("Users Seeded Successfully!");

    // 2. Create Sample Opportunities
    const opportunities = [
      {
        title: "Community Plastic Cleanup - Jayanagar",
        description: "Help us clean up the local park. We need people expert in plastic waste collection.",
        location: "Jayanagar Metro Station",
        date: "2026-04-10",
        duration: "3 hours",
        wasteType: "Plastic Waste",
        requiredSkills: ["Plastic Waste", "Heavy Lifting"],
        status: "Open",
        createdBy: ngo._id,
        locationCoords: { type: "Point", coordinates: [77.5802, 12.9261] } // Within 2km of Volunteer
      },
      {
        title: "E-Waste Collection Drive",
        description: "Collecting old computers and phones for recycling.",
        location: "Electronic City Phase 1",
        date: "2026-04-15",
        duration: "5 hours",
        wasteType: "E-Waste",
        requiredSkills: ["Technical Support", "Driving"],
        status: "Open",
        createdBy: ngo._id,
        locationCoords: { type: "Point", coordinates: [77.6667, 12.8500] } // ~15km from Volunteer
      },
      {
        title: "Paper Recycling Workshop",
        description: "Teach school kids how to recycle paper at home.",
        location: "Hebbal",
        date: "2026-04-20",
        duration: "2 hours",
        wasteType: "Paper",
        requiredSkills: ["Teaching"],
        status: "Open",
        createdBy: admin._id,
        locationCoords: { type: "Point", coordinates: [77.5920, 13.0358] } // ~12km from Admin
      }
    ];

    await Opportunity.insertMany(opportunities);
    console.log("Opportunities Seeded Successfully!");

    // 3. Create Sample Logs
    await ActivityLog.create({
      user: "Admin User",
      action: "Seeded Initial Data",
      value: 1
    });

    console.log("Database Seeded Successfully! Closing connection...");
    await mongoose.connection.close();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedData();
