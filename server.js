require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const verifyToken = require("./utils/authenticate");
const { Server } = require("socket.io");
const con = require("./mysql");
const doQuery = require("./utils/query");

app.use(cors());
app.use(express.json());

//SOCKET STUFF
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});

let online = {};
io.on("connection", (socket) => {
  socket.on("online", async (data) => {
    try {
      const userDataQuery = await doQuery(
        `SELECT chatrooms.chatroom_name FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id WHERE users.username = '${data.username}'`
      );
      socket.username = data.username;
      online[socket.username] = true;
      const userData = userDataQuery.result;

      if (userData.length) {
        let getData = async () => {
          return Promise.all(
            userData.map(async (chat) => {
              let allChatUsers = await doQuery(
                `SELECT users.username FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id WHERE chatrooms.chatroom_name = '${chat.chatroom_name}'`
              );

              let roomUsers = allChatUsers.result.map((user) => {
                return {
                  username: user.username,
                  online: online[user.username] ? true : false,
                };
              });
              await socket.join(chat.chatroom_name);
              io.emit("other-user-online", {
                username: data.username,
              });
              return {
                joinedRoom: chat.chatroom_name,
                chatUsers: roomUsers,
              };
            })
          );
        };

        const userRoomInfo = await getData();

        socket.emit("fetch-user-chat", userRoomInfo);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("join-room", async (data) => {
    try {
      const joinChat = async (chatroomID) => {
        const joinChatQuery = await doQuery(
          `INSERT INTO users_chatrooms (chatroom_id, user_id) SELECT '${chatroomID}', user_id FROM users WHERE username = '${data.username}'`
        );
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
      };

      socket.on("retrieve-prior-messages", async (data) => {
        const getChatMessages = async (chatroom) => {
          try {
            const messages = await doQuery(
              `SELECT message, timestamp, chatroom_name as chatroom, username FROM messages INNER JOIN chatrooms ON chatrooms.chatroom_id = messages.chatroom_id INNER JOIN users ON users.user_id = messages.user_id WHERE chatroom_name = '${chatroom}' `
            );
            return messages.result;
          } catch (err) {
            console.log(err);
          }
        };

        const allMessages = await Promise.all(
          data.chatrooms.map((elem) => getChatMessages(elem))
        );
        const mergedAllMessages = [].concat.apply([], allMessages);

        socket.emit("retrieved-prior-messages", {
          allMessages: mergedAllMessages,
        });
      });

      //Check if room exists
      const chatroomDataQuery = await doQuery(
        `SELECT chatrooms.chatroom_id , chatrooms.chatroom_name FROM chatrooms INNER JOIN users_chatrooms ON users_chatrooms.chatroom_id = chatrooms.chatroom_id INNER JOIN users ON users.user_id = users_chatrooms.user_id WHERE chatroom_name = '${data.chatroom}'`
      );
      const chatroomData = chatroomDataQuery.result;
      if (chatroomData.length) {
        //Join existing room if user not in it
        const checkUserInChatQuery = await doQuery(
          `SELECT users.user_id, users_chatrooms.chatroom_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id WHERE username = '${data.username}' AND chatroom_id = '${chatroomData[0].chatroom_id}'`
        );
        const checkUserInChat = checkUserInChatQuery.result;
        //User in room already, do not join room
        if (checkUserInChat.length) {
          console.log("Already in chat");
          return;
        }
        //User not in room, join room
        joinChat(chatroomData[0].chatroom_id);
      } else {
        //Create Room and join it
        const createChatroomQuery = await doQuery(
          `INSERT INTO chatrooms (chatroom_name) VALUES ('${data.chatroom}')`
        );
        const createChatroom = createChatroomQuery.result;
        joinChat(createChatroom.insertId);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("send-message", async (data) => {
    try {
      const saveMessage = await doQuery(
        `INSERT INTO messages (message, timestamp, chatroom_id, user_id) SELECT '${
          data.message
        }', '${parseInt(
          data.timestamp
        )}', chatrooms.chatroom_id, users.user_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE username = '${
          data.username
        }' AND chatroom_name = '${data.chatroom}'`
      );

      io.to(data.chatroom).emit("display-message", {
        message: data.message,
        username: data.username,
        chatroom: data.chatroom,
        timestamp: data.timestamp,
      });
    } catch (err) {
      console.log("SEND MESSAGE ERR", err);
    }
  });

  socket.on("leave-chat", async (data) => {
    try {
      await socket.leave(data.chatroom);
      const leaveChatroom = await doQuery(
        `DELETE users_chatrooms FROM users_chatrooms INNER JOIN users ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE chatroom_name = '${data.chatroom}' AND username = '${data.username}' `
      );
      socket.emit("left-chat", {
        username: data.username,
        chatroom: data.chatroom,
      });
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
    } catch (err) {
      console.log(err);
    }
  });

  // socket.on("offline", () => {
  //   online[socket.username] = false;
  //   for (let room of socket.rooms) {
  //     io.to(room).emit("other-user-offline", { username: socket.username });
  //   }
  // });

  socket.on("disconnet", () => {
    online[socket.username] = false;
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
