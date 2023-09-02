const { Document } = require('langchain/document');
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const { insertIntoVectors } = require('./vectorIdInsertion');

const ingestToPinecone = async (document_id, docs, index, type) => {
    const embeddings = new OpenAIEmbeddings();

    const promises = docs.map(async (doc) => {
        let vector_id = await insertIntoVectors(document_id);
        const documentWithMetadata = new Document({
            metadata: {...doc.metadata, vector_id}, 
            pageContent: doc.pageContent,
        });
        return PineconeStore.fromDocuments([documentWithMetadata], embeddings, {
            pineconeIndex: index,
            textKey: 'text',
        });
    });
    await Promise.all(promises);
};

module.exports = {
    ingestToPinecone,
}