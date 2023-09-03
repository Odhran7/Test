const dotenv = require("dotenv");

const { get10KItemAndIngest } = require("./modules/ingest10k10qDocs");
const { get8KItemAndIngest } = require("./modules/ingest8kDocs");
const { getThirteenFAndIngest } = require("./modules/ingest13FDocs");
const { ingestNews } = require("./modules/ingestNewsPolygon");
const { getFilingsTicker } = require("./utils/ingest/getFillings");
const pgParse = require("pg-connection-string");
const pg = require("pg");
const {
  ingestEarningsTranscipts,
} = require("./modules/ingestEarningsTranscripts");
const { ingestPatents } = require("./modules/ingestPatents");
const { insertIngestAnalytics } = require("./utils/ingest/insertIntoAnalytics");
const { getPeers } = require("./utils/main/competitors");
const { severConnection } = require("./utils/ingest/severConnection");

// dotenv.config();

dotenv.config({ path: "../.env" });

// Instantiate the database connection

const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = { rejectUnauthorized: false };
const pool = new pg.Pool(config);

const ingestCompany = async (ticker) => {
  try {

    // Adding timer for debug purposes

    console.time("ingestCompany");
    const startTime = process.hrtime();

    // Get filings set up for regulatory documentation

    const TenKTenQfilings = await getFilingsTicker(
      ticker,
      false,
      true,
      false,
      3
    );
    const eightKFilings = await getFilingsTicker(ticker, true, false, false, 3);
    const thirteenFFilings = await getFilingsTicker(
      ticker,
      false,
      false,
      true,
      3
    );

    // Insert the company into the db

    const query = `SELECT * FROM companies_new WHERE ticker=$1;`;
    const values = [ticker];
    let company_id;
    try {
      const result = await pool.query(query, values);
      company_id = result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.log("There was an error inserting the company into the db");
      console.error(error);
    }

    if (!company_id) {
      const insertCompanyQuery = `INSERT INTO companies_new (ticker) VALUES ($1) RETURNING id;`;
      const insertCompanyValues = [ticker];
      const insertResult = await pool.query(
        insertCompanyQuery,
        insertCompanyValues
      );
      company_id = insertResult.rows[0].id;
    }

    // Main

    // await get10KItemAndIngest(TenKTenQfilings, ticker, company_id);
    // await get8KItemAndIngest(eightKFilings, ticker, company_id);
    // await getThirteenFAndIngest(thirteenFFilings, ticker, company_id);
    // await ingestNews(ticker, company_id);
    // await ingestEarningsTranscipts(ticker, company_id);
    await ingestPatents(company_id, ticker);

    console.log("Ingested Company into the database!");
    const endTime = process.hrtime(startTime);
    const elapsedTime = endTime[0] * 1000 + endTime[1] / 1e6;
    const seconds = elapsedTime / 1000;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const interval = `${hours}:${minutes}:${remainingSeconds}`;

    // Analytics insertion

    try {
      await insertIngestAnalytics(ticker, interval);
    } catch (error) {
      console.log("There was an error in the ingest analytics insertion!");
      console.error(error);
    }
    console.timeEnd("ingestCompany");
  } catch (error) {
    console.error(error);
  }

  // sever the connection

  // await severConnection(pool);

};

// Test the function running

// (async () => {
//   const peers = await getPeers("AAPL");
//   for (const peer of peers) {
//     console.log(`Starting ingestion for ${peer}`);
//     await ingestCompany(peer);
//     console.log("Done ingestion for " + peer);
//   }

// })();

(async () => {
  await ingestCompany("AAPL");
})();

module.exports = {
  ingestCompany,
};
