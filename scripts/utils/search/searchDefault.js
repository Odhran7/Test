// This util allows us to perform a search on our vector database

const dotenv = require("dotenv");
const { Configuration, OpenAIApi } = require("openai");



dotenv.config({ path: '../.env' });

// dotenv.config();

const searchDefault = async (sanitisedQuestion, vectorStore, k, filter, isDefault) => {
  let topKDocs;
  let context;
  let topKDocsSEC10Q;
  let topKDocsSEC10K;
  let topKDocsNews;
  let topKDocsResearch;

  if (isDefault) {
    filter.year = "2021";
    filter.type = "10Q";
    topKDocsSEC10Q = await vectorStore.similaritySearch(sanitisedQuestion, k / 4, filter);

    filter.type = "10K";
    topKDocsSEC10K = await vectorStore.similaritySearch(sanitisedQuestion, k / 4, filter);

    filter.type = 'News Article';
    filter.year = { "$gte": 2022 };
    topKDocsNews = await vectorStore.similaritySearch(sanitisedQuestion, k / 4, filter);
    
    filter.type = 'Equity Research';
    topKDocsResearch = await vectorStore.similaritySearch(sanitisedQuestion, k / 4, filter);

    topKDocs = [...topKDocsSEC10K, ...topKDocsSEC10Q, ...topKDocsNews, ...topKDocsResearch];
    context = topKDocs.map((doc) => doc.pageContent).join(' ');
  } else {
    topKDocs = await vectorStore.similaritySearch(sanitisedQuestion, k, filter);
    context = topKDocs.map((doc) => doc.pageContent).join(' ');
  }
  const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
    If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

    ${context}

    Question: ${sanitisedQuestion}
    Helpful answer in markdown:`;

  // Initialise OpenAI
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: QA_PROMPT },
      { role: "user", content: sanitisedQuestion },
    ],
  });

  const chatResponse = completion.data.choices[0].message.content;
  delete chatResponse.sourceDocuments;

  // Set response object
  const response = {
    text: chatResponse,
    // sourceDocuments: topKDocs,
    sourceDocumentSEC10K: topKDocsSEC10K,
    sourceDocumentSEC10Q: topKDocsSEC10Q,
    sourceDocumentNews: topKDocsNews,
    sourceDocumentResearch: topKDocsResearch,
  };

  return response;
};


module.exports = {
  searchDefault,
};