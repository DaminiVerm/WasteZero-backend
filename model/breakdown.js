import mongoose from "mongoose";

const breakdownSchema = new mongoose.Schema({
  type: String,
  percent: Number
});

export default mongoose.model("Breakdown", breakdownSchema);
