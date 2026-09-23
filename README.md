# AYA Fine Jewelry — Nivoda B2C Backend

Server-side gateway for the custom AYA Fine Jewelry diamond finder.

## Routes

- `GET /health`
- `POST /api/nivoda-b2c`
- `GET /api/nivoda-b2c/diamond/:id`

## Install

Node.js 20+

```bash
npm install
cp .env.example .env
npm start
```

## Environment variables

Set Nivoda credentials in `.env` or your host's secret manager:

```text
NIVODA_API_URL=https://integrations.nivoda.net/api/diamonds
NIVODA_USERNAME=...
NIVODA_PASSWORD=...
```

If Nivoda has issued a valid session token directly, the server can also use:

```text
NIVODA_API_TOKEN=...
NIVODA_API_TOKEN_EXPIRES_AT=...
```

Never expose these values in Shopify Liquid or frontend JavaScript.

## Shopify App Proxy

Create an App Proxy for the Shopify app:

- Prefix: `apps`
- Subpath: `nivoda-b2c`
- Proxy URL: `https://YOUR-BACKEND-DOMAIN/api/nivoda-b2c`

Then the storefront endpoint is:

`https://www.ayafinejewelry.com/apps/nivoda-b2c`

Set `SHOPIFY_APP_PROXY_SECRET` after the app proxy is configured so the backend validates Shopify's HMAC signature. `SHOPIFY_SHOP_DOMAIN` is the optional shop allow-list.

## Test

```bash
curl http://localhost:3000/health
```

Then:

```bash
curl -X POST http://localhost:3000/api/nivoda-b2c \
  -H 'Content-Type: application/json' \
  -d '{"activeTab":"Lab-Grown","queryLabGrown":true,"shape":["ROUND","OVAL"],"caratMin":1,"caratMax":2,"priceMin":0,"priceMax":10000,"color":["D","E","F"],"clarity":["VS1","VS2"],"cut":["EXCELLENT"],"certificate":["IGI"],"sort":"price_asc","limit":20,"offset":0}'
```

## Important Nivoda constraint

Nivoda's current API documentation says API responses are capped at 50 stones per request and recommends allowing a minimum of 30 seconds between API requests. This server therefore uses a cache and throttle. For multi-instance production hosting, use a shared cache/rate limiter.

## Deployment

This is a standard Node/Express service. Deploy it to a Node-compatible host such as Render, Railway, Fly.io, or a VPS, then put the backend URL into the Shopify App Proxy configuration.
