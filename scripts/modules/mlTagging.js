// This module will call a pipeline that assigns metadata to a news article

const dotenv = require("dotenv");
const pg = require("pg");
const { extract } = require('@extractus/article-extractor');
const pgParse = require("pg-connection-string");
const fetch = require('node-fetch');
const { convert } = require('html-to-text');
const natural = require('natural');
const { initPinecone } = require('./ingest');
const { Document } = require('langchain/document');
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '../.env' });

const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = { rejectUnauthorized: false };
const pool = new pg.Pool(config);

// This function will return the required data

const getRequiredData = async () = {

}


// This function will format the data into an Excel sheet

const format = async () => {

}

// We have the document tagging model already implemented - It will be supervised and manually checked

/*

here is the metadata

  id: 2534,
  company_id: 21,
  ticker: 'AAPL', // This needs to be inferred from the model ?
  type: 'News Article',
  year: 2023,
  month: 4,
  headline: '13F Insights: Buffett, Burry Buy Up Financials; Ackman Targets Disc
retionaries',
  url: 'https://www.investing.com/analysis/13f-insights-buffett-burry-buy-up-fin
ancials-ackman-targets-discretionaries-200638150',
  provider: 'Investing.com',
  vector_id: 2534,
  keywords: '...'
  isUseful: true // This needs to also be evaluated by an ML model
  sector: finance, industrials etc... // Needs to be interepreted by an ML model !

  
  peter oakes
  email
  fintech ire
  nicola stokes
  ken.finnegan@tcd.ie
}


*/