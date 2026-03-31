import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log("MongoDB connection failed:", error.message);
    console.log("⚠️ SERVER WILL RUN IN MOCK MODE (In-Memory Storage)");
  }
};

export default connectDB;
