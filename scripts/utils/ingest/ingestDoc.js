// This util allows us to ingest a singular doc into the database

const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");
const fs = require("fs");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { initDB } = require("./initDB");
const path = require("path");
const { PDFLoader } = require("langchain/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");

dotenv.config({ path: "../.env" });

// dotenv.config();

// Instantiate the database connection

const pool = initDB();

// Ingest a doc manually into the system

async function ingestDoc(file, company_id, document_type, year) {
  try {
    // Initialize the Pinecone client
    const client = new PineconeClient();
    await client.init({
      environment: process.env.PINECONE_ENVIRONMENT,
      apiKey: process.env.PINECONE_API_KEY,
    });
    const index = client.Index(process.env.PINECONE_INDEX_NAME);

    const fileName = `${company_id}_${document_type}_${year}_${file.originalname}`;
    const filePath = `public/docs/${company_id}/${year}/${fileName}`;

    // Insert into the database
    const query =
      "INSERT INTO test_documents (company_id, document_type, year, upload_timestamp, link) VALUES ($1, $2, $3, $4, $5) RETURNING id;";
    const values = [company_id, document_type, year, new Date(), "#"];
    const result = await pool.query(query, values);
    const document_id = result.rows[0].id;

    // Getting the ticker

    const tickerQuery = `SELECT ticker FROM companies WHERE id = $1;`;
    const companyId = [company_id];
    const tickerResult = await pool.query(tickerQuery, companyId);
    const ticker = tickerResult.rows[0].ticker;

    // Move the file to the target directory
    const targetDir = `public/docs/${company_id}/${year}`;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.renameSync(file.path, path.join(targetDir, fileName));

    /*load raw docs from all files in the directory */
    const pdfLoader = new PDFLoader(filePath);
    const rawDoc = await pdfLoader.load();

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments(rawDoc);
    const metadata = {
      id: document_id,
      ticker: ticker,
      type: document_type,
      year: year,
    };
    const documentsWithMetadata = docs.map(
      (doc) =>
        new Document({
          metadata,
          pageContent: doc.pageContent,
        })
    );
    console.log(documentsWithMetadata);

    console.log("split doc", documentsWithMetadata);

    console.log("creating vector store...");
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();

    //embed the PDF documents
    await PineconeStore.fromDocuments(documentsWithMetadata, embeddings, {
      pineconeIndex: index,
      namespace: process.env.PINECONE_NAME_SPACE,
      textKey: "text",
    });

    console.log("Document was ingested into the Pinecone store successfully!");
  } catch (error) {
    console.error("Error ingesting document: ", error);
  }
}

module.exports = {
  ingestDoc,
};
