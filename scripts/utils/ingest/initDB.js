// This util instantiates the db connection to the Postgres db

const dotenv = require('dotenv');
const pgParse = require("pg-connection-string");
const pg = require("pg");

dotenv.config({ path: "../.env" });

const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = { rejectUnauthorized: false };
const pool = new pg.Pool(config);

module.exports = pool;