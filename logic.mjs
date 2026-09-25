// Pure helpers shared by the page and the warning service. No weather values
// are stored here; callers pass numbers that came from a forecast.

const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const SUN_CODES = new Set([0, 1]);

const WARNING_COPY = {
  wind: { symbol: "💨", name: "wind warning" },
  rain: { symbol: "🌧️", name: "rain warning" },
  storm: { symbol: "⛈️", name: "storm warning" },
  flood: { symbol: "🌊", name: "flood warning" },
  snow: { symbol: "❄️", name: "snow warning" },
  ice: { symbol: "🧊", name: "ice warning" },
  heat: { symbol: "🥵", name: "heat warning" },
  cold: { symbol: "🥶", name: "cold warning" },
  fog: { symbol: "🌫️", name: "fog warning" },
  fire: { symbol: "🔥", name: "fire warning" },
  avalanche: { symbol: "⛰️", name: "avalanche warning" },
  other: { symbol: "⚠️", name: "weather warning" },
};

const LEVEL_RANK = { yellow: 1, amber: 2, red: 3 };
const KIND_RANK = {
  storm: 0,
  flood: 1,
  fire: 2,
  avalanche: 3,
  wind: 4,
  snow: 5,
  ice: 6,
  heat: 7,
  cold: 8,
  rain: 9,
  fog: 10,
  other: 11,
};

export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Even-odd across every ring, so holes in a GeoJSON polygon count.
export function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    if (ring && ring.length >= 3 && pointInRing(lon, lat, ring)) inside = !inside;
  }
  return inside;
}

export function pointInGeo(lon, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInRings(lon, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((rings) => pointInRings(lon, lat, rings));
  }
  return false;
}

// CAP polygons are "lat,lon lat,lon" (latitude first), one ring per string.
export function ringsFromCapPolygon(value) {
  const parts = Array.isArray(value) ? value : [value];
  const rings = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const ring = [];
    for (const token of part.trim().split(/\s+/)) {
      if (!token) continue;
      const bits = token.split(",");
      const lat = Number(bits[0]);
      const lon = Number(bits[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) ring.push([lon, lat]);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function tzParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
}

// Midnight at the start of ymd in timeZone, as a UTC Date.
export function startOfZonedDay(ymd, timeZone) {
  const [y, m, d] = ymd.split("-").map(Number);
  let utc = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const offset = tzParts(new Date(utc), timeZone) - utc;
    utc = Date.UTC(y, m - 1, d, 0, 0, 0) - offset;
  }
  return new Date(utc);
}

export function shiftDate(ymd, offset) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + offset);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function dateInTimeZone(timeZone, now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now);
}

// True when [onset, expires) overlaps the local calendar day.
export function overlapsDay(onsetISO, expiresISO, ymd, timeZone) {
  const start = startOfZonedDay(ymd, timeZone);
  const end = startOfZonedDay(shiftDate(ymd, 1), timeZone);
  const onset = onsetISO ? new Date(onsetISO) : null;
  const expires = expiresISO ? new Date(expiresISO) : null;
  if (onset && Number.isNaN(onset.getTime())) return false;
  if (expires && Number.isNaN(expires.getTime())) return false;
  const from = onset || new Date(0);
  const to = expires || new Date(8.64e15);
  return from < end && to > start;
}

function normName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/\s+e\s+/g, "-")
    .trim();
}

// MeteoAlarm sometimes names a region that NUTS has split or spelled differently.
// These are labels for the same boundaries, not weather.
const REGION_ALIASES = {
  "trentino alto adige": [
    "provincia autonoma di trento",
    "provincia autonoma di bolzano/bozen",
  ],
  "trentino-alto adige": [
    "provincia autonoma di trento",
    "provincia autonoma di bolzano/bozen",
  ],
};

// nuts: { byName: Map<string, region[]>, regions: {id, geometry}[] }
// region.geometry is GeoJSON. Returns "hit" | "miss" | "unknown".
function regionsForName(nuts, desc) {
  const full = normName(desc || "");
  if (!full) return null;
  if (nuts.byName.has(full)) return nuts.byName.get(full);
  const aliases = REGION_ALIASES[full];
  if (!aliases) return null;
  const regions = [];
  for (const alias of aliases) {
    const found = nuts.byName.get(normName(alias));
    if (found) regions.push(...found);
  }
  return regions.length ? regions : null;
}

export function matchAreaToNuts(desc, codes, nuts, lon, lat) {
  if (!nuts) return "unknown";
  const named = regionsForName(nuts, desc);
  if (named) {
    return named.some((region) => pointInGeo(lon, lat, region.geometry)) ? "hit" : "miss";
  }
  let codeMatched = false;
  for (const code of codes || []) {
    const region = nuts.regions.find((item) => item.id === code);
    if (!region) continue;
    codeMatched = true;
    if (pointInGeo(lon, lat, region.geometry)) return "hit";
  }
  if (codeMatched) return "miss";
  if (desc && desc.includes(",")) {
    const tokens = desc.split(",").map(normName).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((token) => nuts.byName.has(token))) {
      const hit = tokens.some((token) =>
        nuts.byName.get(token).some((region) => pointInGeo(lon, lat, region.geometry))
      );
      return hit ? "hit" : "miss";
    }
  }
  return "unknown";
}

