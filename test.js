const yahooFinance = require('yahoo-finance');
const util = require('util');
require('colors');

const ticker = 'AAPL';

yahooFinance.historical({
    symbol: ticker,
    from: '2023-01-01',
    to: '2023-05-26',
    period: 'd'
}, (err, quotes) => {
    if (err) {
        throw new Error();
    }
    console.log(util.format(
        '===%s (%d) ===',
        ticker,
        quotes.length
    ).cyan);
    if (quotes[0]) {
        console.log(
          '%s\n...\n%s',
          JSON.stringify(quotes[0], null, 2),
          JSON.stringify(quotes[quotes.length - 1], null, 2)
        );
      } else {
        console.log('N/A');
      }
});
