const con = require("../mysql");
const doQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
    con.query(sql, params, (err, result, fields) => {
      if (err) reject({ err });
      else {
        resolve({ result, fields });
      }
    });
  });
};

module.exports = doQuery;
