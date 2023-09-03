// This module will retrieve k vectors of company and type

const { getCompanyId } = require("../utils/getCompanyId");
const { createVectorStore } = require("../utils/createVectorStore");
const { getDocumentIds } = require("../utils/getDocumentIds");
const { getVectorIds } = require("../utils/getVectorIds");
const { PineconeClient } = require("@pinecone-database/pinecone");
const dotenv = require("dotenv");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");

dotenv.config({ path: "../../../.env" });

// Used to gather the type of doc being requested in this case 'Intellectual Property'

const getVectorsForticker = async (ticker, type, k, competitor) => {
  try {
    const company_id = await getCompanyId(ticker);
    const docIds = await getDocumentIds(company_id, type);
    console.log(docIds);
    const vectorIds = await getVectorIds(docIds);
    console.log(vectorIds);
    const pinecone = new PineconeClient();
    await pinecone.init({
      environment: process.env.PINECONE_ENVIRONMENT,
      apiKey: process.env.PINECONE_API_KEY,
    });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: "text",
      }
    );
    const results = await index.fetch({
      ids: docIds,
    });
    console.log(results);
    filter = {
      ticker: ticker,
      type: type,
    };

    const topKDocs = await vectorStore.similaritySearch("Abstract", 10, filter);
    console.log(topKDocs);
  } catch (error) {
    console.error("Error in getVectorsForticker:", error);
  }
};

getVectorsForticker("AAPL", "Intellectual Property")
  .then((data) => console.log(data))
  .catch((error) => console.log(error));
/*
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

*/
