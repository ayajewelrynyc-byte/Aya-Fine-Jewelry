import crypto from "node:crypto";

function safeCompare(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function verifyAppProxySignature(query, secret) {
  if (!secret) return { ok: true, skipped: true };
  const provided = String(query.signature || "");
  if (!provided) return { ok: false, reason: "missing_signature" };
  const message = Object.keys(query)
    .filter((key) => key !== "signature")
    .sort()
    .map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(",") : query[key]}`)
    .join("");
  const calculated = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return { ok: safeCompare(calculated, provided), skipped: false };
}

export function validateShopifyProxy(query, configuredShopDomain) {
  const result = verifyAppProxySignature(query, process.env.SHOPIFY_APP_PROXY_SECRET);
  if (!result.ok) return result;
  if (configuredShopDomain) {
    const expected = configuredShopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
    const incoming = String(query.shop || "").toLowerCase();
    if (incoming && incoming !== expected) return { ok: false, reason: "shop_not_allowed" };
  }
  return { ok: true, skipped: result.skipped };
}
