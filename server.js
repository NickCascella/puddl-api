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

function doQuery(sql, params) {
  return new Promise((resolve, reject) => {
    con.query(sql, params, (err, result, fields) => {
      if (err) reject();
      else {
        resolve({ result, fields });
      }
    });
  });
}

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
      `SELECT chatrooms.chatroom_name FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id WHERE users.username = '${data.username}'`,
      (err, userData) => {
        if (err) {
          console.log(err);
          return;
        }

        if (userData.length) {
          let getData = async () => {
            return Promise.all(
              userData.map(async (chat) => {
                let allChatUsers = await doQuery(
                  `SELECT users.username FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id WHERE chatrooms.chatroom_name = '${chat.chatroom_name}'`
                );

                let roomUsers = allChatUsers.result.map((user) => {
                  return { username: user.username, online: false };
                });
                await socket.join(chat.chatroom_name);
                return {
                  joinedRoom: chat.chatroom_name,
                  chatUsers: roomUsers,
                };
                // con.query(
                //   `SELECT users.username FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id WHERE chatrooms.chatroom_name = '${chat.chatroom_name}'`,
                //   (err, allChatUsers) => {
                //     if (err) {
                //       console.log(err);
                //       return;
                //     }
                //     let roomUsers = allChatUsers.map((user) => {
                //       return { username: user.username, online: false };
                //     });

                //     socket.emit("fetch-user-chat", {
                //       joinedRoom: chat.chatroom_name,
                //       chatUsers: roomUsers,
                //     });
                //   }
                // );
              })
            );
          };
          getData().then((a) => {
            socket.emit("fetch-user-chat", a);
          });
        }
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
    const joinChatQuery = (chatroomID) => {
      con.query(
        `INSERT INTO users_chatrooms (chatroom_id, user_id) SELECT '${chatroomID}', user_id FROM users WHERE username = '${data.username}'`,
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

    //Check if room exists
    con.query(
      `SELECT chatrooms.chatroom_id , chatrooms.chatroom_name FROM chatrooms INNER JOIN users_chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id INNER JOIN users ON users.user_id = users_chatrooms.user_id WHERE chatroom_name = '${data.chatroom}'`,
      (err, chatroomData) => {
        if (err) {
          console.log(err);
          return err;
        }

        if (chatroomData.length) {
          //Join existing room if user not in it
          con.query(
            `SELECT users.user_id, users_chatrooms.chatroom_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id WHERE username = '${data.username}' AND chatroom_id = '${chatroomData[0].chatroom_id}'`,
            (err, results) => {
              if (err) {
                console.log(err);
                return;
              }
              //User in room already, do not join room
              if (results.length) {
                console.log("Already in chat");
                return;
              }
              //User not in room, join room
              joinChatQuery(chatroomData[0].chatroom_id);
            }
          );
        } else {
          //Create Room and join it
          con.query(
            `INSERT INTO chatrooms (chatroom_name) VALUES ('${data.chatroom}')`,
            (err, chatroomID) => {
              if (err) {
                console.log(err);
                return;
              }
              joinChatQuery(chatroomID.insertId);
            }
          );
        }
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
