// This util gets a companyId for a particular ticker

const dotenv = require("dotenv");
const pgParse = require("pg-connection-string");
const pg = require("pg");

dotenv.config({ path: "../../../.env" });

const getCompanyId = async (ticker) => {
  const query = `SELECT ID FROM COMPANIES_NEW WHERE ticker=$1;`;
  const values = [ticker];
  const config = pgParse.parse(process.env.DATABASE_URL);
  config.ssl = { rejectUnauthorized: false };
  const pool = new pg.Pool(config);
  try {
    const result = await pool.query(query, values);
    const companyId = result.rows[0].id;
    return companyId;
  } catch (error) {
    console.log("There was an error in getCompanyID");
    console.error(error);
  } finally {
    await pool.end();
  }
};

module.exports = {
  getCompanyId,
};
