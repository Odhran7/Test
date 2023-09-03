const finnhub = require("finnhub");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const pdfjsLib = require("pdfjs-dist");
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

dotenv.config({ path: "../../.env" });

const api_key = finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = process.env.FINN_HUB_API_KEY;
const finnhubClient = new finnhub.DefaultApi();

// This is the module that will ingest all of the data

const ingestPatents = async (company_id, ticker) => {
  const query =
    "INSERT INTO documents_tag (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";
  let processedData = [];
  let type = "Intellectual Property";
  let document_id;
  const patentList = await getPatentFilingsForYear(
    ticker,
    "2020-06-01",
    "2021-06-10"
  );
  for (const patent of patentList.data) {
    const description = patent.description;
    const filingStatus = patent.filingStatus;
    const patentNumber = patent.patentNumber;
    if (patentNumber && patentNumber.trim() !== "") {
      const patentPublicationDate = patent.publicationDate;
      const urls = await getPatentInfo(patentNumber, "en");
      const pdfContent = await getPdfText(urls.PatentFilingPDF);
      const dateObj = extractDate(patentPublicationDate);
      // Insert into db
      const values = [
        company_id,
        type,
        dateObj.year,
        new Date(),
        urls.PatentFilingPDF,
        dateObj.month,
      ];

      try {
        const result = await pool.query(query, values);
        document_id = result.rows[0].id;
      } catch (error) {
        console.error(
          "Error inserting into db Intellectual Property:  " + error.message
        );
        return;
      }

      const docs = await tagPatentAndIngest(
        ticker,
        document_id,
        urls,
        pdfContent,
        description,
        filingStatus,
        patentNumber,
        type,
        dateObj
      );
      processedData.push(docs);
    } else {
      continue;
    }
  }
  // console.log(processedData);
  return;
};

const tagPatentAndIngest = async (
  ticker,
  document_id,
  urls,
  pdfContent,
  description,
  filingStatus,
  patentNumber,
  type,
  dateObj
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
      year: dateObj.year,
      month: dateObj.month,
      day: dateObj.day,
      time: dateObj.time,
      filingStatus: filingStatus,
      patentNumber: patentNumber,
      linkPdf: urls.PatentFilingPDF,
      description: description,
      USPTOApplication: urls.USPTOApplication,
      Espacenet: urls.Espacenet,
      PatentsStackExchange: urls.PatentsStackExchange,
      vector_id: vector_id,
    };

    // Split the docs
    const docs = await textSplitter.splitDocuments([
      new Document({ pageContent: pdfContent, metadata: metadata }),
    ]);

    // Add the metadata and keywords to the docs
    documentsWithMetadata = docs.map((doc) => {
      const keywords = extractSignificantWords(doc.pageContent, 25);
      return new Document({
        pageContent: doc.pageContent,
        metadata: { ...metadata, keywords: keywords },
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
      await PineconeStore.fromDocuments(filteredData, new OpenAIEmbeddings(), {
        pineconeIndex,
      });
    }

    // Log the success to the console
    console.log(
      `Patent for ${ticker} and number ${patentNumber} has been uploaded successfully!`
    );
  } catch (error) {
    console.log("Error in patent ingest: " + error);
  }
  return documentsWithMetadata;
};

const getPdfText = async (url) => {
  console.log("Url in pdf " + url);
  const pdf = await pdfjsLib.getDocument({
    url: url,
    cMapUrl: "node_modules/pdfjs-dist/cmaps/",
    cMapPacked: true,
  }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ");
  }
  return text;
};

// This function extracts the year, month, day and time

const extractDate = (dateStr) => {
  const [year, month, day] = dateStr.split(" ")[0].split("-");
  const time = dateStr.split(" ")[1];
  return {
    year: year,
    month: month,
    day: day,
    time: time,
  };
};

// This function returns the href of the patent filing

const getPatentInfo = async (patentNumber, languageCode) => {
  const url = `https://patents.google.com/patent/${patentNumber}/${languageCode}`;
  console.log(`This is the url ${url}`);

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        req.resourceType() === "stylesheet" ||
        req.resourceType() === "font" ||
        req.resourceType() === "image"
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a.style-scope.patent-result[target="_blank"]');
    const hrefs = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll(
          "a.style-scope.patent-result[target='_blank']"
        )
      );
      return elements.map((element) => element.href);
    });
    await browser.close();

    return {
      PatentFilingPDF: hrefs[0],
      USPTOApplication: hrefs[1],
      USPTOPatentCenter: hrefs[2],
      USPTOPatentAssignmentSearch: hrefs[3],
      Espacenet: hrefs[4],
      GlobalDossier: hrefs[5],
      PatentsStackExchange: hrefs[6],
    };
  } catch (error) {
    console.error("Error getting patent info:", error);
    throw error;
  }
};

// Gets list of patents and their respective patent numbers

const getPatentFilingsForYear = async (ticker, start, end) => {
  return new Promise((resolve, reject) => {
    finnhubClient.stockUsptoPatent(
      ticker,
      start,
      end,
      (error, data, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      }
    );
  });
};

// const url =
//   "https://patentimages.storage.googleapis.com/65/a5/23/79145209cd2164/US20220086752A1.pdf";
// getPdfText(url)
//   .then((text) => console.log(text))
//   .catch((error) => console.error(error));

// ingestPatents(0, "AAPL")
//   .then((data) => console.log(data))
//   .catch((error) => console.error(error));

// const dateStr = '2022-03-17 00:00:00';
// console.log(extractDate(dateStr).year);

module.exports = {
  ingestPatents,
};
