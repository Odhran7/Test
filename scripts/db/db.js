const pg = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false,
};
const pool = new pg.Pool(config);


module.exports = {
    pool,
}