export function indexNuts(geojson, cntrCode) {
  const byName = new Map();
  const regions = [];
  for (const feature of geojson.features || []) {
    const props = feature.properties || {};
    if (props.CNTR_CODE !== cntrCode) continue;
    const region = { id: props.NUTS_ID, geometry: feature.geometry };
    regions.push(region);
    const names = [props.NUTS_NAME, props.NAME_LATN];
    for (const name of names) {
      if (!name) continue;
      const key = normName(name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(region);
    }
  }
  return { byName, regions };
}

// One parsed warning: { level, kind, onset, expires, areas: [{ desc, codes, rings }] }
// Returns "hit" | "miss" | "unknown".
export function locateWarning(warning, lon, lat, nuts) {
  let anyGeom = false;
  let geomHit = false;
  let nameHit = false;
  let nameMiss = false;
  let unknown = false;
  let pointHit = false;
  for (const area of warning.areas || []) {
    // The upstream feed already limited this alert to the queried point.
    if (area.point) {
      pointHit = true;
      continue;
    }
    const rings = area.rings || [];
    if (rings.length) {
      anyGeom = true;
      if (rings.some((ring) => pointInRing(lon, lat, ring))) geomHit = true;
      continue;
    }
    const result = matchAreaToNuts(area.desc, area.codes, nuts, lon, lat);
    if (result === "hit") nameHit = true;
    else if (result === "miss") nameMiss = true;
    else unknown = true;
  }
  if (pointHit || geomHit || nameHit) return "hit";
  if (anyGeom && !unknown && !nameHit) return "miss";
  if (unknown) return "unknown";
  if (nameMiss) return "miss";
  return "unknown";
}

export function bestWarning(warnings) {
  if (!warnings.length) return null;
  return [...warnings].sort((a, b) => {
    const level = (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0);
    if (level) return level;
    return (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99);
  })[0];
}

// For one local day: { state: "clear" } | { state: "warning", warning } | { state: "unknown" }
export function judgeDay(warnings, ymd, timeZone, lon, lat, nuts) {
  const hits = [];
  let unknown = false;
  for (const warning of warnings) {
    if (!overlapsDay(warning.onset, warning.expires, ymd, timeZone)) continue;
    const where = locateWarning(warning, lon, lat, nuts);
    if (where === "hit") hits.push(warning);
    else if (where === "unknown") unknown = true;
  }
  const best = bestWarning(hits);
  if (best) return { state: "warning", warning: best };
  if (unknown) return { state: "unknown" };
  return { state: "clear" };
}

export function presentWarning(warning) {
  const copy = WARNING_COPY[warning.kind] || WARNING_COPY.other;
  const levelWord = warning.level === "red" ? "Red" : warning.level === "amber" ? "Amber" : "Yellow";
  return {
    tone: warning.level,
    symbol: copy.symbol,
    text: `${levelWord} ${copy.name}`,
  };
}

function numbers(list) {
  return (list || []).filter((n) => typeof n === "number" && !Number.isNaN(n));
}

// Up to 3 things to wear or bring, from real daytime temperatures and codes.
// Returns null when there is nothing to judge.
export function chooseWear({ temps, codes, pops, uvs, wetCodes, wetPops }) {
  const t = numbers(temps);
  const c = numbers(codes);
  if (!t.length || !c.length) return null;
  const avg = t.reduce((a, b) => a + b, 0) / t.length;
  const max = Math.max(...t);
  const min = Math.min(...t);
  const dayPop = numbers(pops);
  const anyPop = numbers(wetPops || pops);
  const anyCodes = numbers(wetCodes || codes);
  const uv = numbers(uvs);
  const dayWet = c.some((code) => WET_CODES.has(code)) || dayPop.some((p) => p >= 50);
  const wet = anyCodes.some((code) => WET_CODES.has(code)) || anyPop.some((p) => p >= 50);
  const snow = anyCodes.some((code) => SNOW_CODES.has(code)) || c.some((code) => SNOW_CODES.has(code));
  const sunny = c.some((code) => SUN_CODES.has(code));
  const maxUv = uv.reduce((m, v) => Math.max(m, v), 0);
  const bright = (sunny || maxUv >= 5) && !dayWet && !snow;

  const items = [];
  if (wet && !snow) items.push({ symbol: "☔", label: "Umbrella" });
  if (min < 10 || snow) items.push({ symbol: "🧥", label: "Coat" });
  if (max >= 25) items.push({ symbol: "🪭", label: "Fan" });
  if (bright && max >= 16) items.push({ symbol: "🕶️", label: "Sunglasses" });
  if (bright && max >= 20) items.push({ symbol: "👒", label: "Hat" });
  if ((min < 5 || snow) && items.length < 3) items.push({ symbol: "🧤", label: "Gloves" });
  else if (min < 8 && items.length < 3) items.push({ symbol: "🧢", label: "Hat" });

  const picked = items.slice(0, 3);
  if (!picked.length) picked.push({ symbol: "👕", label: "Usual clothes" });
  return picked;
}
