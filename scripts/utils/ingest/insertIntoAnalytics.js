// This util inserts ingest analytics into the db

const pool = require("./initDB");
const dotenv = require("dotenv");

dotenv.config({ path: "../.env" });

// dotenv.config();

const insertIngestAnalytics = async (ticker, time) => {
  const analyticsQuery = `insert into ingest_analytics (ticker, time_to_ingest) values ($1, $2);`;
  const values = [ticker, time];
  try {
    const result = await pool.query(analyticsQuery, values);
  } catch (error) {
    console.log("There was an error inserting the analytics");
    console.error(error);
    return;
  }
};

module.exports = {
  insertIngestAnalytics,
};
