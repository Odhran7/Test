// This util extracts numberOfWords keywords from the article

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const sw = require('stopword');

const extractSignificantWords = (text, numberOfWords = 20) => {
    let words = tokenizer.tokenize(text.toLowerCase());
    words = sw.removeStopwords(words);
    words = words.filter(word => isNaN(word));
    let frequencyCount = words.reduce((prev, curr) => {
        prev[curr] = (prev[curr] || 0) + 1;
        return prev;
    }, {});
    let sortedWords = Object.keys(frequencyCount).sort((a, b) => frequencyCount[b] - frequencyCount[a]);
    return sortedWords.slice(0, numberOfWords);
};

module.exports = {
    extractSignificantWords,
}
