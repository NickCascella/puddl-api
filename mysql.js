require("dotenv").config();
const mysql = require("mysql");

let con = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USERNAME,
  password: process.env.PASSWORD,
  database: process.env.DB,
});

module.exports = con;
