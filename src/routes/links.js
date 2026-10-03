const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const RESERVED = new Set(['api', 'health', 'admin', 'static']);
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function randomCode(length = 7) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const createSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((u) => ['http:', 'https:'].includes(new URL(u).protocol), 'Only http(s) URLs are allowed'),
  customCode: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  expiresAt: z.string().datetime().optional(),
});

function toDto(link) {
  return {
    code: link.code,
    shortUrl: `${config.baseUrl}/${link.code}`,
    targetUrl: link.target_url,
    clickCount: link.click_count,
    createdAt: new Date(Number(link.created_at)).toISOString(),
    expiresAt: link.expires_at ? new Date(Number(link.expires_at)).toISOString() : null,
  };
}

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });

  const { url, customCode, expiresAt } = parsed.data;
  if (customCode && RESERVED.has(customCode.toLowerCase())) {
    return res.status(400).json({ error: 'That code is reserved' });
  }
  const expires = expiresAt ? new Date(expiresAt).getTime() : null;
  if (expires !== null && expires <= Date.now()) {
    return res.status(400).json({ error: 'expiresAt must be in the future' });
  }

  // Random codes can collide (rarely), so retry a few times. Custom codes get one try.
  const attempts = customCode ? 1 : 5;
  for (let i = 0; i < attempts; i++) {
    const code = customCode || randomCode();
    try {
      await db('links').insert({
        user_id: req.user.id,
        code,
        target_url: url,
        created_at: Date.now(),
        expires_at: expires,
      });
      const link = await db('links').where({ code }).first();
      return res.status(201).json(toDto(link));
    } catch (err) {
      const duplicate = /UNIQUE|Duplicate/i.test(err.message);
      if (!duplicate) throw err;
      if (customCode) return res.status(409).json({ error: 'That code is already taken' });
    }
  }
  res.status(500).json({ error: 'Could not generate a unique code, try again' });
});

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const [{ total }] = await db('links').where({ user_id: req.user.id }).count({ total: '*' });
  const rows = await db('links')
    .where({ user_id: req.user.id })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ page, limit, total: Number(total), items: rows.map(toDto) });
});

async function findOwned(req, res) {
  const link = await db('links').where({ code: req.params.code, user_id: req.user.id }).first();
  if (!link) res.status(404).json({ error: 'Link not found' });
  return link;
}

router.get('/:code/stats', async (req, res) => {
  const link = await findOwned(req, res);
  if (!link) return;

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const clicks = await db('clicks').where({ link_id: link.id }).andWhere('clicked_at', '>=', since).select('clicked_at', 'referrer');

  const byDay = {};
  const byReferrer = {};
  for (const c of clicks) {
    const day = new Date(Number(c.clicked_at)).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
    const ref = c.referrer || 'direct';
    byReferrer[ref] = (byReferrer[ref] || 0) + 1;
  }

  res.json({ ...toDto(link), last30Days: { byDay, byReferrer } });
});

router.delete('/:code', async (req, res) => {
  const link = await findOwned(req, res);
  if (!link) return;
  await db('links').where({ id: link.id }).del();
  res.status(204).end();
});

module.exports = router;
