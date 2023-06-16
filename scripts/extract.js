const { queryApi, extractorApi } = require('sec-api');

queryApi.setApiKey("b8113d497aa775cb50186f7f03c97c7e8b3158734705787264d31e7f627dc6db");

const query = {
    query: { query_string: { query: 'ticker:"TSLA" && (formType:"10-Q" || formType:"10-K")' } },
    from: '0',
    size: '1000',
    sort: [{ filedAt: { order: 'desc' } }],
};

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

const extract = async (query) => {
    const filings = await queryApi.getFilings(query);
    console.log(filings);
    const filingsByYear = groupByYear(filings.filings);

    const filingLinksByYearAndFormType = {};
    for (let year in filingsByYear) {
        filingLinksByYearAndFormType[year] = filingsByYear[year].reduce((links, filing) => {
            if (!links[filing.formType]) {
                links[filing.formType] = [];
            }
            links[filing.formType].push(filing.linkToHtml);
            return links;
        }, {});
    }
    console.log(filingLinksByYearAndFormType);
    return filingLinksByYearAndFormType;
};

const getTXTAndIngest = async (filings) => {
    const itemDict10K = {
        '1': 'Business',
        '1A': 'Risk Factors',
        '1B': 'Unresolved Staff Comments',
        '2': 'Properties',
        '3': 'Legal Proceedings',
        '4': 'Mine Safety Disclosures',
        '5': 'Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities',
        '6': 'Selected Financial Data (prior to February 2021)',
        '7': 'Management’s Discussion and Analysis of Financial Condition and Results of Operations',
        '7A': 'Quantitative and Qualitative Disclosures about Market Risk',
        '8': 'Financial Statements and Supplementary Data',
        '9': 'Changes in and Disagreements with Accountants on Accounting and Financial Disclosure',
        '9A': 'Controls and Procedures',
        '9B': 'Other Information',
        '10': 'Directors, Executive Officers and Corporate Governance',
        '11': 'Executive Compensation',
        '12': 'Security Ownership of Certain Beneficial Owners and Management and Related Stockholder Matters',
        '13': 'Certain Relationships and Related Transactions, and Director Independence',
        '14': 'Principal Accountant Fees and Services'
    };

    const itemDict10Q = {
        'part1item1': 'Business',
        'part1item2': 'Risk Factors',
        'part1item3': 'Unresolved Staff Comments',
        'part1item4': 'Properties',
        'part2item1': 'Legal Proceedings',
        'part2item1a': 'Mine Safety Disclosures',
        'part2item2': 'Market for Registrant’s Common Equity, Related Stockholder Matters and Issuer Purchases of Equity Securities',
        'part2item3': 'Selected Financial Data (prior to February 2021)',
        'part2item4': 'Management’s Discussion and Analysis of Financial Condition and Results of Operations',
        'part2item5': 'Quantitative and Qualitative Disclosures about Market Risk',
        'part2item6': 'Financial Statements and Supplementary Data',
    };

// In your getTXTAndIngest function
for (let year in filings) {
    if (filings[year]['10-Q']) {
        for (let link of filings[year]['10-Q']) {
            for (let item in itemDict10Q) {
                try {
                    const sectionText = await extractorApi.getSection(link, item, 'text');
                    console.log("Item " + item + " : url: " + link + '\n' + sectionText);
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.log(`Item ${item} not found at url: ${link}`);
                    } else {
                        console.error(error);
                    }
                }
            }
        }
    }
    
    if (filings[year]['10-K']) {
        for (let link of filings[year]['10-K']) {
            for (let item in itemDict10K) {
                try {
                    const sectionText = await extractorApi.getSection(link, item, 'text');
                    console.log("Item " + item + " : url: " + link + '\n' + sectionText);
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.log(`Item ${item} not found at url: ${link}`);
                    } else {
                        console.error(error);
                    }
                }
            }
        }
    }
}

}

const run = async () => {
  const filingLinksByYearAndFormType = await extract(query);
  await getTXTAndIngest(filingLinksByYearAndFormType);
}

run();
