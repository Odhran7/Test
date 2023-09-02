// This util formats the filings so that we can pass to the ingest and tag functions

const formatFilings = (filingsByYear, isEightK) => {
    const filingLinksByYearAndFormType = {};

    for (let year in filingsByYear) {
        filingLinksByYearAndFormType[year] = filingsByYear[year].reduce((links, filing) => {

            let itemNumbers = [];

            // Extract item number
            if (isEightK) {
                const pattern = /\d+\.\d+/g;
                const matches = filing.description.match(pattern);
                itemNumbers = matches ? matches.map(Number) : [];
            }

            links[filing.formType] = links[filing.formType] || [];
            if (isEightK) {
                links[filing.formType].push({
                    link: filing.linkToHtml,
                    html: filing.linkToFilingDetails,
                    txt: filing.linkToTxt,
                    month: filing.formType === '10-K' ? 1 : new Date(filing.filedAt).getMonth() + 1,
                    itemNumbers: itemNumbers,
                });
            } else {
                links[filing.formType].push({
                    link: filing.linkToHtml,
                    html: filing.linkToFilingDetails,
                    txt: filing.linkToTxt,
                    month: filing.formType === '10-K' ? 1 : new Date(filing.filedAt).getMonth() + 1,
                });
            }
            return links;
        }, {});
    }
    return filingLinksByYearAndFormType;
}

module.exports = {
    formatFilings,
}
