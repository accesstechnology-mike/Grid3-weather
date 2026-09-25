import { indexNuts, judgeDay, ringsFromCapPolygon, pointInGeo } from "./logic.mjs";

const UA = "TeniWeather/1.0 (educational weather display)";

// ISO country → MeteoAlarm feed slug. Only countries this feed actually publishes.
const METEOALARM = {
  GB: "united-kingdom",
  IS: "iceland",
  NO: "norway",
  IT: "italy",
  FR: "france",
  NL: "netherlands",
  ES: "spain",
  DE: "germany",
  GR: "greece",
  PT: "portugal",
  AT: "austria",
  IE: "ireland",
  BE: "belgium",
  DK: "denmark",
  SE: "sweden",
  FI: "finland",
  PL: "poland",
  CH: "switzerland",
  HR: "croatia",
};

// NUTS 2024 uses EL for Greece and does not cover the UK.
const NUTS_CNTR = { GR: "EL" };
const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_10M_2024_4326_LEVL_2.geojson";

const FEED_TTL_MS = 10 * 60 * 1000;
const feedCache = new Map();
let nutsPromise = null;

const TYPE_BY_CODE = {
  1: "wind",
  2: "snow",
  3: "storm",
  4: "fog",
  5: "heat",
  6: "cold",
  7: "flood",
  8: "fire",
  9: "avalanche",
  10: "rain",
  12: "flood",
  13: "flood",
};

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

function param(info, name) {
  const found = (info.parameter || []).find((item) => item.valueName === name);
  return found ? String(found.value) : "";
}

function levelFromAwareness(value) {
  const code = Number(String(value).split(";")[0].trim());
  if (code === 2) return "yellow";
  if (code === 3) return "amber";
  if (code >= 4) return "red";
  return null;
}

function kindFromType(value, text) {
  const code = Number(String(value).split(";")[0].trim());
  let kind = TYPE_BY_CODE[code] || kindFromText(text);
  const s = `${value} ${text || ""}`.toLowerCase();
  if (kind === "snow" && /ice|glaze|freez/.test(s) && !/snow/.test(s)) kind = "ice";
  return kind;
}

function kindFromText(text) {
  const s = String(text || "").toLowerCase();
  if (/tornado|thunder|hurricane|typhoon|cyclone/.test(s)) return "storm";
  if (/flood|tsunami|surge|coastal/.test(s)) return "flood";
  if (/avalanche/.test(s)) return "avalanche";
  if (/wild ?fire|forest fire|bushfire/.test(s)) return "fire";
  if (/snow|blizzard/.test(s)) return "snow";
  if (/ice|glaze|freez|frost/.test(s)) return "ice";
  if (/heat|high temperature|hot weather/.test(s)) return "heat";
  if (/cold|low temperature/.test(s)) return "cold";
  if (/wind|gale|gust/.test(s)) return "wind";
  if (/fog/.test(s)) return "fog";
  if (/rain|shower|precip/.test(s)) return "rain";
  return "other";
}

function englishInfo(alert) {
  const infos = alert.info || [];
  return (
    infos.find((info) => String(info.language || "").toLowerCase().startsWith("en")) ||
    infos[0] ||
    null
  );
}

function isCleared(alert, info) {
  const msg = String(alert.msgType || "");
  const status = String(alert.status || "Actual");
  if (msg === "Cancel" || status === "Test" || status === "Exercise" || status === "Draft") {
    return true;
  }
  const response = info.responseType || [];
  return response.some((item) => /allclear|all clear/i.test(String(item)));
}

export function parseMeteoAlarm(payload) {
  const warnings = [];
  for (const item of payload.warnings || []) {
    const alert = item.alert || item;
    const info = englishInfo(alert);
    if (!info || isCleared(alert, info)) continue;
    const level = levelFromAwareness(param(info, "awareness_level"));
    if (!level) continue;
    const text = `${info.event || ""} ${info.headline || ""}`;
    const kind = kindFromType(param(info, "awareness_type"), text);
    const areas = (info.area || []).map((area) => ({
      desc: area.areaDesc || "",
      codes: (area.geocode || []).map((code) => code.value).filter(Boolean),
      rings: ringsFromCapPolygon(area.polygon),
    }));
    warnings.push({
      level,
      kind,
      onset: info.onset || info.effective || null,
      expires: info.expires || null,
      areas,
    });
  }
  return warnings;
}

function nwsLevel(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "extreme" || s === "severe") return "red";
  if (s === "moderate") return "amber";
  if (s === "minor") return "yellow";
  return null;
}

