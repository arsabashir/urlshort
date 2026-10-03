const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const config = require('./config');
const authRoutes = require('./routes/auth');
const linkRoutes = require('./routes/links');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Brute-force protection on auth endpoints (disabled in tests)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.env === 'test',
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/links', linkRoutes);

// Public redirect: GET /:code
app.get('/:code', async (req, res) => {
  const link = await db('links').where({ code: req.params.code }).first();
  if (!link) return res.status(404).json({ error: 'Short link not found' });
  if (link.expires_at && Number(link.expires_at) <= Date.now()) {
    return res.status(410).json({ error: 'This link has expired' });
  }

  // Awaited for simplicity. At scale this would go to a queue so redirects stay fast.
  await db('clicks').insert({
    link_id: link.id,
    clicked_at: Date.now(),
    referrer: (req.get('referer') || '').slice(0, 512) || null,
    user_agent: (req.get('user-agent') || '').slice(0, 512) || null,
  });
  await db('links').where({ id: link.id }).increment('click_count', 1);

  res.redirect(302, link.target_url);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
