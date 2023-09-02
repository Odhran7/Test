// This util groups together the filings by year with link, html, txt and the month

const { queryApi } = require("sec-api");
const { getDateXYearsAgo } = require("./getDateXYearsAgo");
const { groupByYear } = require("./groupByYear");
const { formatFilings } = require("./formatFilings");

const getFilingsTicker = async (
  ticker,
  eightK,
  tenKTenQ,
  thirteenF,
  lastXYears
) => {
  let secApiQuery;
  let date = getDateXYearsAgo(lastXYears); //  && filedAt:[2015-01-01 TO 2023-12-31] -> This is what the date is for three years 

  if (eightK) {
    secApiQuery = {
      query: {
        query_string: {
          query: `ticker:"${ticker}" && (formType:"8-K") && filedAt:[${date}]`,
        },
      }, 
      from: "0",
      size: "1000",
      sort: [{ filedAt: { order: "desc" } }],
    };
  } else if (tenKTenQ) {
    secApiQuery = {
      query: {
        query_string: {
          query: `ticker:"${ticker}" && (formType:"10-Q" || formType:"10-K") && filedAt:[${date}]`,
        },
      },
      from: "0",
      size: "1000",
      sort: [{ filedAt: { order: "desc" } }],
    };
  } else if (thirteenF) {
    secApiQuery = {
      query: {
        query_string: {
          query: `holdings.ticker:"${ticker}" AND formType:"13F-HR" AND NOT formType:"13F-HR/A" AND filedAt:[${date}]`,
        },
      },
      from: "0",
      size: "1000",
      sort: [{ filedAt: { order: "desc" } }],
    };
  }
  try {
    const filings = await queryApi.getFilings(secApiQuery);
    const filingsByYear = groupByYear(filings.filings);
    const filingLinksByYearAndFormType = formatFilings(filingsByYear, eightK);
    return filingLinksByYearAndFormType;
  } catch (error) {
    console.error("There is an error in the getFilings function: " + error);
  }
};

module.exports = {
  getFilingsTicker,
};
