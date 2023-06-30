

const dotenv = require("dotenv");
const { PineconeClient } = require("@pinecone-database/pinecone");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const pgParse = require("pg-connection-string");
const pg = require("pg");
const path = require("path");
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { error } = require("console");
const { Document } = require('langchain/document');
const { queryApi, extractorApi } = require('sec-api');
const { TokenTextSplitter } = require("langchain/text_splitter");
const { ingestNews } = require('./ingestNews');
const natural = require('natural');

// Set the initialisation vars 

// dotenv.config({ path: '../.env' });
dotenv.config();

queryApi.setApiKey(process.env.SEC_API_KEY);

// Instantiate the database connection
const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false,
};
const pool = new pg.Pool(config);

// Instantiate pinecone

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

const groupByYear = (filings) => {
    const grouped = filings.reduce((result, filing) => {
        const year = new Date(filing.filedAt).getFullYear();
        if (!result[year]) {
            result[year] = [];
        }
        result[year].push(filing);
        return result;
    }, {});
    return grouped;
};

const getFilingsTicker = async (ticker) => {
    const query = {
        query: { query_string: { query: `ticker:"${ticker}" && (formType:"10-Q" || formType:"10-K") && filedAt:[2021-01-01 TO 2023-12-31]` } }, //  && filedAt:[2015-01-01 TO 2023-12-31]
        from: '0',
        size: '1000',
        sort: [{ filedAt: { order: 'desc' } }],
    };
    
    const filings = await queryApi.getFilings(query);
    console.log(filings);
    const filingsByYear = groupByYear(filings.filings);

    const filingLinksByYearAndFormType = {};
    for (let year in filingsByYear) {
        filingLinksByYearAndFormType[year] = filingsByYear[year].reduce((links, filing) => {
            if (!links[filing.formType]) {
                links[filing.formType] = [];
            }
            // create an object for each filing with the desired links
            const filingLinks = {
                link: filing.linkToHtml,
                html: filing.linkToFilingDetails, 
                txt: filing.linkToTxt,
            };
            links[filing.formType].push(filingLinks);
            return links;
        }, {});
    }
    console.log("This is the filingLinksByYearAndFormType");
    return filingLinksByYearAndFormType;
}

