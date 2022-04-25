const con = require("../mysql");
const bcrypt = require("bcryptjs");
const saltRounds = 10;

module.exports.authSignup = (req, res) => {
  con.query(
    `SELECT * FROM users WHERE username = '${req.body.username}'`,
    (err, existingUsers) => {
      if (err) throw err;
      if (existingUsers[0]) {
        res.status(400).send({ response: "User already exists." });
      } else {
        bcrypt.hash(
          JSON.stringify(req.body.password),
          saltRounds,
          (err, hash) => {
            if (err) {
              return res
                .status(500)
                .send({ response: "Error hashing. User not created." });
            } else {
              con.query(
                `INSERT INTO users (username, password) VALUES ('${req.body.username}', '${hash}')`,
                (err, _inserted) => {
                  if (err) {
                    return res.status(500).send({
                      response: "Error updating MySQL. User not created.",
                    });
                  }
                  res.status(201).send({ response: "User created." });
                }
              );
            }
          }
        );
      }
    }
  );
};
