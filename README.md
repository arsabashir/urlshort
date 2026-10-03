# urlshort

A URL shortener REST API: JWT auth, per-link click analytics, link expiry, rate-limited auth endpoints, Docker setup, automated tests and CI.
**Live demo:** https://urlshort-upc6.onrender.com/health

**Stack:** Node.js, Express 5, Knex, MySQL or PostgreSQL (production) / SQLite (local + tests), Zod validation, Jest + Supertest, Docker, GitHub Actions.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:3000 (uses SQLite)
npm test
```

## Run with Docker (MySQL)

```bash
docker compose up --build
```

## Deploy on Render (free)

1. Push the repo to GitHub.
2. Render dashboard: New > Blueprint > pick this repo. `render.yaml` creates the web service and a Postgres database.
3. When prompted for `BASE_URL`, enter your service URL (for example `https://urlshort.onrender.com`).

Free-tier caveats: the service sleeps after about 15 minutes idle (first request takes ~1 minute) and free Postgres databases expire after 30 days.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create account `{email, password}` |
| POST | `/api/auth/login` | no | Returns `{token}` (JWT, 7 days) |
| POST | `/api/links` | yes | Create short link `{url, customCode?, expiresAt?}` |
| GET | `/api/links?page=1&limit=20` | yes | List your links (paginated) |
| GET | `/api/links/:code/stats` | yes | Total clicks, last-30-day clicks by day and referrer |
| DELETE | `/api/links/:code` | yes | Delete a link |
| GET | `/:code` | no | 302 redirect (404 unknown, 410 expired) |
| GET | `/health` | no | Health check |

```bash
curl -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"password123"}'
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"password123"}' | jq -r .token)
curl -X POST localhost:3000/api/links -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"url":"https://github.com"}'
```

## Design decisions

- **Short codes:** 7 random base62 characters (~3.5 trillion combinations). Collisions are caught by the unique index and retried.
- **Ownership checks:** stats and delete return 404 (not 403) for other users' links, so link existence isn't leaked.
- **Login errors:** the same message for unknown email and wrong password, so accounts can't be enumerated.
- **Timestamps:** stored as epoch milliseconds so the same code runs on SQLite and MySQL.
- **Click logging** is awaited inside the redirect for simplicity. At scale it would move to a queue so redirects stay fast.

## Roadmap

- [ ] Redis cache for hot redirects
- [ ] Knex migrations instead of `ensureSchema`
- [ ] React dashboard for link stats
- [ ] Deploy (Render) with a live demo link
