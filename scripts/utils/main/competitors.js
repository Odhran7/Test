// This util is used to get company peers

const https = require("https");
const dotenv = require("dotenv");

// dotenv.config();
dotenv.config({ path: "../../../.env" });

const getPeers = async (ticker) => {
  const apiKey = process.env.FINANCIAL_MODELLING_PREP_API_KEY;
  const options = {
    hostname: "financialmodelingprep.com",
    port: 443,
    path: `https://financialmodelingprep.com/api/v4/stock_peers?symbol=${ticker}&apikey=${apiKey}`,
    method: "GET",
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => {
        data += d;
      });
      res.on("end", () => {
        const parsedData = JSON.parse(data);
        resolve(parsedData[0].peersList);
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
};

// getPeers("AAPL")
//   .then((data) => console.log(data))
//   .catch((error) => console.log(error));

  module.exports = {
    getPeers,
  }
