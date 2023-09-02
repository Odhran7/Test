const dotenv = require("dotenv");
const { initPinecone } = require('./utils/initPinecone');
const { get10KItemAndIngest } = require('./modules/ingest10k10qDocs');
const { get8KItemAndIngest } = require('./modules/ingest8kDocs');
const { getThirteenFAndIngest } = require('./modules/ingest13FDocs');
const { ingestNews } = require('./modules/ingestNewsPolygon');
const { getFilingsTicker } = require('./utils/ingest/getFillings');
const pgParse = require("pg-connection-string");
const pg = require("pg");
const { ingestEarningsTranscipts } = require("./modules/ingestEarningsTranscripts");
const { ingestPatents } = require('./modules/ingestPatents');

// dotenv.config();

dotenv.config({ path: '../.env' });

// Instantiate the database connection

const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = { rejectUnauthorized: false };
const pool = new pg.Pool(config);

const ingestCompany = async (ticker, domain) => {
    try {
      const pinecone = await initPinecone();
      const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
      const TenKTenQfilings = await getFilingsTicker(ticker, false, true, false, 3);
      const eightKFilings = await getFilingsTicker(ticker, true, false, false, 3);
      const thirteenFFilings = await getFilingsTicker(ticker, false, false, true, 3);
  
      const query = `SELECT * FROM companies WHERE ticker=$1;`;
      const values = [ticker];
      const result = await pool.query(query, values);
      let company_id = result.rows.length > 0 ? result.rows[0].id : null;
  
      if (!company_id) {
        const insertCompanyQuery = `INSERT INTO companies (ticker, url) VALUES ($1, $2) RETURNING id;`;
        const insertCompanyValues = [ticker, domain];
        const insertResult = await pool.query(insertCompanyQuery, insertCompanyValues);
        company_id = insertResult.rows[0].id;
      }

      // await get10KItemAndIngest(index, TenKTenQfilings, ticker, company_id);
      // await get8KItemAndIngest(index, eightKFilings, ticker, company_id); 
      await getThirteenFAndIngest(index, thirteenFFilings, ticker, company_id);
      // await ingestNews(index, ticker, company_id);
      // await ingestEarningsTranscipts(index, document_id, ticker);
      // await ingestPatents(index, company_id, ticker);

      console.log("Ingested Company into the database!");
      
    } catch (error) {
      console.error(error);
    }
  };

// Test the function running

(async () => {  
  await ingestCompany("AAPL", "apple.com");
})();

  module.exports = {
    ingestCompany,
  }