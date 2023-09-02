// This module gets all the related news articles for a specifc ticker

const dotenv = require("dotenv");
const pool = require('../utils/ingest/initDB');
const fetch = require('node-fetch');
const { initPinecone } = require('../utils/initPinecone');
const { extractMetadataAndIngest } = require('../utils/ingest/extractMetadataNews');
const { severConnection } = require("../utils/ingest/severConnection");

// dotenv.config();
dotenv.config({ path: '../.env' });

const ingestArticles = async (articles, company_id, ticker, index) => {
    const promises = articles.map(async (article) => {
        const date = new Date(article.published_utc); 
        const year = date.getFullYear(); 
        const month = date.getMonth();  
        const query = "INSERT INTO DOCUMENTS_TAG (company_id, document_type, year, upload_timestamp, link, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;";
        const values = [company_id, "News Article", year, new Date(), article.article_url, month];
        const res = await pool.query(query, values);
        const document_id = res.rows[0].id;
        return extractMetadataAndIngest(company_id, ticker, document_id, article, index, "News Article");
    });
    return Promise.all(promises);
};

const ingestNews = async (index, ticker, company_id) => {
    try {
        const currentDate = new Date();
        const sixMonthsAgo = new Date(currentDate);
        sixMonthsAgo.setMonth(currentDate.getMonth() - 6);
        const formattedSixMonthsAgo = sixMonthsAgo.toISOString().split('T')[0];

        const apitoken = process.env.POLYGON_API_KEY;
        const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&published_utc.gte=${formattedSixMonthsAgo}&limit=1000&apiKey=${apitoken}`;
        const res = await fetch(url);
        const data = await res.json();

        // Instantiate Pinecone connection

        const client = await initPinecone();
        const index = client.Index(process.env.PINECONE_INDEX_NAME);

        await ingestArticles(data.results, company_id, ticker, index);
        console.log("Done");
    } catch (error) {
        console.error(error);
    }
};

module.exports = { 
    ingestNews
};
