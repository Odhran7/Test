// This util ingests the docs into the Pinecone db

const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");

const ingestToPinecone = async (docs, index) => {
  try {
    const embeddings = new OpenAIEmbeddings();
    return await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      textKey: "pageContent",
    });
  } catch (error) {
    console.log("There is an error - ingestToPinecone: " + error);
  }
};

module.exports = {
  ingestToPinecone,
};
