// This util makes a vector store that should be passed to the searchDefault function to enable semantic search

const dotenv = require("dotenv");
const { OpenAI } = require('langchain/llms/openai');
const { ConversationalRetrievalQAChain } = require('langchain/chains');

dotenv.config({ path: '../.env' });

// dotenv.config();

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

module.exports = {
    makeChainAll,
}