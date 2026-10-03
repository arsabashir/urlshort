const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');

const router = express.Router();

const credentials = z.object({
  email: z.string().email().max(255).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(72), // bcrypt only uses the first 72 bytes
});

function signToken(user) {
  return jwt.sign({ email: user.email }, config.jwtSecret, { subject: String(user.id), expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });

  const { email, password } = parsed.data;
  const existing = await db('users').where({ email }).first();
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  await db('users').insert({ email, password_hash, created_at: Date.now() });
  const user = await db('users').where({ email }).first();
  res.status(201).json({ id: user.id, email: user.email });
});

router.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { email, password } = parsed.data;
  const user = await db('users').where({ email }).first();
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  // Same message for unknown email and wrong password, so accounts can't be enumerated
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: signToken(user) });
});

module.exports = router;
