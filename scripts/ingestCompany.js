

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

// Set the initialisation vars 

dotenv.config({ path: '../.env' });

queryApi.setApiKey(process.env.SEC_API_KEY); // DO NOT COMMIT THIS
console.log(process.env.SEC_API_KEY);



// When running in prod 

//dotenv.config();

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
        query: { query_string: { query: `ticker:"${ticker}" && (formType:"10-Q" || formType:"10-K")` } },
        from: '0',
        size: '1000',
        sort: [{ filedAt: { order: 'desc' } }],
    };
    
    console.log("Ticker and query!")
    console.log(ticker);
    console.log(query);
    const filings = await queryApi.getFilings(query);
    console.log("These are the filings!");
    console.log(filings);
    console.log("These are the filings by year!");
    const filingsByYear = groupByYear(filings.filings);
    console.log(filingsByYear)

    const filingLinksByYearAndFormType = {};
    for (let year in filingsByYear) {
        filingLinksByYearAndFormType[year] = filingsByYear[year].reduce((links, filing) => {
            if (!links[filing.formType]) {
                links[filing.formType] = [];
            }
            links[filing.formType].push(filing.linkToHtml);
            return links;
        }, {});
    }
    console.log("This is the filingLinksByYearAndFormType");
    console.log(filingLinksByYearAndFormType);
    return filingLinksByYearAndFormType;
}

const getItemAndIngest = async (index, filings, ticker, company_id) => {
    console.log(`Here are the parameters being passed to getItemAndIngest ${index} ${filings} ${ticker}!`);
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

// In your getTXTAndIngest function
console.log("Entering loop!");
for (let year in filings) {
    console.log(`For year: ${year}!`);
    let type = filings[year]['10-K'] ? "10-K" : "10-Q";
    console.log(`Type: ${type}`);
    const query =
    "INSERT INTO test_documents (company_id, document_type, year, upload_timestamp) VALUES ($1, $2, $3, $4) RETURNING id;";
    const values = [
        company_id,
        type,
        year,
        new Date(),
    ];
    const result = await pool.query(query, values);
    let document_id = result.rows[0].id;
    console.log(`Document_id: %{document_id}`);
    if (filings[year]['10-Q']) {
        for (let link of filings[year]['10-Q']) {
            for (let item in itemDict10Q) {
                try {
                    const documentsWithMetadata = await getItemTxtAndIngest(index, link, item, document_id, ticker, type, year);
                    console.log("Item " + item + " : url: " + link + '\n');
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.log(`Item ${item} not found at url: ${link}`);
                    } else {
                        console.error(error);
                    }
                }
            }
        }
    }
    
    if (filings[year]['10-K']) {
        for (let link of filings[year]['10-K']) {
            for (let item in itemDict10K) {
                try {
                    const documentsWithMetadata = await getItemTxtAndIngest(index, link, item, document_id, ticker, type, year);
                    console.log("Item " + item + " : url: " + link + '\n');
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.log(`Item ${item} not found at url: ${link}`);
                    } else {
                        console.error(error);
                    }
                }
            }
        }
    }
}

}

const getItemTxtAndIngest = async (index, link, item, document_id, ticker, type, year) => {
    // Initialising the recursive character text splitter

    const textSplitter = new TokenTextSplitter();

        let docs;

    try {
        const sectionText = await extractorApi.getSection(link, item, 'text');
        console.log(sectionText);
        console.log("Item " + item + " : url: " + link + '\n');
        console.log("Splitting text for {item}", item)
        const sectionTextDoc = new Document(sectionText);
        docs = await textSplitter.splitDocuments([sectionTextDoc]);
        const metadata = {
            id: document_id,
            ticker: ticker,
            type: type,
            item: item,
            year: year,
          };

        // Add the metadata to the docs

        documentsWithMetadata = docs.map((doc) => new Document({
            metadata,
            pageContent: doc.pageContent,
          }));

        /*create and store the embeddings in the vectorStore*/
        const embeddings = new OpenAIEmbeddings();

        //embed the PDF documents
        await PineconeStore.fromDocuments(documentsWithMetadata, embeddings, {
        pineconeIndex: index,
        namespace: process.env.PINECONE_NAME_SPACE,
        textKey: 'text',
        });


        console.log("Document was ingested into the Pinecone store successfully!");
          
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`Item ${item} not found at url: ${link}`);
        } else {
            console.error(error);
        }
    }

}

const ingestCompany = async (ticker) => {
  try {

    console.log(`In ingestCompany ${ticker}.`);

    // Initialize the Pinecone client
    const client = await initPinecone();
    const index = client.Index(process.env.PINECONE_INDEX_NAME);

    console.log("Pinecone client initialised successfully!");

    // Getting the fillings obj [year: {10k, 10q[]}]...

    console.log("Getting fillings!");
    
    const filings = await getFilingsTicker(ticker);

    // Get the .txt content and ingest into Pinecone db

    console.log("Gettting individual items and ingesting!");

    // Need to get the company_id
    let company_id;
    try {
        const query = `SELECT * FROM companies WHERE ticker=$1;`;
        const values = [ticker];
        const result = await pool.query(query, values);
        company_id = result.rows[0].id;
    } catch (error) {
        console.log(`Error: ${error}`);
        throw new Error("Erorr getting ticker from the database");
    }

    await getItemAndIngest(index, filings, ticker, company_id);

  } catch (error) {
    console.error("Error ingesting document: ", error);
  }
}

const run = async () => {
    await ingestCompany("AAPL");
  }
  
  run();
  