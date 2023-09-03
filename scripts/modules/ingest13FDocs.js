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
const { ingestToPinecone } = require("../utils/ingest/ingestPincone");
const https = require("https");
const Bottleneck = require("bottleneck");
const zlib = require("zlib");
const xml2js = require("xml2js");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeClient } = require("@pinecone-database/pinecone");

// dotenv.config();
dotenv.config({ path: "../../.env" });

// Configure the rate limiter for sec (10 requests a second)
const limiter = new Bottleneck({
  minTime: 110,
});

queryApi.setApiKey(process.env.SEC_API_KEY);

const getThirteenFAndIngest = async (filings, ticker, company_id) => {
  const query =
    "INSERT INTO documents_tag (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";

  let documentsWithMetadata = [];

  for (let year in filings) {
    let type;

    if (Array.isArray(filings[year]["13F-HR"])) {
      const promises = filings[year]["13F-HR"].map(async (link) => {
        type = "13-F";
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
          console.error("Error inserting into db 13-F: " + error.message);
          return;
        }

        try {
          const content = await get13FContent(link.txt);
          const documentsWithMetadata = await get13FTxtAndIngest(
            link.link,
            link.txt,
            document_id,
            ticker,
            type,
            year,
            content
          );
          return documentsWithMetadata;
        } catch (error) {
          console.error("Error in get13FTxtAndIngest: " + error.message);
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
};

// This function retrieves the 13F's textual content to be passed to the ingest function

const get13FContent = async (url) => {
  const data = await getData(url);
  const startMarker = "<TEXT>";
  const endMarker = "</TEXT>";
  const startIndex = data.indexOf(startMarker) + startMarker.length;
  const endIndex = data.indexOf(endMarker);
  let textContent;
  const xmlTextContent = data.slice(startIndex, endIndex);
  xml2js.parseString(xmlTextContent, (err, result) => {
    if (err) {
      console.error(err);
      return;
    }
    textContent = JSON.stringify(result);
  });
  return textContent;
};

// This returns the unparsed data at a rate of 10 requests a second
const getData = (url) => {
  return limiter.schedule(() => {
    return new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        headers: {
          "User-Agent": "Valumetrics valumetrics.ai",
          "Accept-Encoding": "gzip, deflate",
        },
      };

      const req = https
        .get(url, options, (res) => {
          const encoding = res.headers["content-encoding"];
          let stream = res;

          if (encoding === "gzip") {
            stream = res.pipe(zlib.createGunzip());
          } else if (encoding === "deflate") {
            stream = res.pipe(zlib.createInflate());
          }

          let data = "";

          stream.on("data", (chunk) => {
            data += chunk;
          });

          stream.on("end", () => {
            resolve(data);
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  });
};

const get13FTxtAndIngest = async (
  link,
  txt,
  document_id,
  ticker,
  type,
  year,
  content
) => {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  let allDocumentsWithMetadata = [];

  try {
    const metadata = {
      id: document_id,
      ticker: ticker,
      type: type,
      year: year,
      link: link,
      txt: txt,
    };

    const vector_id = await insertIntoVectors(document_id);
    metadata.vector_id = vector_id;
    const docs = await textSplitter.splitDocuments([
      new Document({ id: vector_id, pageContent: content, metadata: metadata }),
    ]);

    const documentsWithMetadata = docs.map((doc) => {
      const keywords = extractSignificantWords(doc.pageContent, 25);
      return new Document({
        metadata: { ...metadata, keywords: keywords },
        pageContent: doc.pageContent,
      });
    });

    console.log(documentsWithMetadata);

    allDocumentsWithMetadata.push(...documentsWithMetadata);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Not found at url: ${link}`);
    } else {
      console.error(error);
    }
  }

  console.log("Documents prepared successfully!");
  return allDocumentsWithMetadata;
};

module.exports = {
  getThirteenFAndIngest,
};
