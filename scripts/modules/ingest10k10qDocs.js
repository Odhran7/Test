// This module gets all the 10k/10q records for a specific company

const dotenv = require("dotenv");
const { ingestToPinecone } = require("../utils/ingest/ingestPincone");
const { PineconeClient } = require("@pinecone-database/pinecone");
const pool = require("../utils/ingest/initDB");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");
const { queryApi } = require("sec-api");
const {
  extractSignificantWords,
} = require("../utils/ingest/keywordExtraction");
const { insertIntoVectors } = require("../utils/ingest/vectorIdInsertion");
const { getSectionWithRetry } = require("../utils/ingest/RateLimit");
const { severConnection } = require("../utils/ingest/severConnection");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");

// dotenv.config();
dotenv.config({ path: "../.env" });

queryApi.setApiKey(process.env.SEC_API_KEY);

const get10KItemAndIngest = async (filings, ticker, company_id) => {
  const itemDict10K = {
    1: "Business",
    "1A": "Risk Factors",
    "1B": "Unresolved Staff Comments",
    2: "Properties",
    3: "Legal Proceedings",
    4: "Mine Safety Disclosures",
    5: "Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities",
    6: "Selected Financial Data (prior to February 2021)",
    7: "Management’s Discussion and Analysis of Financial Condition and Results of Operations",
    "7A": "Quantitative and Qualitative Disclosures about Market Risk",
    8: "Financial Statements and Supplementary Data",
    9: "Changes in and Disagreements with Accountants on Accounting and Financial Disclosure",
    "9A": "Controls and Procedures",
    "9B": "Other Information",
    10: "Directors, Executive Officers and Corporate Governance",
    11: "Executive Compensation",
    12: "Security Ownership of Certain Beneficial Owners and Management and Related Stockholder Matters",
    13: "Certain Relationships and Related Transactions, and Director Independence",
    14: "Principal Accountant Fees and Services",
  };

  const itemDict10Q = {
    part1item1: "Business",
    part1item2: "Risk Factors",
    part1item3: "Unresolved Staff Comments",
    part1item4: "Properties",
    part2item1: "Legal Proceedings",
    part2item1a: "Mine Safety Disclosures",
    part2item2:
      "Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities",
    part2item3: "Selected Financial Data (prior to February 2021)",
    part2item4:
      "Management’s Discussion and Analysis of Financial Condition and Results of Operations",
    part2item5: "Quantitative and Qualitative Disclosures about Market Risk",
    part2item6: "Financial Statements and Supplementary Data",
  };
  const query =
    "INSERT INTO documents_tag (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";

  let documentsWithMetadata = [];

  let document_id;

  for (let year in filings) {
    let type;

    if (Array.isArray(filings[year]["10-Q"])) {
      const promises = filings[year]["10-Q"].map(async (link) => {
        type = "10Q";
        const values = [
          company_id,
          type,
          year,
          new Date(),
          link.html,
          link.month,
        ];
        try {
          const result = await pool.query(query, values);
          document_id = result.rows[0].id;
        } catch (error) {
          console.error("Error inserting into db 10Q: " + error.message);
          return;
        }

        const docsPromises = Object.keys(itemDict10Q).map((item) =>
          get10KItemTxtAndIngest(
            link.link,
            link.txt,
            item,
            document_id,
            ticker,
            type,
            year
          )
        );
        return Promise.all(docsPromises);
      });
      const nestedDocs = await Promise.all(promises);
      documentsWithMetadata = documentsWithMetadata.concat(
        ...nestedDocs.flat()
      );
    }

    if (Array.isArray(filings[year]["10-K"])) {
      const promises = filings[year]["10-K"].map(async (link) => {
        type = "10K";
        const values = [
          company_id,
          type,
          year,
          new Date(),
          link.html,
          link.month,
        ];
        try {
          const result = await pool.query(query, values);
          document_id = result.rows[0].id;
        } catch (error) {
          console.error("Error inserting into db 10K: " + error.message);
          return;
        }

        const docsPromises = Object.keys(itemDict10K).map((item) =>
          get10KItemTxtAndIngest(
            link.link,
            link.txt,
            item,
            document_id,
            ticker,
            type,
            year
          )
        );
        return Promise.all(docsPromises);
      });
      const nestedDocs = await Promise.all(promises);
      documentsWithMetadata = documentsWithMetadata.concat(
        ...nestedDocs.flat()
      );
    }
  }

  if (documentsWithMetadata.length > 0) {
    documentsWithMetadata = documentsWithMetadata.filter((doc) => {
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
    await PineconeStore.fromDocuments(documentsWithMetadata, new OpenAIEmbeddings(), {
      pineconeIndex
    });
  }
  console.log(documentsWithMetadata);

  // const embeddings = new OpenAIEmbeddings();
  // if (documentsWithMetadata.length > 0) {
  //   documentsWithMetadata = documentsWithMetadata.filter(doc => doc != null);
  //   await PineconeStore.fromDocuments(documentsWithMetadata, embeddings, {
  //     pineconeIndex: index,
  //     textKey: 'text',
  //   });
  // }
};

const get10KItemTxtAndIngest = async (
  link,
  txt,
  item,
  document_id,
  ticker,
  type,
  year
) => {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  let documentsWithMetadata;

  try {
    const sectionText = await getSectionWithRetry(link, item, "text");

    const metadata = {
      id: document_id,
      ticker: ticker,
      type: type,
      item: item,
      year: year,
      link: link,
      txt: txt,
    };

    const vector_id = await insertIntoVectors(document_id);
    metadata.vector_id = vector_id;
    const keywords = extractSignificantWords(sectionText, 25);
    metadata.keywords = keywords;

    const docs = await textSplitter.splitDocuments([
      new Document({ id: vector_id, pageContent: sectionText, metadata: metadata }),
    ]);

    // Add the metadata to the docs
    documentsWithMetadata = docs.map(
      (doc) =>
        new Document({
          metadata,
          pageContent: doc.pageContent,
        })
    );

    console.log("Document prepared successfully!");

    // Return the prepared documents
    return documentsWithMetadata;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Item ${item} not found at url: ${link}`);
    } else {
      console.error(error);
    }
  }

  // Log the prepared documents
  console.log(documentsWithMetadata);
  // Return the prepared documents
  return documentsWithMetadata;
};

module.exports = {
  get10KItemAndIngest,
};
