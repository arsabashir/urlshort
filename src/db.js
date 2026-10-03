const knex = require('knex');
const config = require('./config');

const { db } = config;

const options =
  db.client === 'pg'
    ? {
        client: 'pg',
        connection: { connectionString: db.url, ssl: db.ssl ? { rejectUnauthorized: false } : false },
        pool: { min: 0, max: 10 },
      }
    : db.client === 'mysql2'
    ? {
        client: 'mysql2',
        connection: {
          host: db.host,
          port: db.port,
          user: db.user,
          password: db.password,
          database: db.database,
        },
        pool: { min: 0, max: 10 },
      }
    : {
        client: 'better-sqlite3',
        connection: { filename: config.env === 'test' ? ':memory:' : db.file },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 }, // single connection keeps :memory: DB alive in tests
      };

module.exports = knex(options);
