const jwt = require("jsonwebtoken");
require("dotenv").config();

const authorize = (req, res, next) => {
  const { authorization } = req.headers;
  const authToken = authorization.split(" ")[1];
  jwt.verify(authToken, process.env.SECRET, (err, decoded) => {
    if (err) {
      res.status(401).send({ error: "Invalid token." });
    } else {
      req.decoded = decoded;
      next();
    }
  });
};

module.exports = authorize;
