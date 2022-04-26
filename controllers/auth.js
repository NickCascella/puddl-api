const con = require("../mysql");
const bcrypt = require("bcryptjs");
const saltRounds = parseInt(process.env.SALT);
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

module.exports.authSignup = [
  body("username")
    .isLength({ min: 1, max: 30 })
    .withMessage("Username length must be between 1 - 20 characters.")
    .trim()
    .escape(),
  body("password")
    .trim()
    .escape()
    .isLength({ min: 3, max: 20 })
    .withMessage("Password length must be between 3 - 20 characters."),
  body("confirmPassword")
    .trim()
    .escape()
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match."),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send({ error: errors.array() });
    }
    con.query(
      `SELECT * FROM users WHERE username = '${req.body.username}'`,
      (err, existingUsers) => {
        if (err) throw err;
        if (existingUsers[0]) {
          res.status(400).send({
            error: [
              {
                msg: "User already exists.",
                param: "username",
              },
            ],
          });
        } else {
          bcrypt.hash(
            JSON.stringify(req.body.password),
            saltRounds,
            (err, hash) => {
              if (err) {
                return res.status(500).send({
                  error: [
                    {
                      msg: "Error hashing. User not created.",
                      param: "server",
                    },
                  ],
                });
              } else {
                con.query(
                  `INSERT INTO users (username, password) VALUES ('${req.body.username}', '${hash}')`,
                  (err, _inserted) => {
                    if (err) {
                      return res.status(500).send({
                        error: [
                          {
                            msg: "Error updating MySQL. User not created.",
                            param: "server",
                          },
                        ],
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
  body("username").trim().escape(),
  body("password").trim().escape(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send({ error: errors.array() });
    }
    con.query(
      `SELECT * FROM users WHERE username = '${req.body.username}'`,
      (err, existingUsers) => {
        if (err)
          return res.status(500).send({
            error: [
              {
                msg: "Error retrieving user. Login aborted.",
                param: "server",
              },
            ],
          });
        if (existingUsers[0]) {
          bcrypt.compare(
            JSON.stringify(req.body.password),
            existingUsers[0].password,
            (err, result) => {
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
                  .send({ user: existingUsers[0].username, success: token });
              } else {
                res.status(400).send({
                  error: [{ msg: "Incorrect password.", param: "password" }],
                });
              }
            }
          );
        } else {
          res.status(400).send({
            error: [{ msg: "User does not exist.", param: "username" }],
          });
        }
      }
    );
  },
];
