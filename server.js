import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import opportunityRoutes from "./routes/opportunityRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import pickupRoutes from "./routes/pickupRoutes.js";
import { Server } from "socket.io";
import Message from "./model/messages.js";
import http from "http";
import userRoutes from "./routes/userRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import dashboardRoutes from "./routes/dashboardRoute.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import Notification from "./model/notification.js";
import adminRoutes from "./routes/adminRoutes.js";
import {
  addConnectedUser,
  emitMessageToUser,
  emitNotificationToUser,
  removeConnectedUserBySocket,
  setSocketInstance,
} from "./utils/socket.js";

import { getDashboardData } from "./controller/dashboardController.js";

dotenv.config();
connectDB();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", userRoutes); // auth routes: /login, /register, /verify-otp
app.use("/api/opportunity", opportunityRoutes);
app.use("/api/pickups", pickupRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.get("/api/test", (req, res) => {
  res.send("Backend is working!");
});

const io = new Server(server, {
  cors: {
    origin: ["https://wastezero-smart-waste-platform-frontend.onrender.com"],
    methods: ["GET", "POST"],
  },
});
setSocketInstance(io);

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("addUser", (userId) => {
    addConnectedUser(userId, socket.id);
  });

  socket.on("sendMessage", async ({ senderId, receiverId, text }) => {
    try {
      const isSelfMessage =
        senderId?.toString() === receiverId?.toString();

      if (!isSelfMessage) {
        await Notification.create({
          recipient: receiverId,
          sender: senderId,
          type: "message",
          content: `New message: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
          link: "/messages",
        });
      }

      emitMessageToUser(receiverId, { senderId, receiverId, text });
      if (!isSelfMessage) {
        emitNotificationToUser(receiverId);
      }
    } catch (error) {
      console.log("Socket message error:", error);
    }
  });

  socket.on("disconnect", () => {
    removeConnectedUserBySocket(socket.id);
    console.log("User disconnected");
  });
});

export default app;
