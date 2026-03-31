import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },

    username: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["volunteer", "ngo", "admin"],
      default: "volunteer"
    },

    location: {
      type: String,
      default: ""
    },

    skills: [
      {
        type: String
      }
    ],

    bio: {
      type: String,
      default: ""
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    isSuspended: {
      type: Boolean,
      default: false
    },

    loginOtp: String, 
    
    loginOtpExpire: Date,


    otp: {
      type: String,
      default: null
    },

    otpExpiry: {
      type: Date,
      default: null
    },

    locationCoords: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
    }
  },
  { timestamps: true }
);

userSchema.index({ locationCoords: "2dsphere" });

export default mongoose.model("User", userSchema);
