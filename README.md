# MotoBingo

Motocross bingo game — Angular frontend on Cloudflare Pages, API on Cloudflare Workers + KV.

## Prerequisites

- Node 22+ (`nvm use 22`)
- Cloudflare account (free tier)
- `wrangler` CLI (`npm i -g wrangler` then `wrangler login`)

## Local Development

```bash
# Frontend (terminal 1)
npm install
npm start
# → http://localhost:4200

# Backend (terminal 2)
cd worker
npm install
npm run dev
# → http://localhost:8787
```

## Deployment

### First-time setup

**1. Create KV namespaces:**
```bash
cd worker
npx wrangler kv namespace create KV --env test
npx wrangler kv namespace create KV --env prod
```
Copy the output IDs into `worker/wrangler.toml` (replace the `REPLACE_WITH_*` placeholders).

**2. Set secrets:**
```bash
npx wrangler secret put ADMIN_PASSWORD --env test
npx wrangler secret put JWT_SECRET --env test
npx wrangler secret put ADMIN_PASSWORD --env prod
npx wrangler secret put JWT_SECRET --env prod
```

**3. Create Pages projects:**
```bash
cd ..
npx wrangler pages project create motobingo-test
npx wrangler pages project create motobingo
```

**4. Update environment files** with your actual URLs:
- `src/environments/environment.test.ts` — test Worker URL
- `src/environments/environment.prod.ts` — prod Worker URL

### Deploying

```bash
# Backend
cd worker
npm run deploy:test    # deploys to motobingo-api-test.*.workers.dev
npm run deploy:prod    # deploys to motobingo-api-prod.*.workers.dev

# Frontend
cd ..
npm run deploy:test    # builds test config, deploys to motobingo-test.pages.dev
npm run deploy:prod    # builds prod config, deploys to motobingo.pages.dev
```

## Environments

| | Local | Test | Prod |
|---|---|---|---|
| Frontend | localhost:4200 | motobingo-test.pages.dev | motobingo.pages.dev |
| Backend | localhost:8787 | motobingo-api-test.*.workers.dev | motobingo-api-prod.*.workers.dev |
| KV | local (wrangler dev) | motobingo-kv-test | motobingo-kv-prod |

## Testing

```bash
ng test                              # unit tests (watch mode)
ng test --watch=false --browsers=ChromeHeadless  # CI-friendly
npx playwright test                  # e2e tests
```
