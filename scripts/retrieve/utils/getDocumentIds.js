// This util gets a list of doc ids for a particular type and company

const dotenv = require("dotenv");
const pgParse = require("pg-connection-string");
const pg = require("pg");

dotenv.config({ path: "../../../.env" });

const getDocumentIds = async (company_id, type) => {
    const query = `SELECT * FROM documents_tag WHERE company_id=$1 AND document_type=$2;`;
    const values = [company_id, type];
    const config = pgParse.parse(process.env.DATABASE_URL);
    config.ssl = { rejectUnauthorized: false };
    const pool = new pg.Pool(config);
    try {
      const result = await pool.query(query, values);
      const document_ids = result.rows.map(row => row.id);
      return document_ids;
    } catch (error) {
      console.log("There was an error in getCompanyID");
      console.error(error);
    } finally {
      await pool.end();
    }
  };

module.exports = {
  getDocumentIds,
};
