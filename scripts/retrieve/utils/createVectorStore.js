const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");

dotenv.config({ path: "../../../.env" });

const createVectorStore = async () => {
  const pinecone = new PineconeClient();
  await pinecone.init({
    environment: process.env.PINECONE_ENVIRONMENT,
    apiKey: process.env.PINECONE_API_KEY,
  });
  const index = pinecone.Index(process.env.PINCONE_INDEX_NAME);
  const vectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({}),
    {
      pineconeIndex: index,
      textKey: "pageContent",
    }
  );
  return vectorStore;
};

module.exports = {
  createVectorStore,
};
