const NewsAPI = require('newsapi');
const newsapi = new NewsAPI('177530ff1e734e8b9c1c9e5277215fe3');


newsapi.v2.everything({
    q: 'Apple OR AAPL',
    from: '2023-06-04',
    to: '2017-07-04',
    language: 'en',
    sortBy: 'relevancy',
    page: 2
  }).then(response => {
    console.log(response);
    console.log(response.length);
    /*
      {
        status: "ok",
        articles: [...]
      }
    */
  });
