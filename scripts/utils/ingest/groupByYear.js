// This util groups the raw filings by year

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

module.exports = {
    groupByYear,
}