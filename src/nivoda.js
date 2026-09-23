const AUTH_QUERY = `
  query Authenticate($username: String!, $password: String!) {
    authenticate {
      username_and_password(username: $username, password: $password) {
        token
        expires
      }
    }
  }
`;

function graphQlString(value) {
  return JSON.stringify(String(value));
}

function graphQlEnum(value) {
  const s = String(value).trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(s)) throw new Error(`Invalid GraphQL enum: ${s}`);
  return s;
}

function graphQlEnumList(values) {
  return `[${values.map(graphQlEnum).join(", ")}]`;
}

function graphQlNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Invalid numeric GraphQL value.");
  return String(n);
}

function buildDiamondQuery(filters) {
  const parts = [];
  const q = filters.query || {};
  if (typeof q.labgrown === "boolean") parts.push(`labgrown: ${q.labgrown}`);
  if (Array.isArray(q.shapes) && q.shapes.length) parts.push(`shapes: ${graphQlEnumList(q.shapes)}`);
  if (Array.isArray(q.color) && q.color.length) parts.push(`color: ${graphQlEnumList(q.color)}`);
  if (Array.isArray(q.clarity) && q.clarity.length) parts.push(`clarity: ${graphQlEnumList(q.clarity)}`);
  if (Array.isArray(q.cut) && q.cut.length) parts.push(`cut: ${graphQlEnumList(q.cut)}`);
  if (Array.isArray(q.labgrown_certificates) && q.labgrown_certificates.length) {
    parts.push(`labgrown_certificates: ${graphQlEnumList(q.labgrown_certificates)}`);
  }
  if (q.sizes && (q.sizes.from !== undefined || q.sizes.to !== undefined)) {
    const x = [];
    if (q.sizes.from !== undefined) x.push(`from: ${graphQlNumber(q.sizes.from)}`);
    if (q.sizes.to !== undefined) x.push(`to: ${graphQlNumber(q.sizes.to)}`);
    parts.push(`sizes: { ${x.join(", ")} }`);
  }
  if (q.dollar_value && (q.dollar_value.from !== undefined || q.dollar_value.to !== undefined)) {
    const x = [];
    if (q.dollar_value.from !== undefined) x.push(`from: ${graphQlNumber(q.dollar_value.from)}`);
    if (q.dollar_value.to !== undefined) x.push(`to: ${graphQlNumber(q.dollar_value.to)}`);
    parts.push(`dollar_value: { ${x.join(", ")} }`);
  }
  const queryObject = parts.length ? `{ ${parts.join(", ")} }` : `{}`;
  const order = filters.order
    ? `order: { type: ${graphQlEnum(filters.order.type)}, direction: ${graphQlEnum(filters.order.direction)} }`
    : "";
  return `
    query GetDiamondList {
      diamonds_by_query(
        query: ${queryObject},
        offset: ${Math.floor(filters.offset)},
        limit: ${Math.floor(filters.limit)}${order ? `, ${order}` : ""}
      ) {
        items {
          id
          diamond {
            OrderItemId
            id
            video
            image
            v360 { url }
            NivodaStockId
            delivery_time { min_business_days max_business_days }
            certificate {
              id
              carats
              color
              clarity
              symmetry
              lab
              shape
              certNumber
              pdfUrl
              cut
              polish
            }
          }
          price
          discount
          markup_price
          markup_discount
        }
        total_count
      }
    }
  `;
}

const DETAIL_QUERY = `
  query GetDiamondByID($diamond_id: ID!) {
    get_diamond_by_id(diamond_id: $diamond_id) {
      id
      diamond {
        id
        OrderItemId
        v360 { url }
        video
        image
        delivery_time { min_business_days max_business_days }
        certificate {
          id
          lab
          shape
          certNumber
          labgrown
          carats
          color
          clarity
          cut
          polish
          symmetry
          pdfUrl
        }
        NivodaStockId
        final_price
        show_certificate_number
        HoldId
      }
      price
      discount
      markup_price
      markup_discount
    }
  }
`;

