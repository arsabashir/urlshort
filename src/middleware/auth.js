const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(payload.sub), email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
