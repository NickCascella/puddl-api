require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const verifyToken = require("./utils/authenticate");
const { Server } = require("socket.io");
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
              io.emit("other-user-status", {
                username: data.username,
                online: true,
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

  socket.on("get-old-notifications", async (data) => {
    try {
      const selected = await doQuery(
        `SELECT notifications.notifications, chatrooms.chatroom_name FROM notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id WHERE username = '${data.username}' AND notifications > 0`
      );
      if (selected.result.length) {
        let oldNotifications = {};
        for (const notification of selected.result) {
          oldNotifications[notification.chatroom_name] =
            notification.notifications;
        }

        socket.emit("retrieved-prior-notifications", oldNotifications);
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
          username: data.username,
        });
      };

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

        //Add Puddl account to new chatroom
        const joinChatQuery = await doQuery(
          `INSERT INTO users_chatrooms (chatroom_id, user_id) SELECT '${createChatroom.insertId}', user_id FROM users WHERE username = 'Puddl'`
        );

        //Add user to new chatroom
        joinChat(createChatroom.insertId);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("retrieve-prior-messages", async (data) => {
    const getChatMessages = async (chatroom) => {
      try {
        const messages = await doQuery(
          `SELECT message, timestamp, chatroom_name as chatroom, username FROM messages INNER JOIN chatrooms ON chatrooms.chatroom_id = messages.chatroom_id INNER JOIN users ON users.user_id = messages.user_id WHERE chatroom_name = '${chatroom}' ORDER BY messages.message_id desc LIMIT 10 `
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

  socket.on("fetch-additional-messages", async (data) => {
    try {
      const messages = await doQuery(
        `SELECT message, timestamp, chatroom_name as chatroom, username FROM messages INNER JOIN chatrooms ON chatrooms.chatroom_id = messages.chatroom_id INNER JOIN users ON users.user_id = messages.user_id WHERE chatroom_name = '${data.chatroom}' ORDER BY messages.message_id desc LIMIT ${data.offset}, 10 `
      );
      console.log(messages);
      socket.emit("fetched-additional-messages", messages.result);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("send-message", async (data) => {
    try {
      await doQuery(
        `INSERT INTO messages (message, timestamp, chatroom_id, user_id) SELECT '${
          data.message
        }', '${parseInt(
          data.timestamp
        )}', chatrooms.chatroom_id, users.user_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE username = '${
          data.username
        }' AND chatroom_name = '${data.chatroom}'`
      );

      const onlineUsers = io.sockets.adapter.rooms.get(data.chatroom);
      const roomUsersResults = await doQuery(
        `SELECT username from users INNER JOIN users_chatrooms ON users_chatrooms.user_id = users.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE chatroom_name = '${data.chatroom}'`
      );
      const roomUsers = roomUsersResults.result.map((user) => user.username);
      const offlineUsers = roomUsers.filter(
        (user) => !online[user] && user !== "Puddl"
      );
      offlineUsers.map(async (username) => {
        try {
          const selected = await doQuery(
            `SELECT notifications.notifications, chatrooms.chatroom_id, users.user_id FROM notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id WHERE username = '${username}' AND chatroom_name = '${data.chatroom}'`
          );
          if (selected.result.length) {
            await doQuery(
              `UPDATE notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id  SET notifications.notifications = notifications.notifications + 1 WHERE username = '${username}' AND chatroom_name = '${data.chatroom}'`
            );
          } else {
            await doQuery(
              `INSERT INTO notifications (notifications, chatroom_id, user_id) SELECT 1, chatrooms.chatroom_id, users.user_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE username = '${username}' AND chatroom_name = '${data.chatroom}'`
            );
          }
        } catch (err) {
          console.log(err);
        }
      });

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

  socket.on("log-notification", async (data) => {
    try {
      const selected = await doQuery(
        `SELECT notifications.notifications, chatrooms.chatroom_id, users.user_id FROM notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id WHERE username = '${data.username}' AND chatroom_name = '${data.chatroom}'`
      );
      if (selected.result.length) {
        await doQuery(
          `UPDATE notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id  SET notifications.notifications = notifications.notifications + 1 WHERE username = '${data.username}' AND chatroom_name = '${data.chatroom}'`
        );
      } else {
        await doQuery(
          `INSERT INTO notifications (notifications, chatroom_id, user_id) SELECT 1, chatrooms.chatroom_id, users.user_id FROM users INNER JOIN users_chatrooms ON users.user_id = users_chatrooms.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = users_chatrooms.chatroom_id WHERE username = '${data.username}' AND chatroom_name = '${data.chatroom}'`
        );
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("delete-notifications", async (data) => {
    console.log(data);
    try {
      await doQuery(
        `UPDATE notifications INNER JOIN users ON users.user_id = notifications.user_id INNER JOIN chatrooms ON chatrooms.chatroom_id = notifications.chatroom_id  SET notifications.notifications = 0 WHERE users.username = '${data.username}' AND chatrooms.chatroom_name = '${data.chatroom}'`
      );
      console.log("updated");
    } catch (err) {
      console.log(err);
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

      io.to(data.chatroom).emit("other-user-left", {
        username: data.username,
        chatroom: data.chatroom,
      });
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("offline", () => {
    online[socket.username] = false;

    for (let room of socket.rooms) {
      io.to(room).emit("other-user-status", {
        username: socket.username,
        online: false,
      });
    }
  });

  socket.on("disconnect", () => {
    online[socket.username] = false;
    console.log(socket.rooms);
    for (let room of socket.rooms) {
      console.log(room);
      io.to(room).emit("other-user-status", {
        username: socket.username,
        online: false,
      });
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
