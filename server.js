require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const verifyToken = require("./utils/authenticate");
const { Server } = require("socket.io");
const authorize = require("./utils/authenticate");

app.use(cors());
app.use(express.json());

//SOCKET STUFF
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});

io.on("connection", (socket) => {
  socket.on("disconnected", () => {
    console.log(`${socket.id} disconnected`);
  });
  socket.on("join-room", (data) => {
    socket.join(data.chatroom, "joining rooms");
    socket.emit("joined-room", { joinedRoom: data.chatroom });
  });
  socket.on("send-message", (data) => {
    io.to(data.chatroom).emit("display-message", {
      message: data.message,
      username: data.username,
      chatroom: data.chatroom,
    });
  });
});

//NOT SOCKET STUFF
app.use("/auth", authRoutes);
app.use("/test", verifyToken, (req, res) => {
  res.status(200).send({ response: req.decoded });
});

server.listen(process.env.PORT, () => {
  console.log(`Puddl API running on ${process.env.PORT}`);
});
