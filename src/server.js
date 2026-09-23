import "dotenv/config";
import express from "express";
import { normalizeFilters, NivodaClient } from "./nivoda.js";
import { validateShopifyProxy } from "./shopify-proxy.js";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 3000);
const MAX_RESULTS = Math.min(Math.max(Number(process.env.MAX_RESULTS || 50), 1), 50);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);

const client = new NivodaClient({
  endpoint: process.env.NIVODA_API_URL || "https://integrations.nivoda.net/api/diamonds",
  username: process.env.NIVODA_USERNAME,
  password: process.env.NIVODA_PASSWORD,
  staticToken: process.env.NIVODA_API_TOKEN,
  staticTokenExpiresAt: process.env.NIVODA_API_TOKEN_EXPIRES_AT,
  minIntervalMs: Math.max(Number(process.env.NIVODA_MIN_REQUEST_INTERVAL_MS || 30000), 0),
  cacheTtlMs: Math.max(Number(process.env.CACHE_TTL_MS || 25000), 1000)
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ ok: false, error: "Origin not allowed." });
});

app.options("*", (_req, res) => res.status(204).end());
app.get("/health", (_req, res) => res.json({ ok: true, service: "aya-nivoda-b2c", time: new Date().toISOString() }));

function proxyAuth(req, res) {
  const result = validateShopifyProxy(req.query, process.env.SHOPIFY_SHOP_DOMAIN || "www.ayafinejewelry.com");
  if (!result.ok) {
    res.status(401).json({ ok: false, error: "Invalid Shopify App Proxy request." });
    return false;
  }
  return true;
}

app.post("/api/nivoda-b2c", async (req, res) => {
  if (!proxyAuth(req, res)) return;
  try {
    const filters = normalizeFilters(req.body || {}, MAX_RESULTS);
    if (filters.offset > 50000) return res.status(400).json({ ok:false, error:"Offset exceeds Nivoda's documented maximum." });
    const result = await client.search(filters);
    return res.json({
      ...result,
      filters: {
        activeTab: req.body?.activeTab ?? req.body?.tab ?? null,
        query: filters.search,
        queryLabGrown: filters.query.labgrown ?? null,
        shapes: filters.query.shapes ?? [],
        carat: filters.query.sizes ?? null,
        price: filters.query.dollar_value ?? null,
        color: filters.query.color ?? [],
        clarity: filters.query.clarity ?? [],
        cut: filters.query.cut ?? [],
        certificate: filters.query.labgrown_certificates ?? []
      }
    });
  } catch (e) {
    console.error("Nivoda search error:", e);
    const msg = String(e?.message || "");
    const limited = /rate|throttl|too many|30 seconds/i.test(msg);
    return res.status(limited ? 429 : 502).json({
      ok:false,
      error: limited ? "Nivoda rate limit reached. Please wait and try again." : "The diamond search could not be loaded. Please try again."
    });
  }
});

app.get("/api/nivoda-b2c/diamond/:id", async (req, res) => {
  if (!proxyAuth(req, res)) return;
  try {
    const id = String(req.params.id || "").trim();
    if (!id || id.length > 200) return res.status(400).json({ ok:false, error:"Invalid diamond ID." });
    return res.json(await client.getDiamond(id));
  } catch (e) {
    console.error("Nivoda detail error:", e);
    return res.status(502).json({ ok:false, error:"The diamond details could not be loaded." });
  }
});

app.use((_req, res) => res.status(404).json({ ok:false, error:"Route not found." }));
app.listen(PORT, () => console.log(`AYA Nivoda backend listening on port ${PORT}`));
