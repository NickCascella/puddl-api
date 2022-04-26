require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const verifyToken = require("./utils/authenticate");

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);

app.use("/test", verifyToken, (req, res) => {
  res.status(200).send({ response: req.decoded });
});

app.listen(process.env.PORT, () => {
  console.log(`Puddl API running on ${process.env.PORT}`);
});
