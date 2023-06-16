import os
import re
import glob
from secedgar import CompanyFilings, FilingType
from bs4 import BeautifulSoup
import sys 

def create_path_if_not_exist(path):
    if not os.path.exists(path):
        os.makedirs(path)

def get_item_parts(data_text, pattern_start, pattern_end):
    try:
        match_start = re.search(pattern_start, data_text, re.IGNORECASE)
        if match_start:
            index_start = match_start.start()

        match_end = re.search(pattern_end, data_text, re.IGNORECASE)
        if match_end:
            index_end = match_end.start()

        item_parts = data_text[index_start:index_end]
        return item_parts.strip()

    except Exception as e:
        print(f"Error during item extraction: {str(e)}")
        return None

def clean_data_and_write_to_file(ticker, data, file_path, item_patterns):
    try:
        for i, table in enumerate(data.find_all('table')):
            if i < 100:
                table.decompose()
            else:
                break

        data_text = data.get_text().strip()

        file_loc = os.path.dirname(file_path)
        create_path_if_not_exist(file_loc)

        with open(file_path, 'w', encoding='utf8') as f:
            f.write(data_text)

        with open(file_path, 'r+', encoding='utf8') as f:
            file_contents = f.read()
            cleaned_contents = re.sub(r'http\S+|www\S+', '', file_contents)
            f.seek(0)
            f.write(cleaned_contents)
            f.truncate()

        for item, pattern in item_patterns.items():
            item_file_path = os.path.join('.', ticker, item, ticker + item + '.txt')
            item_loc = os.path.dirname(item_file_path)
            create_path_if_not_exist(item_loc)
            item_parts = get_item_parts(data_text, pattern['start'], pattern['end'])
            if item_parts:
                with open(item_file_path, 'w', encoding='utf8') as f:
                    f.write(item_parts)

    except Exception as e:
        print(f"Error during data cleaning and file writing: {str(e)}")

def save_and_parse_10k(ticker):
    my_filings = CompanyFilings(
        cik_lookup=ticker,
        filing_type=FilingType.FILING_10K,
        count=1,
        user_agent='Odhran Russell (russell.odhran@gmail.com)'
    )
    my_filings.save('./docs')

    path = f'./docs/{ticker}/10-K/*.txt'
    file_path = glob.glob(path)[0]

    with open(file_path) as f:
        contents = f.read()

    soup = BeautifulSoup(contents, 'xml')
    return soup

def main():
    try:
        ticker = sys.argv[1]
        soup = save_and_parse_10k(ticker)
    
        item_patterns = {
            'item1': {
                'start': r'PART\s*I(?:tem)?\s*1|(?<!")Item\s*1\.|\dItem\s*1|BUSINESS\s*SUMMARY',
                'end': r'PART\s*I(?:tem)?\s*1A|(?<!")Item\s*1A\.|\dItem\s*1A|MANAGEMENT.S\s*VIEW\s*OF\s*THE\s*BUSINESS'
            },
            'item1a': {
                'start': r'PART\s*I(?:tem)?\s*1A|(?<!")Item\s*1A\.|\dItem\s*1A|ISSUER\sPURCHASES\sOF\sEQUITY\sSECURITIES',
                'end': r'PART\sI(?:tem)?\s2|(?<!")Item\s2\.|\dItem\s2|(?<=LEGAL\sAND\sREGULATORY)\w'
            },
            'item2': {
                'start': r'PART\sI(?:tem)?\s2|(?<!")Item\s2\.|\dItem\s2|(PROPERTIES)\w',
                'end': r'PART\sI(?:tem)?\s3|(?<!")Item\s3\.|\dItem\s3|(\d+INFORMATION\sABOUT\sOUR\sEXECUTIVE\sOFFICERS)\w+'
            },
            'item5': {
                'start': r'PART\sII(?:tem)?\s5|(?<!")Item\s5\.|(MARKET\sINFORMATION\sAND\sDIVIDEND\sPOLICY)\w+',
                'end': r'PART\sII(?:tem)?\s6|(?<!")Item\s6\.|\dItem\s6|(\d+INFORMATION\sABOUT\sOUR\sEXECUTIVE\sOFFICERS)\w+'
            },
            'item7': {
                'start': r'PART\sII(?:tem)?\s7|(?<!")Item\s7\.|MANAGEMENT.S\s*VIEW\s*OF\s*THE\s*BUSINESS',
                'end': r'PART\sII(?:tem)?\s8|(?<!")Item\s8\.|\dItem\s8|STOCK\sPERFORMANCE\sGRAPH'
            }
        }

        clean_data_and_write_to_file(ticker, soup, './10k/' + ticker + '/' + ticker + '10k.txt', item_patterns)

    except Exception as e:
        print(f"Error during filing retrieval or processing: {str(e)}")

if __name__ == "__main__":
    main()
