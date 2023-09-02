const dotenv = require("dotenv");
const { extract } = require('@extractus/article-extractor');
const { convert } = require('html-to-text');
const { extractSignificantWords } = require('./keywordExtraction');
const { Document } = require('langchain/document');
const { ingestToPinecone } = require('./ingestPincone');
const { insertIntoVectors } = require('../ingest/vectorIdInsertion');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

dotenv.config({ path: '../.env' });

const extractMetadataAndIngest = async (company_id, ticker, document_id, article, index, type) => {
    const date = new Date(article.published_utc);
    console.log(`Processing article from URL: ${article.article_url}`);

    try {
        const articleObj = await extract(article.article_url);
        const text = convert(articleObj.content);
        const vector_id = await insertIntoVectors(document_id);
        const allKeywords = extractSignificantWords(text); 

        // Create metadata object
        const metadata = {
            id: document_id,
            company_id: company_id,
            ticker: ticker,
            year: date.getFullYear(),
            month: date.getMonth(),
            headline: article.title,
            url: article.article_url,
            provider: article.publisher.name,
            vector_id: vector_id,
            keywords: allKeywords,
            isUseful: true,
        };

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await textSplitter.splitDocuments([
            new Document({ pageContent: text, metadata })  // add metadata here
        ]);

        console.log(docs);

        // Call the ingest function
        //await ingestToPinecone(document_id, docs, index, type);
    } catch (error) {
        console.error(`Failed to extract or process article from URL: ${article.article_url}. Error: ${error.message}`);
    }
};

module.exports = {
    extractMetadataAndIngest,
}
