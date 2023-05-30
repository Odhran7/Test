const { PineconeClient } = require("@pinecone-database/pinecone");
const fs = require("fs");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const pdfParse = require("pdf-parse");
const pgParse = require("pg-connection-string");
const dotenv = require("dotenv");
const pg = require("pg");
const path = require("path");
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

dotenv.config();

// Instantiate the database connection
const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false,
};
const pool = new pg.Pool(config);

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
    const filePath = `docs/${company_id}/${year}/${fileName}`;

    // Insert into the database
    const query =
      "INSERT INTO documents (company_id, document_type, file_name, file_path, file_size, upload_timestamp, year) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;";
    const values = [
      company_id,
      document_type,
      fileName,
      filePath,
      file.size,
      new Date(),
      year,
    ];
    const result = await pool.query(query, values);
    const document_id = result.rows[0].id;

    // Move the file to the target directory
    const targetDir = `docs/${company_id}/${year}`;
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

    const doc = await textSplitter.splitDocuments(rawDoc);
    doc.metadata = {
      id: document_id,
      type: document_type,
      year: year,
    };
    
    console.log('split doc', doc);

    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();

    //embed the PDF documents
    await PineconeStore.fromDocuments(doc, embeddings, {
      pineconeIndex: index,
      namespace: process.env.PINECONE_NAME_SPACE,
      textKey: 'text',
    });


    console.log("Document was ingested into the Pinecone store successfully!");
  } catch (error) {
    console.error("Error ingesting document: ", error);
  }
}

module.exports = ingestDoc;

