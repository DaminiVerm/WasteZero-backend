import jwt from "jsonwebtoken";
import User from "../model/user.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import mongoose from "mongoose";

// In-memory fallback storage
const mockUsers = [];

const isDbConnected = () => mongoose.connection.readyState === 1;

export const registerUser = async (req, res) => { 
  try {
    const { name, email, username, password, role } = req.body;

    // Check required fields
    if (!name || !email || !username || !password) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }

    // Check if email or username already exists
    if (isDbConnected()) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }
    } else {
      if (mockUsers.find(u => u.email === email)) {
        return res.status(400).json({ message: "Email already registered (Mock Mode)" });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Create new user (not verified yet)
    const newUser = new User({
      name,
      email,
      username,
      password: hashedPassword,
      role,
      isVerified: false,
      otp,
      otpExpiry
    });

    if (isDbConnected()) {
      await newUser.save();
    } else {
      mockUsers.push(newUser);
      console.log("Mock User Registered:", newUser.email);
    }

    // Send OTP to email
    try {
      await sendEmail(email, otp);
    } catch (e) {
      console.log("Email sending failed, but continuing in mock mode with OTP:", otp);
    }

    res.status(201).json({
      message: "OTP sent to your email. Please verify to complete registration. (OTP: " + otp + ")",
      userId: newUser._id
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
 };

export const verifyRegisterOtp = async (req, res) => { 
   try {
    const { userId, otp } = req.body;

    const user = isDbConnected() 
      ? await User.findById(userId)
      : mockUsers.find(u => String(u._id) === String(userId));

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (String(user.otp) !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;

    if (isDbConnected()) {
      await user.save();
    }

    res.status(200).json({
      message: "Account verified successfully"
    });

  } catch (error) {
    res.status(500).json({
      message: "OTP verification failed",
      error: error.message
    });
  }
 };

export const loginUser = async (req, res) => { 
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = isDbConnected()
      ? await User.findOne({ email })
      : mockUsers.find(u => u.email === email);

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: "Please verify your email first" });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: "Your account has been suspended by the admin." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate OTP for login
    const otp = crypto.randomInt(100000, 999999).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;

    if (isDbConnected()) {
      await user.save();
    }
    
    try {
      await sendEmail(email, otp);
    } catch (e) {
      console.log("Login OTP mail failed, but continuing with OTP:", otp);
    }

    res.status(200).json({
      message: "OTP sent to your email. (OTP: " + otp + ")",
      userId: user._id
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
 };

export const verifyLoginOtp = async (req, res) => { 
  try {
    const { userId, otp } = req.body;

    const user = isDbConnected()
      ? await User.findById(userId)
      : mockUsers.find(u => String(u._id) === String(userId));

   if (!user) {
  return res.status(400).json({ message: "User not found" });
}

if (String(user.otp) !== String(otp)) {
  return res.status(400).json({ message: "Invalid OTP" });
}

if (user.otpExpiry < Date.now()) {
  return res.status(400).json({ message: "OTP expired" });
}

if (user.isSuspended) {
  return res.status(403).json({ message: "Your account has been suspended by the admin." });
}

    user.otp = null;
    user.otpExpiry = null;

    if (isDbConnected()) {
      await user.save();
    }

    // Generate JWT after OTP success
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({
      message: "OTP verification failed",
      error: error.message
    });
  }
 };

export const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    const user = isDbConnected()
      ? await User.findById(userId)
      : mockUsers.find(u => String(u._id) === String(userId));

    if (!user) return res.status(400).json({ message: "User not found" });

    const otp = crypto.randomInt(100000, 999999).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;

    if (isDbConnected()) await user.save();

    try {
      await sendEmail(user.email, otp);
    } catch (e) {
      console.log("Resend OTP mail failed, but continuing with OTP:", otp);
    }

    res.status(200).json({
      message: "New OTP sent to your email. (OTP: " + otp + ")"
    });
  } catch (error) {
    res.status(500).json({ message: "Resend OTP failed", error: error.message });
  }
};
