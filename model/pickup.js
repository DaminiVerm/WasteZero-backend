import mongoose from "mongoose";

const pickupSchema = new mongoose.Schema({
  address: { type: String, required: true },
  city: { type: String, required: true },
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },

  wasteTypes: {
    type: [String],
    required: true
  },

  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ngo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,

  // ✅ ADD THIS
  status: {
    type: String,
    enum: ["Pending", "Accepted", "In Progress", "Completed", "Rejected", "Closed"],
    default: "Pending"
  }
},{ timestamps: true });

export default mongoose.model("Pickup", pickupSchema);