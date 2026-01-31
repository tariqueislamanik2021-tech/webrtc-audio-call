const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

/* ================================
   Serve Client Folder
================================ */
const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

/* ================================
   Create HTTP Server + Socket.IO
================================ */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

/* ================================
   Store Online Users
   userId -> socket.id
================================ */
const users = new Map();

function onlineUsersArray() {
  return Array.from(users.keys()).sort();
}

function broadcastOnlineUsers() {
  io.emit("online-users", { users: onlineUsersArray() });
}

/* ================================
   Socket Connection
================================ */
io.on("connection", (socket) => {
  console.log("✅ New socket connected:", socket.id);

  /* -------- Register User ID -------- */
  socket.on("register", ({ userId }) => {
    const cleanId = String(userId || "").trim();

    // Must be 4-digit
    if (!/^\d{4}$/.test(cleanId)) {
      socket.emit("error-msg", {
        message: "Invalid ID. Must be exactly 4 digits.",
      });
      return;
    }

    // Kick old socket if duplicate login
    const oldSocketId = users.get(cleanId);
    if (oldSocketId && oldSocketId !== socket.id) {
      io.to(oldSocketId).emit("force-logout", {
        message: "You logged in from another device/tab.",
      });
    }

    // Save user
    users.set(cleanId, socket.id);
    socket.data.userId = cleanId;

    socket.emit("registered", { userId: cleanId });

    broadcastOnlineUsers();
    console.log("✅ Registered User:", cleanId);
  });

  /* -------- Call User -------- */
  socket.on("call-user", ({ toUserId }) => {
    const fromUserId = socket.data.userId;

    if (!fromUserId) {
      socket.emit("error-msg", { message: "Please Set ID first." });
      return;
    }

    const targetId = String(toUserId || "").trim();

    if (!/^\d{4}$/.test(targetId)) {
      socket.emit("error-msg", { message: "Target ID must be 4 digits." });
      return;
    }

    const toSocketId = users.get(targetId);

    if (!toSocketId) {
      socket.emit("user-offline", { toUserId: targetId });
      return;
    }

    io.to(toSocketId).emit("incoming-call", { fromUserId });
    socket.emit("calling", { toUserId: targetId });

    console.log(`📞 ${fromUserId} is calling ${targetId}`);
  });

  /* -------- Accept Call -------- */
  socket.on("call-accept", ({ toUserId }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("call-accepted", { fromUserId });
    }
  });

  /* -------- Reject Call -------- */
  socket.on("call-reject", ({ toUserId }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("call-rejected", { fromUserId });
    }
  });

  /* -------- WebRTC Offer -------- */
  socket.on("webrtc-offer", ({ toUserId, offer }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("webrtc-offer", { fromUserId, offer });
    }
  });

  /* -------- WebRTC Answer -------- */
  socket.on("webrtc-answer", ({ toUserId, answer }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("webrtc-answer", { fromUserId, answer });
    }
  });

  /* -------- ICE Candidate -------- */
  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("ice-candidate", {
        fromUserId,
        candidate,
      });
    }
  });

  /* -------- End Call -------- */
  socket.on("end-call", ({ toUserId }) => {
    const fromUserId = socket.data.userId;
    const targetId = String(toUserId || "").trim();

    const toSocketId = users.get(targetId);

    if (toSocketId) {
      io.to(toSocketId).emit("call-ended", { fromUserId });
    }

    console.log(`❌ Call ended between ${fromUserId} and ${targetId}`);
  });

  /* -------- Disconnect -------- */
  socket.on("disconnect", () => {
    const userId = socket.data.userId;

    if (userId && users.get(userId) === socket.id) {
      users.delete(userId);
      broadcastOnlineUsers();
      console.log("❌ User disconnected:", userId);
    }
  });
});

/* ================================
   Start Server
================================ */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