export function parseNws(payload) {
  const warnings = [];
  for (const feature of payload.features || []) {
    const props = feature.properties || {};
    if (String(props.status || "") !== "Actual") continue;
    if (String(props.messageType || "") === "Cancel") continue;
    const event = String(props.event || "");
    if (/statement|test/i.test(event)) continue;
    const level = nwsLevel(props.severity);
    if (!level) continue;
    warnings.push({
      level,
      kind: kindFromText(event),
      onset: props.onset || null,
      expires: props.ends || props.expires || null,
      areas: [{ desc: "", codes: [], rings: [] , point: true }],
    });
  }
  return warnings;
}

function canadaLevel(colour, alertType) {
  const c = String(colour || "").toLowerCase();
  if (c === "red") return "red";
  if (c === "orange" || c === "amber") return "amber";
  if (c === "yellow") return "yellow";
  const t = String(alertType || "").toLowerCase();
  if (t === "warning") return "red";
  if (t === "watch") return "amber";
  if (t === "advisory") return "yellow";
  return null;
}

export function parseCanada(payload, lon, lat) {
  const warnings = [];
  for (const feature of payload.features || []) {
    const props = feature.properties || {};
    const status = String(props.status_en || "");
    if (/end|cancel|expir/i.test(status)) continue;
    const level = canadaLevel(props.risk_colour_en, props.alert_type);
    if (!level) continue;
    const geometry = feature.geometry;
    const named = kindFromText(props.alert_name_en || props.alert_type);
    const timing = {
      level,
      kind: named,
      onset: props.validity_datetime || props.publication_datetime || null,
      expires: props.event_end_datetime || props.expiration_datetime || null,
    };
    if (!geometry) {
      warnings.push({ ...timing, areas: [{ desc: "", codes: [], rings: [] }] });
      continue;
    }
    if (!pointInGeo(lon, lat, geometry)) continue;
    warnings.push({ ...timing, areas: [{ desc: "", codes: [], rings: [], point: true }] });
  }
  return warnings;
}

async function cachedFeed(slug) {
  const hit = feedCache.get(slug);
  if (hit && Date.now() - hit.ts < FEED_TTL_MS) return hit.data;
  const data = await fetchJson(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`);
  feedCache.set(slug, { ts: Date.now(), data });
  return data;
}

async function loadNuts() {
  if (!nutsPromise) {
    nutsPromise = fetchJson(NUTS_URL).catch((err) => {
      nutsPromise = null;
      throw err;
    });
  }
  return nutsPromise;
}

function needsNuts(warnings) {
  return warnings.some((warning) =>
    (warning.areas || []).some((area) => !(area.rings && area.rings.length) && !area.point)
  );
}

async function warningsForCountry(country, lat, lon) {
  if (country === "US") {
    const data = await fetchJson(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`
    );
    return { warnings: parseNws(data), nuts: null };
  }
  if (country === "CA") {
    const bbox = [lon - 0.4, lat - 0.4, lon + 0.4, lat + 0.4].map((n) => n.toFixed(4)).join(",");
    const data = await fetchJson(
      `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=100&bbox=${bbox}`
    );
    return { warnings: parseCanada(data, lon, lat), nuts: null };
  }
  const slug = METEOALARM[country];
  if (!slug) return null;
  const parsed = parseMeteoAlarm(await cachedFeed(slug));
  let nuts = null;
  if (needsNuts(parsed)) {
    const cntr = NUTS_CNTR[country] || country;
    nuts = indexNuts(await loadNuts(), cntr);
  }
  return { warnings: parsed, nuts };
}

function packDay(judged) {
  if (judged.state === "unknown") return { checked: false, warnings: [] };
  if (judged.state === "clear") return { checked: true, warnings: [] };
  const warning = judged.warning;
  return { checked: true, warnings: [{ level: warning.level, kind: warning.kind }] };
}

export async function getWarnings({ lat, lon, country, timezone, dates }) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Bad latitude");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Bad longitude");
  const iso = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) throw new Error("Bad country");
  if (!timezone || typeof timezone !== "string" || timezone.length > 64) throw new Error("Bad timezone");
  const days = (dates || []).slice(0, 5);
  if (!days.length || days.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day))) {
    throw new Error("Bad dates");
  }
  // Validate the timezone before trusting it. Intl throws on an unknown zone.
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

  const loaded = await warningsForCountry(iso, lat, lon);
  if (!loaded) return { checked: false, byDate: null };

  const byDate = {};
  for (const day of days) {
    const judged = judgeDay(loaded.warnings, day, timezone, lon, lat, loaded.nuts);
    byDate[day] = packDay(judged);
  }
  return { checked: true, byDate };
}
