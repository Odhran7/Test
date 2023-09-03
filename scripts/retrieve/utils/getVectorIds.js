// This util gets a list of vector Ids for an array of document_ids

const dotenv = require("dotenv");
const pgParse = require("pg-connection-string");
const pg = require("pg");

dotenv.config({ path: "../../../.env" });

const getVectorIds = async (documentIds) => {
  const query = `SELECT id FROM vectors WHERE document_id = ANY($1);`;
  const values = [documentIds];
  const config = pgParse.parse(process.env.DATABASE_URL);
  config.ssl = { rejectUnauthorized: false };
  const pool = new pg.Pool(config);
  try {
    const result = await pool.query(query, values);
    const vector_ids = result.rows.map((row) => row.id);
    return vector_ids;
  } catch (error) {
    console.log("There was an error in getVectorIds");
    console.error(error);
  } finally {
    await pool.end();
  }
};

module.exports = {
  getVectorIds,
};
