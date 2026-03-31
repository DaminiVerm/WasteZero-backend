import mongoose from "mongoose";

const statsSchema = new mongoose.Schema({
  totalPickups: Number,
  recycledItems: Number,
  co2Saved: Number,
  volunteerHours: Number
});

export default mongoose.model("Stats", statsSchema);
