const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");

dotenv.config({ path: "../.env" });

const initPinecone = async () => {
  try {
    const pinecone = new PineconeClient();
    await pinecone.init({
      environment: process.env.PINECONE_ENVIRONMENT,
      apiKey: process.env.PINECONE_API_KEY,
    });
    const index = pinecone.Index(process.env.PINCONE_INDEX_NAME);
    return index;
  } catch (err) {
    console.error("error", err);
    throw new Error("Failed to init pinecone client");
  }
};

module.exports = {
  initPinecone,
};
