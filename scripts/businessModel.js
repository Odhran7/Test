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
const PDFDocument = require('pdfkit');

dotenv.config({ path: '../.env' });

// dotenv.config(); 

businessModelFactors = [
    "Value Proposition",
    "Revenue Streams",
    "Key Resources",
    "Key Activities",
    "Key Partnerships",
    "Cost Structure",
    "Customer Segments",
    "Customer Relationships",
    "Channels"
]

// Init Pinecone

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

// Let's get all the data on the economic moat

const getBusinessModel = async (ticker) => {
  const pinecone = await initPinecone();
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
          pineconeIndex: index,
          textKey: "text",
      }
  );
  const filter = {
      ticker: ticker,
      year: { "$gte": 2021 },
    };

  let reportParts = [];
  let conclusionParts = [];
  let sourceUrls = [];
  
  for (let queryTermIdx = 0; queryTermIdx < businessModelFactors.length; queryTermIdx++) {
      const response = await vectorStore.similaritySearch(businessModelFactors[queryTermIdx], 15, filter);
      let filteredResponse;
      if (response.length > 5) {
        filteredResponse = response.filter(doc => {
            const tickerCount = (doc.pageContent.match(new RegExp(ticker, 'gi')) || []).length;
            return tickerCount >= 1;
        });
      } else {
        filteredResponse = response;
      }

      const context = filteredResponse.map((doc) => doc.pageContent).join(' ');

      // Add source information
      const sourceInformation = filteredResponse.map(doc => {
        sourceUrls.push(doc.metadata.url); // Added this line
        return `Source: ${doc.metadata.url}`;
      }).join('\n');
      
      const QA_PROMPT = `You are a writing an investment analyst report on the ticker ${ticker}. Use the following pieces of context to write a section of the report on the topic of "${businessModelFactors[queryTermIdx]}".
      DO NOT try to make up an answer and only use pieces of info related to the ticker ${ticker}.

      ${context}

      Helpful answer in markdown:`;

      const configuration = new Configuration({
          apiKey: process.env.OPENAI_API_KEY,
      });
      const openai = new OpenAIApi(configuration);

      const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
              { role: "system", content: QA_PROMPT },
          ],
      });
      const chatResponse = completion.data.choices[0].message.content;
      reportParts.push(`## ${businessModelFactors[queryTermIdx]}\n\n${chatResponse}\n\n${sourceInformation}`);
      conclusionParts.push(chatResponse);
  }

  // Conclusion
  const conclusionContext = conclusionParts.join(' ');
  const CONCLUSION_PROMPT = `Based on the analysis of all the business model factors, write a conclusion for the investment analyst report on the ticker ${ticker}.

  ${conclusionContext}

  Helpful conclusion in markdown:`;

  const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
          { role: "system", content: CONCLUSION_PROMPT },
      ],
  });
  const conclusionResponse = completion.data.choices[0].message.content;
  reportParts.push(`## Conclusion\n\n${conclusionResponse}`);

  // Creating the full report
  let fullReport = `# Business Model Investment Analyst Report on ${ticker}\n\n` + reportParts.join("\n\n");

  console.log(fullReport);

  // Create a PDF document
  const doc = new PDFDocument;
  doc.pipe(fs.createWriteStream(`${ticker}_Business_Model.pdf`));
  
  // Parse and style the report
  const lines = fullReport.split('\n');
  for (let line of lines) {
    let words = line.split  (' ');
    for (let word of words) {
      if (!isNaN(parseFloat(word)) && isFinite(word)) {
        // Bold the numbers
        doc.font('Helvetica-Bold').text(word + ' ', { continued: true });
      } else if (word.startsWith("Source:")) {
        // Bold the source words
        doc.font('Helvetica-Bold').text(word + ' ', { continued: true });
      } else {
        doc.font('Helvetica').text(word + ' ', { continued: true });
      }
    }
    doc.text('\n');
  }
  
  // Add source link
  for (let url of sourceUrls) {
    doc.fontSize(10).fillColor('blue').text(url, {
      link: url, underline: true
    });
    doc.text('\n');
  }
  
  doc.end();

  return fullReport;
}




const run = async () => {
    await getBusinessModel("MSFT");
  }
  
  run();