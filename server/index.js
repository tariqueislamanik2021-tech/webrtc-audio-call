const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// serve client
app.use(express.static(path.join(__dirname, "../client")));

// userId <-> socketId maps
const users = new Map();   // userId -> socketId
const sockets = new Map(); // socketId -> userId

function isValidUserId(userId) {
  return /^[0-9]{4}$/.test(String(userId));
}

function getSocketByUserId(userId) {
  return users.get(String(userId));
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // 1) Register 4-digit ID
  socket.on("register", ({ userId }) => {
    userId = String(userId || "").trim();

    if (!isValidUserId(userId)) {
      return socket.emit("register-error", { message: "ID must be exactly 4 digits (0000-9999)" });
    }

    // যদি অন্য কেউ একই ID নিয়ে already online থাকে
    const existingSocket = users.get(userId);
    if (existingSocket && existingSocket !== socket.id) {
      return socket.emit("register-error", { message: "This ID is already in use. Choose another." });
    }

    // আগের কোনো ID থাকলে clean
    const oldId = sockets.get(socket.id);
    if (oldId && oldId !== userId) users.delete(oldId);

    users.set(userId, socket.id);
    sockets.set(socket.id, userId);

    socket.emit("registered", { userId });
    io.emit("online-users", { users: Array.from(users.keys()) });
  });

  // 2) Call request by target ID
  socket.on("call-user", ({ toUserId }) => {
    const fromUserId = sockets.get(socket.id);
    toUserId = String(toUserId || "").trim();

    if (!fromUserId) return socket.emit("call-error", { message: "Register your ID first." });
    if (!isValidUserId(toUserId)) return socket.emit("call-error", { message: "Target ID must be 4 digits." });
    if (toUserId === fromUserId) return socket.emit("call-error", { message: "You cannot call yourself." });

    const toSocket = getSocketByUserId(toUserId);
    if (!toSocket) return socket.emit("user-offline", { toUserId });

    io.to(toSocket).emit("incoming-call", { fromUserId });
    socket.emit("calling", { toUserId });
  });

  // 3) Accept / Reject
  socket.on("call-accept", ({ toUserId }) => {
    const fromUserId = sockets.get(socket.id); // acceptor
    toUserId = String(toUserId || "").trim();
    const toSocket = getSocketByUserId(toUserId);
    if (toSocket) io.to(toSocket).emit("call-accepted", { by: fromUserId });
  });

  socket.on("call-reject", ({ toUserId, reason }) => {
    const fromUserId = sockets.get(socket.id);
    toUserId = String(toUserId || "").trim();
    const toSocket = getSocketByUserId(toUserId);
    if (toSocket) io.to(toSocket).emit("call-rejected", { by: fromUserId, reason: reason || "Rejected" });
  });

  // 4) WebRTC signaling by ID (offer/answer/ice)
  socket.on("offer", ({ toUserId, offer }) => {
    const fromUserId = sockets.get(socket.id);
    const toSocket = getSocketByUserId(String(toUserId || "").trim());
    if (toSocket) io.to(toSocket).emit("offer", { fromUserId, offer });
  });

  socket.on("answer", ({ toUserId, answer }) => {
    const fromUserId = sockets.get(socket.id);
    const toSocket = getSocketByUserId(String(toUserId || "").trim());
    if (toSocket) io.to(toSocket).emit("answer", { fromUserId, answer });
  });

  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    const fromUserId = sockets.get(socket.id);
    const toSocket = getSocketByUserId(String(toUserId || "").trim());
    if (toSocket) io.to(toSocket).emit("ice-candidate", { fromUserId, candidate });
  });

  // 5) End call
  socket.on("end-call", ({ toUserId }) => {
    const fromUserId = sockets.get(socket.id);
    const toSocket = getSocketByUserId(String(toUserId || "").trim());
    if (toSocket) io.to(toSocket).emit("call-ended", { by: fromUserId });
  });

  // 6) Disconnect cleanup
  socket.on("disconnect", () => {
    const userId = sockets.get(socket.id);
    if (userId) users.delete(userId);
    sockets.delete(socket.id);
    io.emit("online-users", { users: Array.from(users.keys()) });
    console.log("Disconnected:", socket.id, "userId:", userId);
  });
});

server.listen(3000, () => console.log("✅ Open http://localhost:3000"));