const SHAPES = new Set([
  "ASSCHER","BAGUETTE","BRIOLETTE","BULLET","CALF","CUSHION","EMERALD","EUROPEAN_CUT",
  "FLANDERS","HALF_MOON","HEART","HEXAGONAL","KITE","LOZENGE","MARQUISE","OCTAGONAL",
  "OLD_MINER","OTHER","OVAL","PEAR","PENTAGONAL","PRINCESS","RADIANT","ROSE","ROUND",
  "SHIELD","SQUARE_EMERALD","SQUARE_RADIANT","SQUARE","STAR","TAPERED_BAGUETTE","TAPERED_BULLET",
  "TRAPEZOID","TRIANGULAR","TRILLIANT"
]);

const arr = (v) => Array.isArray(v) ? v.filter(x => x !== null && x !== undefined && String(x).trim()) : (v ? [v] : []);
const num = (v) => v === "" || v === null || v === undefined ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined);
const upper = (v) => arr(v).map(x => String(x).trim().toUpperCase());

function normalizeSort(sort) {
  const s = String(sort || "recommended").toLowerCase();
  const m = {
    price_asc: { type: "price", direction: "ASC" },
    price_desc: { type: "price", direction: "DESC" },
    carat_asc: { type: "size", direction: "ASC" },
    carat_desc: { type: "size", direction: "DESC" }
  };
  return m[s] ?? null;
}

export function normalizeFilters(input = {}, maxResults = 50) {
  const tab = String(input.activeTab ?? input.tab ?? "").toLowerCase();
  const labgrown = typeof input.queryLabGrown === "boolean"
    ? input.queryLabGrown
    : tab.includes("lab") ? true : tab.includes("natural") ? false : undefined;

  const q = {};
  if (labgrown !== undefined) q.labgrown = labgrown;

  const shapes = upper(input.shape ?? input.shapes).filter(s => SHAPES.has(s));
  if (shapes.length) q.shapes = shapes;

  const cmin = num(input.caratMin ?? input.carat_from ?? input.minCarat);
  const cmax = num(input.caratMax ?? input.carat_to ?? input.maxCarat);
  if (cmin !== undefined || cmax !== undefined) {
    q.sizes = {};
    if (cmin !== undefined) q.sizes.from = cmin;
    if (cmax !== undefined) q.sizes.to = cmax;
  }

  const pmin = num(input.priceMin ?? input.price_from ?? input.minPrice);
  const pmax = num(input.priceMax ?? input.price_to ?? input.maxPrice);
  if (pmin !== undefined || pmax !== undefined) {
    q.dollar_value = {};
    if (pmin !== undefined) q.dollar_value.from = pmin;
    if (pmax !== undefined) q.dollar_value.to = pmax;
  }

  const colors = upper(input.color ?? input.colors);
  if (colors.length) q.color = colors;
  const clarities = upper(input.clarity ?? input.clarities);
  if (clarities.length) q.clarity = clarities;
  const cuts = upper(input.cut ?? input.cuts);
  if (cuts.length) q.cut = cuts;
  const certificates = upper(input.certificate ?? input.certificates ?? input.lab);
  if (certificates.length) q.labgrown_certificates = certificates;

  return {
    query: Object.keys(q).length ? q : {},
    search: String(input.query ?? input.search ?? "").trim(),
    offset: Math.max(0, Math.floor(num(input.offset) ?? 0)),
    limit: Math.min(Math.max(Math.floor(num(input.limit) ?? 20), 1), Math.min(maxResults, 50)),
    order: normalizeSort(input.sort)
  };
}

async function gql(endpoint, token, query, variables) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`Nivoda returned non-JSON (HTTP ${r.status}).`); }
  if (!r.ok || body.errors?.length) {
    throw new Error(body?.errors?.map(e => e.message).join("; ") || `Nivoda HTTP ${r.status}`);
  }
  return body.data;
}

const toNumber = v => Number.isFinite(Number(v)) ? Number(v) : null;