const getItemAndIngest = async (index, filings, ticker, company_id) => {
    const itemDict10K = {
        '1': 'Business',
        '1A': 'Risk Factors',
        '1B': 'Unresolved Staff Comments',
        '2': 'Properties',
        '3': 'Legal Proceedings',
        '4': 'Mine Safety Disclosures',
        '5': 'Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities',
        '6': 'Selected Financial Data (prior to February 2021)',
        '7': 'Management’s Discussion and Analysis of Financial Condition and Results of Operations',
        '7A': 'Quantitative and Qualitative Disclosures about Market Risk',
        '8': 'Financial Statements and Supplementary Data',
        '9': 'Changes in and Disagreements with Accountants on Accounting and Financial Disclosure',
        '9A': 'Controls and Procedures',
        '9B': 'Other Information',
        '10': 'Directors, Executive Officers and Corporate Governance',
        '11': 'Executive Compensation',
        '12': 'Security Ownership of Certain Beneficial Owners and Management and Related Stockholder Matters',
        '13': 'Certain Relationships and Related Transactions, and Director Independence',
        '14': 'Principal Accountant Fees and Services'
    };

    const itemDict10Q = {
        'part1item1': 'Business',
        'part1item2': 'Risk Factors',
        'part1item3': 'Unresolved Staff Comments',
        'part1item4': 'Properties',
        'part2item1': 'Legal Proceedings',
        'part2item1a': 'Mine Safety Disclosures',
        'part2item2': 'Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities',
        'part2item3': 'Selected Financial Data (prior to February 2021)',
        'part2item4': 'Management’s Discussion and Analysis of Financial Condition and Results of Operations',
        'part2item5': 'Quantitative and Qualitative Disclosures about Market Risk',
        'part2item6': 'Financial Statements and Supplementary Data',
    };

    const query = "INSERT INTO test_documents (company_id, document_type, year, upload_timestamp, link) VALUES ($1, $2, $3, $4, $5) RETURNING id;";

    // Define an array to hold all documents

    let documentsWithMetadata = [];

    for (let year in filings) {
        let type;

        if (Array.isArray(filings[year]['10-Q'])) {
            const promises = filings[year]['10-Q'].map(async (link) => {    
                type = "10Q";
                let document_id;
                const values = [
                    company_id,
                    type,
                    year,
                    new Date(),
                    link.html,
                ];
                try {
                    const result = await pool.query(query, values);
                    document_id = result.rows[0].id;
                } catch (error) {
                    console.error("Error inserting into db 10Q: " + error.message);
                    return;
                }   
                const docsPromises = Object.keys(itemDict10Q).map(item => 
                    getItemTxtAndIngest(link.link, link.txt, item, document_id, ticker, type, year)
                );
                return Promise.all(docsPromises);
            });
            const nestedDocs = await Promise.all(promises);
            documentsWithMetadata = documentsWithMetadata.concat(...nestedDocs.flat());
        }

        if (Array.isArray(filings[year]['10-K'])) {
            const promises = filings[year]['10-K'].map(async (link) => {
                type = "10K";
                let document_id;
                const values = [
                    company_id,
                    type,
                    year,
                    new Date(),
                    link.html,
                ];
                try {
                    const result = await pool.query(query, values);
                    document_id = result.rows[0].id;
                } catch (error) {
                    console.error("Error inserting into db 10K: " + error.message);
                    return;
                }
                const docsPromises = Object.keys(itemDict10K).map(item => 
                    getItemTxtAndIngest(link.link, link.txt, item, document_id, ticker, type, year)
                );
                return Promise.all(docsPromises);
            });
            const nestedDocs = await Promise.all(promises);
            documentsWithMetadata = documentsWithMetadata.concat(...nestedDocs.flat());
        }
    }

    console.log(documentsWithMetadata);

    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();

    //embed the txt docs
    if (documentsWithMetadata.length > 0) {
        documentsWithMetadata = documentsWithMetadata.filter(doc => doc != null);
        await PineconeStore.fromDocuments(documentsWithMetadata, embeddings, {
            pineconeIndex: index,
            textKey: 'text',
        });
    }

    console.log("Documents were ingested into the Pinecone store successfully!");
}


const getItemTxtAndIngest = async (link, txt, item, document_id, ticker, type, year) => {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
    let documentsWithMetadata;

    try {
        const sectionText = await extractorApi.getSection(link, item, 'text');
        const docs = await textSplitter.splitDocuments([
            new Document({ pageContent: sectionText })
        ]);
        // const tokenizer = new natural.WordTokenizer();
        // const tokens = tokenizer.tokenize(sectionText);
        const metadata = {
            id: document_id,
            ticker: ticker,
            type: type,
            item: item,
            year: year,
            link: link,
            txt: txt,
        };

        // Add the metadata to the docs
        documentsWithMetadata = docs.map((doc) => new Document({
            metadata,
            pageContent: doc.pageContent,
        }));

        console.log("Document prepared successfully!");
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`Item ${item} not found at url: ${link}`);
        } else {
            console.error(error);
        }
    }

    // Return the prepared documents
    return documentsWithMetadata;
}

const ingestCompany = async (ticker, domain) => {
    try {
      // Initialize the Pinecone client
      const client = await initPinecone();
      const index = client.Index(process.env.PINECONE_INDEX_NAME);

      const filings = await getFilingsTicker(ticker);

      const query = `SELECT * FROM companies WHERE ticker=$1;`;
      const values = [ticker];
      const result = await pool.query(query, values);
      let company_id = result.rows.length > 0 ? result.rows[0].id : null;

      if (!company_id) {
        const insertCompanyQuery = `INSERT INTO companies (ticker, url) VALUES ($1, $2) RETURNING id;`;
        const insertCompanyValues = [ticker, domain];
        const insertResult = await pool.query(insertCompanyQuery, insertCompanyValues);
        company_id = insertResult.rows[0].id;
      }

      await getItemAndIngest(index, filings, ticker, company_id);

      await ingestNews(ticker, company_id);
      console.log("Company has been ingested");

    } catch (error) {
      console.error("Error ingesting document: ", error);
    }  
}
  

// const run = async () => {
//     await ingestCompany("A"); // Need to insert new company into the db as well
//   }
  
//   run();

  module.exports = {
    ingestCompany,
  }