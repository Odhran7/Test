// This util is used to prevent rate limits from the sec-api

const dotenv = require("dotenv");
const { queryApi, extractorApi } = require('sec-api');

// dotenv.config();

dotenv.config({ path: '../.env' });

queryApi.setApiKey(process.env.SEC_API_KEY);

const getSectionWithRetry = async (link, item, format) => {
    const maxRetries = 5;
    let retries = 0;
  
    while (retries < maxRetries) {
      try {
        return await extractorApi.getSection(link, item, format);
      } catch (error) {
        if (error.response && error.response.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            console.log(`Rate limit error. Retrying in ${retryAfter} seconds.`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            retries++;
          } else {
            console.log('Rate limit error, but retry-after header not present. Retrying in ' + Math.pow(2, retries) + ' seconds.');
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries++) * 1000));
          }
        } else {
          throw error;
        }
      }
    }
  
    throw new Error('Max retries exceeded.');
  };

module.exports = {
    getSectionWithRetry,
}