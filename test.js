const yahooFinance2 = require('yahoo-finance2').default;

const getResults = async (ticker) => {
  const results = (await yahooFinance2.quoteSummary(ticker)).summaryDetail;
  return results;
}

(async () => {
  const searchResults = await getResults('AAPL');
  console.log(searchResults);
})();

/*

search() 
{
  explains: [],
  count: 11,
  quotes: [
    {
      exchange: 'NMS',
      shortname: 'Apple Inc.',
      quoteType: 'EQUITY',
      symbol: 'AAPL',
      index: 'quotes',
      score: 18709100,
      typeDisp: 'Equity',
      longname: 'Apple Inc.',
      exchDisp: 'NASDAQ',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      dispSecIndFlag: true,
      isYahooFinance: true
    },
    {
      exchange: 'PCX',
      shortname: 'Tidal ETF Trust II YieldMax AAP',
      quoteType: 'ETF',
      symbol: 'APLY',
      index: 'quotes',
      score: 20524,
      typeDisp: 'ETF',
      longname: 'Tidal Trust II - YieldMax AAPL Option Income Strategy ETF',
      exchDisp: 'NYSEArca',
      isYahooFinance: true
    },
    {
      exchange: 'NGM',
      shortname: 'Direxion Daily AAPL Bull 1.5X S',
      quoteType: 'ETF',
      symbol: 'AAPU',
      index: 'quotes',
      score: 20170,
      typeDisp: 'ETF',
      longname: 'Direxion Daily AAPL Bull 1.5X Shares',
      exchDisp: 'NASDAQ',
      isYahooFinance: true
    },
    {
      exchange: 'NGM',
      shortname: 'Direxion Daily AAPL Bear 1X Sha',
      quoteType: 'ETF',
      symbol: 'AAPD',
      index: 'quotes',
      score: 20102,
      typeDisp: 'ETF',
      longname: 'Direxion Daily AAPL Bear 1X Shares',
      exchDisp: 'NASDAQ',
      isYahooFinance: true
    },
    {
      exchange: 'OPR',
      shortname: 'AAPL May 2023 175.000 call',
      quoteType: 'OPTION',
      symbol: 'AAPL230526C00175000',
      index: 'quotes',
      score: 20085,
      typeDisp: 'Option',
      exchDisp: 'OPR',
      isYahooFinance: true
    },
    {
      exchange: 'NEO',
      shortname: 'APPLE CDR (CAD HEDGED)',
      quoteType: 'EQUITY',
      symbol: 'AAPL.NE',
      index: 'quotes',
      score: 20066,
      typeDisp: 'Equity',
      longname: 'Apple Inc.',
      exchDisp: 'NEO',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      isYahooFinance: true
    },
    {
      index: '78ddc07626ff4bbcae663e88514c23a0',
      name: 'AAPlasma',
      permalink: 'aaplasma',
      isYahooFinance: false
    }
  ],
  news: [
    {
      uuid: '9466d980-2985-3f17-b025-64d8fea4086a',
      title: 'Salesforce, Lululemon, Broadcom, Chewy, HP, and More Stocks to Watch This Week',
      publisher: 'Barrons.com',
      link: 'https://finance.yahoo.com/m/9466d980-2985-3f17-b025-64d8fea4086a/salesforce%2C-lululemon%2C.html',
      providerPublishTime: 2023-05-28T19:00:00.000Z,
      type: 'STORY',
      thumbnail: [Object],
      relatedTickers: [Array]
    },
    {
      uuid: '9a921f30-4609-328e-a130-d22c6ba14e81',
      title: 'ChatGPT Stock Portfolio: Top 10 Picks',
      publisher: 'Insider Monkey',
      link: 'https://finance.yahoo.com/news/chatgpt-stock-portfolio-top-10-150929797.html',
      providerPublishTime: 2023-05-28T15:09:29.000Z,
      type: 'STORY',
      thumbnail: [Object],
      relatedTickers: [Array]
    },
    {
      uuid: '81d18c91-17b5-3970-a22b-75b79d6de353',
      title: '15 Best Blue Chip Stocks To Buy According to Hedge Funds',
      publisher: 'Insider Monkey',
      link: 'https://finance.yahoo.com/news/15-best-blue-chip-stocks-135754342.html',
      providerPublishTime: 2023-05-28T13:57:54.000Z,
      type: 'STORY',
      thumbnail: [Object],
  timeTakenForQuotes: 432,
  timeTakenForNews: 700,
  timeTakenForAlgowatchlist: 400,
  timeTakenForPredefinedScreener: 400,
  timeTakenForCrunchbase: 400,
  timeTakenForNav: 400,
  timeTakenForResearchReports: 0,
  timeTakenForScreenerField: 0,
  timeTakenForCulturalAssets: 0
}

getSummary()
{
  summaryDetail: {
    maxAge: 1,
    priceHint: 2,
    previousClose: 172.99,
    open: 173.32,
    dayLow: 173.11,
    dayHigh: 175.77,
    regularMarketPreviousClose: 172.99,
    regularMarketOpen: 173.32,
    regularMarketDayLow: 173.11,
    regularMarketDayHigh: 175.77,
    dividendRate: 0.96,
    dividendYield: 0.0055,
    exDividendDate: 2023-05-12T00:00:00.000Z,
    payoutRatio: 0.1559,
    fiveYearAvgDividendYield: 0.92,
    beta: 1.296622,
    trailingPE: 29.78438,
    forwardPE: 26.783205,
    volume: 54834975,
    regularMarketVolume: 54834975,
    averageVolume: 58217761,
    averageVolume10days: 50891180,
    averageDailyVolume10Day: 50891180,
    bid: 175.5,
    ask: 175.54,
    bidSize: 1000,
    askSize: 800,
    marketCap: 2759285800960,
    fiftyTwoWeekLow: 124.17,
    fiftyTwoWeekHigh: 176.39,
    priceToSalesTrailing12Months: 7.165208,
    fiftyDayAverage: 166.6334,
    twoHundredDayAverage: 152.32085,
    trailingAnnualDividendRate: 0.92,
    trailingAnnualDividendYield: 0.0053182263,
    currency: 'USD',
    fromCurrency: null,
    toCurrency: null,
    lastMarket: null,
    coinMarketCapLink: null,
    algorithm: null,
    tradeable: false
  },
  price: {
    maxAge: 1,
    preMarketSource: 'FREE_REALTIME',
    postMarketChangePercent: 0.0005130913,
    postMarketChange: 0.0900116,
    postMarketTime: 2023-05-26T23:59:55.000Z,
    postMarketPrice: 175.52,
    postMarketSource: 'DELAYED',
    regularMarketChangePercent: 0.014104787,
    regularMarketChange: 2.4399872,
    regularMarketTime: 2023-05-26T20:00:05.000Z,
    priceHint: 2,
    regularMarketPrice: 175.43,
    regularMarketDayHigh: 175.77,
    regularMarketDayLow: 173.11,
    regularMarketVolume: 54834975,
    averageDailyVolume10Day: 50891180,
    averageDailyVolume3Month: 58217761,
    regularMarketPreviousClose: 172.99,
    regularMarketSource: 'FREE_REALTIME',
    regularMarketOpen: 173.32,
    exchange: 'NMS',
    exchangeName: 'NasdaqGS',
    exchangeDataDelayedBy: 0,
    marketState: 'CLOSED',
    quoteType: 'EQUITY',
    symbol: 'AAPL',
    underlyingSymbol: null,
    shortName: 'Apple Inc.',
    longName: 'Apple Inc.',
    currency: 'USD',
    quoteSourceName: 'Delayed Quote',
    currencySymbol: '$',
    fromCurrency: null,
    toCurrency: null,
    lastMarket: null,
    marketCap: 2759285800960
  }
}
*/

