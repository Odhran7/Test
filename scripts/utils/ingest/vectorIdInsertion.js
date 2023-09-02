// This util is used to be able to query the pinecone database like a traditional database

const dotenv = require("dotenv");
const pool = require("./initDB");
dotenv.config({ path: "../../.env" });

// dotenv.config();

// This inserts into the documents table and returns the id

const insertIntoVectors = async (document_id) => {
  const selectQuery = `SELECT id FROM VECTORS WHERE document_id = $1;`;
  const insertQuery = `INSERT INTO VECTORS (document_id) VALUES ($1) RETURNING id;`;
  const values = [document_id];

  let vector_id;

  try {
    // Check if document_id already exists
    const selectResult = await pool.query(selectQuery, values);
    if (selectResult.rows.length > 0) {
      vector_id = selectResult.rows[0].id;
    } else {
      // Insert new document_id
      const insertResult = await pool.query(insertQuery, values);
      vector_id = insertResult.rows[0].id;
    }
  } catch (error) {
    console.error(
      "An error occurred in the getOrInsertIntoVectors function:",
      error
    );
  }

  return vector_id;
};

module.exports = {
  insertIntoVectors,
};
