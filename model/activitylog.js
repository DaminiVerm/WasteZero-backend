import mongoose from "mongoose"; 
const activitySchema = new mongoose.Schema({ 
  user: String, 
  action: String, 
  value: Number, 
  createdAt: { type: Date, default: Date.now } }); 
export default mongoose.model("ActivityLog", activitySchema);