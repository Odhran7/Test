// This initialises the Pinecone client

const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");
const { error } = require("console");

dotenv.config({ path: '../.env' });


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

module.exports = {
  initPinecone,
}