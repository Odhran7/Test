const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");
const fs = require("fs");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const pgParse = require("pg-connection-string");
const pg = require("pg");
const path = require("path");
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { error } = require("console");
const { OpenAI } = require('langchain/llms/openai');
const { ConversationalRetrievalQAChain } = require('langchain/chains');
const { Document } = require('langchain/document');
const { Configuration, OpenAIApi } = require("openai");



// dotenv.config({ path: '../.env' });

dotenv.config();

// Instantiate the database connection
const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false,
};
const pool = new pg.Pool(config);

// Instantiate pinecone

const initPinecone = async () => {
  try {
      const pinecone = new PineconeClient();
    await pinecone.init({
      environment: process.env.PINECONE_ENVIRONMENT,
      apiKey: process.env.PINECONE_API_KEY,
    });
    return pinecone;
  } catch (err) {
    console.log("error", error);
    throw new Error("Failed to init pinecone client");
  }
}

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
    const documentsWithMetadata = docs.map((doc) => new Document({
      metadata,
      pageContent: doc.pageContent,
    }))
    
    console.log('split doc', documentsWithMetadata);

    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();

    //embed the PDF documents
    await PineconeStore.fromDocuments(documentsWithMetadata, embeddings, {
      pineconeIndex: index,
      namespace: process.env.PINECONE_NAME_SPACE,
      textKey: 'text',
    });


    console.log("Document was ingested into the Pinecone store successfully!");
  } catch (error) {
    console.error("Error ingesting document: ", error);
  }
}

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;

const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

Question: {question}
Helpful answer in markdown:`;

const makeChainAll = async (vectorStore, k) => {
  try {
      const model = new OpenAI({
        temperature: 0,
        modelName: 'gpt-3.5-turbo',
      });
      const chain = ConversationalRetrievalQAChain.fromLLM(
        model,
        vectorStore.asRetriever(top_k = k),
        {
          qaTemplate: QA_PROMPT,
          questionGeneratorTemplate: CONDENSE_PROMPT,
          returnSourceDocuments: true,
        }
      );
      return chain;
  } catch (err) {
    console.error("Something went wrong in makeChain: " + err.message);
  }
} 

const makeChainSearch = async (sanitisedQuestion, vectorStore, k, filter) => {

    // Similarity Search since asRetriever() does not support filtering yet

    const topKDocs = await vectorStore.similaritySearch(sanitisedQuestion, k, filter);
    const context = topKDocs.map((doc) => doc.pageContent).join(' '); 

    const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
      If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
      If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

      ${context}

      Question: ${sanitisedQuestion}
      Helpful answer in markdown:`;
      const messages = [
        {role: 'system', content: QA_PROMPT},
        {role: 'user', content: sanitisedQuestion}
      ];

    // Initialise OpenAI 

    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);

    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: QA_PROMPT},
        { role: "user", content: sanitisedQuestion },
      ],
    });
    
    const chatResponse = completion.data.choices[0].message.content;
  

    // Set response obj

    response = {
      text: chatResponse,
      sourceDocuments: topKDocs,
    };
    return response;

};

module.exports = {
  ingestDoc,
  makeChainAll,
  initPinecone,
  makeChainSearch,
};