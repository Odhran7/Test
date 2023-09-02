// This module gets all the 8K records for a specific company

const dotenv = require("dotenv");
const pool = require("../utils/ingest/initDB");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");
const { queryApi } = require("sec-api");
const {
  extractSignificantWords,
} = require("../utils/ingest/keywordExtraction");
const { insertIntoVectors } = require("../utils/ingest/vectorIdInsertion");
const { getSectionWithRetry } = require("../utils/ingest/RateLimit");

/*
Helpful info on the standards applied to an 8k
 const itemDict8K = {
    "1-1": "Entry into a Material Definitive Agreement",
    "1-2": "Termination of a Material Definitive Agreement",
    "1-3": "Bankruptcy or Receivership",
    "1-4": "Mine Safety - Reporting of Shutdowns and Patterns of Violations",
    "2-1": "Completion of Acquisition or Disposition of Assets",
    "2-2": "Results of Operations and Financial Condition",
    "2-3":
      "Creation of a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement of a Registrant",
    "2-4":
      "Triggering Events That Accelerate or Increase a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement",
    "2-5": "Cost Associated with Exit or Disposal Activities",
    "2-6": "Material Impairments",
    "3-1":
      "Notice of Delisting or Failure to Satisfy a Continued Listing Rule or Standard; Transfer of Listing",
    "3-2": "Unregistered Sales of Equity Securities",
    "3-3": "Material Modifications to Rights of Security Holders",
    "4-1": "Changes in Registrant’s Certifying Accountant",
    "4-2":
      "Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review",
    "5-1": "Changes in Control of Registrant",
    "5-2":
      "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers",
    "5-3":
      "Amendments to Articles of Incorporation or Bylaws; Change in Fiscal Year",
    "5-4":
      "Temporary Suspension of Trading Under Registrant’s Employee Benefit Plans",
    "5-5":
      "Amendment to Registrant’s Code of Ethics, or Waiver of a Provision of the Code of Ethics",
    "5-6": "Change in Shell Company Status",
    "5-7": "Submission of Matters to a Vote of Security Holders",
    "5-8": "Shareholder Director Nominations",
    "6-1": "ABS Informational and Computational Material.",
    "6-2": "Change of Servicer or Trustee.",
    "6-3": "Change in Credit Enhancement or Other External Support.",
    "6-4": "Failure to Make a Required Distribution.",
    "6-5": "Securities Act Updating Disclosure.",
    "7-1": "Regulation FD Disclosure",
    "8-1": "Other Events",
    "9-1": "Financial Statements and Exhibits",
  };


*/


// dotenv.config();
dotenv.config({ path: "../../.env" });

queryApi.setApiKey(process.env.SEC_API_KEY);

const get8KItemAndIngest = async (index, filings, ticker, company_id) => {
  const itemDict8K = {
    1.01: "1-1",
    1.02: "1-2",
    1.03: "1-3",
    1.04: "1-4",
    2.01: "2-1",
    2.02: "2-2",
    2.03: "2-3",
    2.04: "2-4",
    2.05: "2-5",
    2.06: "2-6",
    3.01: "3-1",
    3.02: "3-2",
    3.03: "3-3",
    4.01: "4-1",
    4.02: "4-2",
    5.01: "5-1",
    5.02: "5-2",
    5.03: "5-3",
    5.04: "5-4",
    5.05: "5-5",
    5.06: "5-6",
    5.07: "5-7",
    5.08: "5-8",
    6.01: "6-1",
    6.02: "6-2",
    6.03: "6-3",
    6.04: "6-4",
    6.05: "6-5",
    7.01: "7-1",
    8.01: "8-1",
    9.01: "9-1",
  };

  const query =
    "INSERT INTO documents_tag (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";

  let documentsWithMetadata = [];

  for (let year in filings) {
    let type;

    if (Array.isArray(filings[year]["8-K"])) {
      const promises = filings[year]["8-K"].map(async (link) => {
        type = "8-K";
        let document_id;
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
          console.error("Error inserting into db 8-K: " + error.message);
          return;
        }

        try {
          const itemNumbersConverted = link.itemNumbers.map(
            (item) => itemDict8K[item]
          );

          const documentsWithMetadata = await get8KItemTxtAndIngest(
            link.link,
            link.txt,
            itemNumbersConverted,
            document_id,
            ticker,
            type,
            year
          );
          return documentsWithMetadata;
        } catch (error) {
          console.error("Error in get8KItemTxtAndIngest: " + error.message);
          return;
        }
      });

      const nestedDocs = await Promise.all(promises);
      documentsWithMetadata = documentsWithMetadata.concat(
        ...nestedDocs.flat()
      );
    }
  }

  if (documentsWithMetadata.length > 0) {
    documentsWithMetadata = documentsWithMetadata.filter((doc) => doc != null);
    // Uncomment the next line if you need to ingest the documents to Pinecone
    // await ingestToPinecone(document_id, documentsWithMetadata, index, type);
  }
};

const get8KItemTxtAndIngest = async (
  link,
  txt,
  items,
  document_id,
  ticker,
  type,
  year
) => {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  let allDocumentsWithMetadata = [];

  for (const item of items) {
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
        new Document({ pageContent: sectionText, metadata: metadata }),
      ]);

      const documentsWithMetadata = docs.map(
        (doc) =>
          new Document({
            metadata,
            pageContent: doc.pageContent,
          })
      );
      console.log(documentsWithMetadata);

      allDocumentsWithMetadata.push(...documentsWithMetadata);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`Item ${item} not found at url: ${link}`);
      } else {
        console.error(error);
      }
    }
  }

  console.log("Documents prepared successfully!");
  return allDocumentsWithMetadata;
};

module.exports = {
  get8KItemAndIngest,
};
