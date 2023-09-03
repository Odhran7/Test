// This module gets all the earnings transcripts for a specific company

const dotenv = require("dotenv");
const https = require("https");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { ingestToPinecone } = require("../utils/ingest/ingestPincone");
const { Document } = require("langchain/document");
const pool = require("../utils/ingest/initDB");
const {
  extractSignificantWords,
} = require("../utils/ingest/keywordExtraction");
const { insertIntoVectors } = require("../utils/ingest/vectorIdInsertion");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeClient } = require("@pinecone-database/pinecone");

// dotenv.config();
dotenv.config({ path: "../../.env" });

const ingestEarningsTranscipts = async (ticker, company_id) => {
  const query =
    "INSERT INTO documents_tag (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";
  const processedData = [];
  try {
    const transcriptList = await getEarningsTranscriptList(ticker);
    for (const transcript of transcriptList) {
      const quarter = transcript[0];
      const year = transcript[1];
      const dateAndTime = transcript[2];

      let document_id;

      // Insert into db
      let type = "Earning Transcript";
      const values = [
        company_id,
        type,
        year,
        new Date(),
        "Unavailable",
        quarter,
      ];

      try {
        const result = await pool.query(query, values);
        document_id = result.rows[0].id;
      } catch (error) {
        console.error(
          "Error inserting into db Earnings Transcript: " + error.message
        );
        return;
      }

      // Retrieve the content of the earnings transcript
      const response = await getEarningsTranscript(ticker, quarter, year);

      // Split and tag the earning transcript
      const docs = await splitAndTag(
        response[0].content,
        dateAndTime,
        ticker,
        quarter,
        year,
        document_id,
        type
      );

      processedData.push(docs);
    }
  } catch (error) {
    console.error(error);
  }
};

// This module splits and tags the earning transcipt content with metadata

const splitAndTag = async (
  content,
  time,
  ticker,
  quarter,
  year,
  document_id,
  type
) => {
  let documentsWithMetadata;
  try {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const vector_id = await insertIntoVectors(document_id);

    const metadata = {
      id: document_id,
      ticker: ticker,
      type: type,
      year: year,
      quarter: quarter,
      time: time,
      vector_id: vector_id,
    };

    // Split the docs
    const docs = await textSplitter.splitDocuments([
      new Document({ id: vector_id, pageContent: content, metadata: metadata }),
    ]);

    // Add the metadata and keywords to the docs
    documentsWithMetadata = docs.map((doc) => {
      const keywords = extractSignificantWords(doc.pageContent, 25);
      return new Document({
        metadata: { ...metadata, keywords: keywords },
        pageContent: doc.pageContent,
      });
    });

    if (documentsWithMetadata.length > 0) {
      const filteredData = documentsWithMetadata.filter((doc) => {
        if (!doc) return false;
        if (Array.isArray(doc) && doc.length === 0) return false;
        if (Object.keys(doc).length === 0 && doc.constructor === Object)
          return false;
        return true;
      });
      const client = new PineconeClient();
      await client.init({
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT,
      });
      const pineconeIndex = client.Index(process.env.PINECONE_INDEX_NAME);
      await PineconeStore.fromDocuments(
        filteredData,
        new OpenAIEmbeddings(),
        {
          pineconeIndex,
        }
      );
    }

    // Log the success to the console
    console.log(
      `Earning transcript ${ticker} for quarter ${quarter} for ${year} has been uploaded successfully!`
    );
  } catch (error) {
    console.log("Error in earnings transcript ingest: " + error);
  }
  return documentsWithMetadata;
};

// Gets the list of transcripts with important data for a particular ticker

const getEarningsTranscriptList = (ticker) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "financialmodelingprep.com",
      port: 443,
      path:
        "/api/v4/earning_call_transcript?symbol=" +
        ticker +
        "&apikey=" +
        process.env.FINANCIAL_MODELLING_PREP_API_KEY,
      method: "GET",
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve(JSON.parse(data));
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.end();
  });
};

// This retrieves the content of a particular earnings transcript

const getEarningsTranscript = async (ticker, quarter, year) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "financialmodelingprep.com",
      port: 443,
      path:
        "/api/v3/earning_call_transcript/" +
        ticker +
        "?quarter=" +
        quarter +
        "&year=" +
        year +
        "&apikey=" +
        process.env.FINANCIAL_MODELLING_PREP_API_KEY,
      method: "GET",
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve(JSON.parse(data));
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.end();
  });
};

// ingestEarningsTranscipts("AAPL", 100000)
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

module.exports = {
  ingestEarningsTranscipts,
};
