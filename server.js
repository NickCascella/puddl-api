require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const app = express();
const jwt = require("jsonwebtoken");

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Puddl API running on ${process.env.PORT}`);
});
