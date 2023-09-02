const finnhub = require('finnhub');
const dotenv = require('dotenv');

dotenv.config({ path: "../.env" });

const api_key = finnhub.ApiClient.instance.authentications['api_key'];
api_key.apiKey = process.env.FINN_HUB_API_KEY; 
const finnhubClient = new finnhub.DefaultApi();

// This is the module that will ingest all of the data

const ingestPatents = async (document_id, ticker) => {
  const patentList = getPatentFilingsForYear(ticker, "2020-06-01", "2021-06-10");
  for (const patent of patentList) {
    const description = patent.description;
    const filingStatus = patent.filingStatus;
    const patentNumber = patent.patentNumber;
    const patentPublicationDate = patent.publicationDate;
  }
}

// Gets list of patents and their respective patent numbers

const getPatentFilingsForYear = async (ticker, start, end) => {
  return new Promise((resolve, reject) => {
    finnhubClient.stockUsptoPatent(ticker, start, end, (error, data, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
};

// getPatentFilingsForYear('AAPL', '2022-01-01', '2022-12-31')
//   .then(data => console.log(data))
//   .catch(error => console.error(error));

