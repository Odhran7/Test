const dotenv = require("dotenv");
const { extract } = require("@extractus/article-extractor");
const { convert } = require("html-to-text");
const { extractSignificantWords } = require("./keywordExtraction");
const { Document } = require("langchain/document");
const { ingestToPinecone } = require("./ingestPincone");
const { insertIntoVectors } = require("../ingest/vectorIdInsertion");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeClient } = require("@pinecone-database/pinecone");

dotenv.config({ path: "../.env" });

const extractMetadataAndIngest = async (
  company_id,
  ticker,
  document_id,
  article,
  type,
) => {
  const date = new Date(article.published_utc);
  console.log(`Processing article from URL: ${article.article_url}`);

  try {
    const articleObj = await extract(article.article_url);
    const text = convert(articleObj.content);
    const vector_id = await insertIntoVectors(document_id);
    const allKeywords = extractSignificantWords(text);

    // Create metadata object
    const metadata = {
      id: document_id,
      company_id: company_id,
      ticker: ticker,
      type: type,
      year: date.getFullYear(),
      month: date.getMonth(),
      headline: article.title,
      url: article.article_url,
      provider: article.publisher.name,
      vector_id: vector_id,
      keywords: allKeywords,
      isUseful: true,
    };

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments([
      new Document({ id: vector_id, pageContent: text, metadata }), 
    ]);

    console.log(docs);

    // Not good Ik
    if (docs.length > 0) {
      const filteredDocs = docs.filter((doc) => {
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
      await PineconeStore.fromDocuments(filteredDocs, new OpenAIEmbeddings(), {
        pineconeIndex,
      });
    }
  } catch (error) {
    console.error(
      `Failed to extract or process article from URL: ${article.article_url}. Error: ${error.message}`
    );
  }
};

module.exports = {
  extractMetadataAndIngest,
};