function normalizeDiamond(item = {}) {
  const d = item.diamond ?? {};
  const c = d.certificate ?? {};
  const del = d.delivery_time ?? {};
  return {
    id: item.id ?? d.id ?? null,
    offerId: d.OrderItemId ?? item.id ?? null,
    stockId: d.NivodaStockId ?? null,
    shape: c.shape ?? null,
    carat: toNumber(c.carats),
    color: c.color ?? null,
    clarity: c.clarity ?? null,
    cut: c.cut ?? null,
    polish: c.polish ?? null,
    symmetry: c.symmetry ?? null,
    lab: c.lab ?? null,
    certNumber: c.certNumber ?? null,
    certificateId: c.id ?? null,
    certificateUrl: c.pdfUrl ?? null,
    image: d.image ?? null,
    video: d.video ?? null,
    v360: d.v360?.url ?? null,
    price: toNumber(item.markup_price ?? item.price ?? d.final_price),
    basePrice: toNumber(item.price),
    discount: toNumber(item.markup_discount ?? item.discount),
    delivery: {
      minBusinessDays: toNumber(del.min_business_days),
      maxBusinessDays: toNumber(del.max_business_days)
    },
    showCertificateNumber: d.show_certificate_number !== false,
    holdId: d.HoldId ?? null
  };
}

function matchesSearch(d, q) {
  if (!q) return true;
  const haystack = [d.shape,d.color,d.clarity,d.cut,d.polish,d.symmetry,d.lab,d.certNumber,d.stockId,d.id]
    .filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export class NivodaClient {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.username = config.username;
    this.password = config.password;
    this.staticToken = config.staticToken;
    this.staticExpires = config.staticTokenExpiresAt ? new Date(config.staticTokenExpiresAt).getTime() : 0;
    this.sessionToken = null;
    this.sessionExpires = 0;
    this.minIntervalMs = config.minIntervalMs;
    this.cacheTtlMs = config.cacheTtlMs;
    this.cache = new Map();
    this.lastRequestAt = 0;
  }

  staticTokenValid() {
    return Boolean(this.staticToken) && (!this.staticExpires || Date.now() < this.staticExpires);
  }

  async throttle() {
    const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  async token() {
    if (this.staticTokenValid()) return this.staticToken;
    if (this.sessionToken && Date.now() < this.sessionExpires) return this.sessionToken;
    if (!this.username || !this.password) throw new Error("Nivoda credentials are not configured.");

    await this.throttle();
    const r = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: AUTH_QUERY, variables: { username: this.username, password: this.password } })
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`Nivoda authentication returned non-JSON (HTTP ${r.status}).`); }
    if (!r.ok || body.errors?.length) throw new Error(body?.errors?.map(e => e.message).join("; ") || `Nivoda authentication failed (HTTP ${r.status}).`);
    const auth = body?.data?.authenticate?.username_and_password;
    if (!auth?.token) throw new Error("Nivoda authentication did not return a token.");
    const expires = auth.expires ? new Date(auth.expires).getTime() : Date.now() + 6*60*60*1000;
    this.sessionToken = auth.token;
    this.sessionExpires = Math.min(expires, Date.now()+6*60*60*1000) - 60_000;
    return this.sessionToken;
  }

  async search(filters) {
    const key = JSON.stringify(filters);
    const hit = this.cache.get(key);
    if (hit && Date.now()-hit.at < this.cacheTtlMs) return { ...hit.value, cached: true };
    if (hit) this.cache.delete(key);

    let token = await this.token();
    await this.throttle();
    let data;
    try {
      data = await gql(this.endpoint, token, buildDiamondQuery(filters), {});
    } catch (e) {
      if (!this.staticTokenValid() && this.sessionToken) {
        this.sessionToken = null; this.sessionExpires = 0;
        token = await this.token();
        await this.throttle();
        data = await gql(this.endpoint, token, buildDiamondQuery(filters), {});
      } else throw e;
    }

    const result = data?.diamonds_by_query;
    if (!result) throw new Error("Nivoda response did not include diamonds_by_query.");
    const value = {
      ok: true,
      total_count: Number(result.total_count ?? 0),
      offset: filters.offset,
      limit: filters.limit,
      items: (result.items ?? []).map(normalizeDiamond).filter(d => matchesSearch(d, filters.search))
    };
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
    return { ...value, cached: false };
  }

  async getDiamond(id) {
    const token = await this.token();
    await this.throttle();
    const data = await gql(this.endpoint, token, DETAIL_QUERY, { diamond_id: id });
    const result = data?.get_diamond_by_id;
    if (!result) throw new Error("Nivoda response did not include get_diamond_by_id.");
    return { ok: true, item: normalizeDiamond(result) };
  }
}
