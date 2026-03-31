import mongoose from "mongoose";

const applicantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const opportunitySchema = new mongoose.Schema({
  title: String,
  description: String,
  location: String,
  date: String,
  duration: String,
  image: String,
  status: {
    type: String,
    default: "Open"
  },
  applicants: [applicantSchema],
createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  // required: true
},
requiredSkills: [String],
wasteType: String,
locationCoords: {
  type: { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], default: [0, 0] }
}

}, { timestamps: true });

opportunitySchema.index({ locationCoords: "2dsphere" });

export default mongoose.model("Opportunity", opportunitySchema);
