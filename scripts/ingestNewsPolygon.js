// Import required modules
const { initPinecone } = require('./ingest');
const { Document } = require('langchain/document');
const dotenv = require("dotenv");
const pg = require("pg");
const { extract } = require('@extractus/article-extractor');
const pgParse = require("pg-connection-string");
const fetch = require('node-fetch');
const { convert } = require('html-to-text');
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const natural = require('natural');

// Instantiate the dotenv vars
dotenv.config();
// dotenv.config({ path: '../.env' });

// Set up the PostgreSQL pool
const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false,
};
const pool = new pg.Pool(config);

// This removes those without a paywall
const removePaywall = async (data) => {
    try {
        const filteredData = data.filter((article) => !article.hasPaywall && article.lang == 'en');
        return filteredData;
    } catch (error) {
        console.error("Error: " + error);
    }
};

// Need to get the metadata from the response object and add to formatted response obj
const extractMetadata = async (company_id, ticker, document_id, article, index) => {
    try {
        const date = new Date(article.published_utc);
        const articleObj = await extract(article.article_url);
        const text = convert(articleObj.content);
        const metadata = {
            id: document_id,
            company_id: company_id,
            ticker: ticker,
            type: "News Article",
            year: date.getFullYear(),
            month: date.getMonth(),
            headline: article.title,
            url: article.article_url,
            provider: article.publisher.name,
            summary: articleObj.description,
        };

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 800,
            chunkOverlap: 200,
        });

        const docs = await textSplitter.splitDocuments([
            new Document({ pageContent: text })
        ]);

        // const embeddings = new OpenAIEmbeddings();
        // const promises = docs.map((doc) => {
        //     const documentWithMetadata = new Document({
        //         metadata,
        //         pageContent: doc.pageContent,
        //     });
        //     return PineconeStore.fromDocuments([documentWithMetadata], embeddings, {
        //         pineconeIndex: index,
        //         textKey: 'text',
        //     });
        // });
        // await Promise.all(promises);
        console.log("New article ingested!", metadata);
    } catch (error) {
        console.error("Error", error);
    }
};

const ingestNews = async (ticker, company_id) => {
    try {
        const currentDate = new Date();
        const sixMonthsAgo = new Date(currentDate);
        sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

        const apitoken = "nSjJs_oyU_rD2m9UPCEVVjqXQlCTDgGI";
        const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&published_utc=${sixMonthsAgo.toISOString()}&apiKey=${apitoken}`;
        const res = await fetch(url);
        const data = await res.json();

        const cleanedData = await removePaywall(data.results); // Extract the 'results' array

        const client = await initPinecone();
        const index = client.Index(process.env.PINECONE_INDEX_NAME);

        const promises = cleanedData.map(async (article) => {
            const query = "INSERT INTO TEST_DOCUMENTS (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";
            const values = [company_id, "News Article", article.year, new Date(), article.url, article.month];
            const res = await pool.query(query, values);
            const document_id = res.rows[0].id;
            return extractMetadata(company_id, ticker, document_id, article, index);
        });

        await Promise.all(promises);

        console.log("Done");
    } catch (error) {
        console.error(error);
    }
};

// Call the function
ingestNews("AAPL", ); // Replace "AAPL" and "A" with the appropriate ticker and company_id

module.exports = {
    ingestNews,
};
