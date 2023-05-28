import yahooFinance from './node_modules/yahoo-finance/lib/historical';
const ticker = 'AAPL';

yahooFinance.historical({
    symbol: ticker,
    from: '2023-01-01',
    to: '2023-05-26',
    period: 'd'
}, (err, quotes) => {
    if (err) {
        console.error('Failed to retrieve stock price data:', err);
        return;
    }
    const stockData = quotes.map(quote => ({
        date: new Date(quote.date),
        price: quote.close
    }));

    const ctx = document.getElementById('stockChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: stockData.map(data => data.date),
            datasets: [{
                label: 'Stock Price',
                data: stockData.map(data => data.price),
                borderColor: 'rgba(0, 123, 255, 1)',
                fill: false
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'time'
                },
                y: {
                    beginAtZero: true
                }
            }
        }
    });
});
