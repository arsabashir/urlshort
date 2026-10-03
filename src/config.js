require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  db: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.DB_SSL === 'true',
    client: process.env.DB_CLIENT || 'better-sqlite3', // 'mysql2' (Docker) or 'pg' (Render)
    file: process.env.DB_FILE || './dev.sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'urlshort',
  },
};
