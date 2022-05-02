require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const verifyToken = require("./utils/authenticate");
const { Server } = require("socket.io");
const con = require("./mysql");

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
  socket.on("online", (data) => {
    con.query(
      `SELECT users.user_id, chatrooms.chatname FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id WHERE username = '${data.username}'`,
      (err, existingUsers) => {
        if (err) {
          console.log(err);
          return;
        }
        if (existingUsers.length) {
          existingUsers.forEach(async (chat) => {
            await socket.join(chat.chat_name);
          });
        }

        // socket.emit("retrieve-chatlogs", {});
      }
    );

    if (data.username) {
      socket.username = data.username;
      socket.emit("other-user-online", {
        username: data.username,
      });
    }
  });

  socket.on("join-room", (data) => {
    const joinChatQuery = (chatroomID, userID) => {
      con.query(
        `INSERT INTO users_chatrooms (chatroom_id, user_id) VALUES ('${chatroomID}', '${userID}')`,
        async (err, _inserted) => {
          if (err) {
            console.log(err);
          }
          const joiningRoom = await socket.join(data.chatroom, "joining rooms");

          let getRoomUsers = await io.in(data.chatroom).fetchSockets();
          let usernames = getRoomUsers.map((connection) => {
            return { username: connection.username, online: true };
          });
          io.to(data.chatroom).emit("joined-room", {
            joinedRoom: data.chatroom,
            chatUsers: usernames,
          });

          io.to(data.chatroom).emit("display-message", {
            message: `${data.username} has joined!`,
            username: "Puddl",
            chatroom: data.chatroom,
            timestamp: data.timestamp,
          });
        }
      );
    };

    con.query(
      `SELECT users.user_id FROM users WHERE username = '${data.username}'`,
      (err, userID) => {
        if (err) {
          console.log(err);
        }
        if (!userID.length) {
          console.log("Invalid user");
          return;
        }
        con.query(
          `SELECT chatrooms.chatroom_id FROM chatrooms WHERE chatroom_name = '${data.chatroom}'`,
          (err, chatroomID) => {
            if (err) {
              console.log(err);
              return;
            }

            if (chatroomID.length) {
              con.query(
                `SELECT users.user_id, users_chatrooms.chatroom_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id WHERE username = '${data.username}' AND chatroom_id = '${chatroomID[0].chatroom_id}'`,
                (err, results) => {
                  if (err) {
                    console.log(err);
                    return;
                  }

                  if (results.length) {
                    console.log("Already in chat");
                    return;
                  }
                  joinChatQuery(chatroomID[0].chatroom_id, userID[0].user_id);
                }
              );
            } else {
              con.query(
                `INSERT INTO chatrooms (chatroom_name) VALUES ('${data.chatroom}')`,
                (err, chatroomID) => {
                  if (err) {
                    console.log(err);
                    return;
                  }
                  joinChatQuery(chatroomID.insertId, userID[0].user_id);
                }
              );
            }
          }
        );
      }
    );
  });

  socket.on("send-message", (data) => {
    io.to(data.chatroom).emit("display-message", {
      message: data.message,
      username: data.username,
      chatroom: data.chatroom,
      timestamp: data.timestamp,
    });
  });

  socket.on("leave-chat", async (data) => {
    socket.emit("left-chat", {
      username: data.username,
      chatroom: data.chatroom,
    });
    await socket.leave(data.chatroom);
    io.to(data.chatroom).emit("display-message", {
      message: `${data.username} has left!`,
      username: "Puddl",
      chatroom: data.chatroom,
      timestamp: data.timestamp,
    });
    io.to(data.chatroom).emit("other-user-left", {
      username: data.username,
      chatroom: data.chatroom,
    });
  });

  socket.on("offline", () => {
    for (let room of socket.rooms) {
      io.to(room).emit("other-user-offline", { username: socket.username });
    }
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
