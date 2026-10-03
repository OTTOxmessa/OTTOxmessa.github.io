## The problem

The [billing app](/projects/billing-system/) stored everything in the browser: one device, one person. Two staff issuing invoices at the same time would get the same number, and losing the laptop meant losing the books.

This backend makes the same app **work across devices and across a team**, while keeping every amount exact to the satang and making "tap twice, get paid twice" impossible.

**Try it:** open the [app](/tools/billing/) → "Go online" → "Try instantly" for a demo account with 5 months of sample data (deleted after 24 hours), or browse the [API docs](https://otto-api-14oc.onrender.com/docs).

## Architecture

```
Web app (static Next.js on GitHub Pages)
   │  HTTPS + Bearer token  (cross-origin → CORS allows github.io only)
   ▼
Fastify 5 on Render ── Zod validates every request/response → OpenAPI /docs
   │  Drizzle ORM + postgres.js
   ▼
PostgreSQL (Neon) ── constraints as a second line of defence
```

- **The money logic is the same package the web app uses** (`@portfolio/tools/billing`) — the browser computes a preview, the server computes what gets stored, so the two always agree
- Money is stored as **integer satang**, never floats
- **Multi-tenant**: every route lives under `/orgs/:orgId` with owner / staff / viewer roles — outsiders get a 404 and can't even tell the business exists
- 38 endpoints, 12 tables, drizzle-kit migrations applied automatically on deploy

## Hard parts

**1. Gap-free, duplicate-free numbers** — a counter row per business × type × month, bumped with `INSERT … ON CONFLICT DO UPDATE SET last = last + 1 RETURNING` in one statement; the row stays locked until commit. A test fires 30 creates at once and gets `-001` to `-030`, nothing missing, nothing repeated.

**2. Double or over-payment** — the invoice row is locked with `SELECT … FOR UPDATE`, so concurrent payments queue up and each sees the latest balance. A test fires 20 concurrent payments at an invoice that can only take 10: exactly 10 succeed.

**3. Retries after a dropped connection** — payments require an `Idempotency-Key`; the key, a hash of the request and the response are stored in the same transaction as the work. A retry gets the original result (no second receipt); reusing a key for a different amount is a 422. The web client only mints a new key when the request body changes.

**4. Two people editing one document** — optimistic locking with a `version` column; a stale version gets a 409 instead of a silent overwrite.

**5. Sign-in across domains without cookies** — the site is on github.io and the API on onrender.com, so it uses short-lived access tokens (15-minute JWT) plus refresh tokens that **rotate on every use**, stored hashed. Reusing an old one (a sign of theft) revokes the whole family. In practice two open tabs refreshing at once logged people out, so I added a 20-second grace window and made the client refresh single-flight and share the result through storage.

## Testing

- **44 API tests against a real PostgreSQL**, locally and in GitHub Actions via a service container — no database mocks, because the bugs that matter live in transactions and locks
- 10 tests for the web client: auto-refresh, one refresh for many concurrent 401s, another tab already refreshed, revoked sessions
- A browser end-to-end run: demo account → quote → convert to invoice → partial payment → overpayment refused → survives reload → signing out in one tab signs out the other

## Deployment

GitHub Actions runs lint, typecheck, tests (with Postgres) and builds on every push. Render builds from `render.yaml` and redeploys when `apps/api` or `packages` change; Neon hosts the database. `/health` checks the real database connection and doubles as the "wake-up" call the web app makes while showing a waiting state on the free tier.

A deploy surprise: Neon's connection string includes `channel_binding=require`, which the driver rejects, crashing the server at boot. Fixed by normalising the URL before connecting, and by validating every env variable at start-up with a clear message about what's wrong.

## Known limits

- Tokens live in localStorage — readable if the site ever had an XSS hole (the price of working cross-domain without cookies), mitigated by short lifetimes and reuse detection
- Free tier: the server sleeps when idle (~1 minute first request) and the database is in a different region from the server
- No email password reset yet, and members can only be added if they already have an account
