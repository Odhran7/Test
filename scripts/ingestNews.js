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
        console.error("Erorr: " + error);
    }
};

// Need to get the metadata from the response object and add to formatted response obj

const extractMetadata = async (company_id, ticker, document_id, article, index) => {
    try {
        const date = new Date(article.date);
        const articleObj = await extract(article.qmUrl);
        const text = convert(articleObj.content);
        // const tokenizer = new natural.WordTokenizer();
        // const tokens = tokenizer.tokenize(text);
        const metadata = {
            id: document_id,
            company_id: company_id,
            ticker: ticker,
            type: "News Article",
            year: date.getFullYear(),
            month: date.getMonth(),
            headline: article.headline,
            url: article.qmUrl,
            provider: article.provider,
            summary: articleObj.description,
        }

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await textSplitter.splitDocuments([
            new Document({ pageContent: text })
        ]);

        const embeddings = new OpenAIEmbeddings();
        const promises = docs.map((doc) => {
            const documentWithMetadata = new Document({
                metadata,
                pageContent: doc.pageContent,
            });
            return PineconeStore.fromDocuments([documentWithMetadata], embeddings, {
                pineconeIndex: index,
                textKey: 'text',
            });
        });
        await Promise.all(promises);
        console.log("New article ingested!" + metadata);
    } catch (error) {
        console.error("Erorr" + error);
    }
}

const ingestNews = async (ticker, company_id) => {
    try {  
        apitoken = "sk_bcf1812a1ee7474aad97ab9f4e9dbbff";
        url = `https://api.iex.cloud/v1/data/core/news/${ticker}?range=last-week&token=${apitoken}`;
        const res = await fetch(url);
        const data = await res.json();
        const cleanedData = await removePaywall(data);
        const client = await initPinecone();
        const index = client.Index(process.env.PINECONE_INDEX_NAME);

        const promises = cleanedData.map(async (article) => {
            console.log(article);
            const date = new Date(article.date);
            const query = "INSERT INTO TEST_DOCUMENTS (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";
            const values = [company_id, "News Article", date.getFullYear(), new Date(), article.qmUrl, date.getMonth()];
            const res = await pool.query(query, values);
            const document_id = res.rows[0].id;
            return extractMetadata(company_id, ticker, document_id, article, index);
        });
        
        await Promise.all(promises);
        
        console.log("Done");
    } catch (error) {
        console.error(error);
    }
}
// const run = async () => {
//     await ingestNews("A"); // Need to insert new company into the db as well
//   }
  
//   run();

module.exports = {
    ingestNews,
}