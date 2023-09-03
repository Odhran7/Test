// This util wipes the entire vector db -> ONLY USE IF YOU KNOW WHAT YOU ARE DOING
const { PineconeClient } = require("@pinecone-database/pinecone");
const dotenv = require('dotenv');

dotenv.config({ path: "../../.env" });

async function deleteIndex() {
    const client = new PineconeClient();
    await client.init({
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT,
    });
    const pineconeIndex = client.Index(process.env.PINECONE_INDEX_NAME);
    indexDeleteResponse = pineconeIndex.delete1({
        deleteAll: true,
    });
    return indexDeleteResponse;
}


deleteIndex().then((response) => console.log(response)).catch((error) => console.error(error));

module.exports = {
    deleteIndex,
}