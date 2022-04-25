const con = require("../mysql");
const bcrypt = require("bcryptjs");
const saltRounds = parseInt(process.env.SALT);
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

module.exports.authSignup = [
  body("username").isLength({ min: 1, max: 30 }).trim().escape(),
  body("password").isLength({ min: 1, max: 20 }).trim().escape(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send({ errors: errors.array() });
    }
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
  },
];

module.exports.authLogin = [
  body("username").isLength({ min: 1, max: 30 }).trim().escape(),
  body("password").isLength({ min: 1, max: 20 }).trim().escape(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send({ errors: errors.array() });
    }
    con.query(
      `SELECT * FROM users WHERE username = '${req.body.username}'`,
      (err, existingUsers) => {
        if (err) throw err;
        if (existingUsers[0]) {
          bcrypt.compare(
            JSON.stringify(req.body.password),
            existingUsers[0].password,
            function (err, result) {
              if (err) {
                console.log(err);
              }

              if (result) {
                let token = jwt.sign(
                  { user: existingUsers[0].username },
                  process.env.SECRET,
                  {
                    expiresIn: "1hr",
                  }
                );
                res
                  .status(200)
                  .send({ user: existingUsers[0].username, token });
              } else {
                res.status(400).send({ message: "Incorrect password." });
              }
            }
          );
        } else {
          res.status(400).send({ message: "User does not exist." });
        }
      }
    );
  },
];
