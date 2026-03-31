import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./model/user.js";

dotenv.config();

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = await User.find({}, "name email username isVerified role");
    console.log("Registered Users in Database:");
    console.log(JSON.stringify(users, null, 2));
    await mongoose.connection.close();
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
};

checkUsers();
