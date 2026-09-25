import { placeById } from "./places.mjs";
import { chooseWear, dateInTimeZone, presentWarning, shiftDate } from "./logic.mjs";

const BUCKETS = {
  morning: { start: 6, end: 11 },
  afternoon: { start: 12, end: 17 },
  night: { start: 18, end: 23 },
};

const DAY_OFFSETS = { yesterday: -1, today: 0, tomorrow: 1 };
const CACHE_TTL_MS = 30 * 60 * 1000;

function weatherInfo(code, isNight) {
  const map = {
    0: { day: "☀️", night: "🌙", condition: "Sunny", nightCondition: "Clear", severity: 0 },
    1: { day: "🌤️", night: "🌙", condition: "Mostly sunny", nightCondition: "Mostly clear", severity: 1 },
    2: { day: "⛅", night: "☁️", condition: "Partly cloudy", severity: 2 },
    3: { day: "☁️", night: "☁️", condition: "Cloudy", severity: 3 },
    45: { day: "🌫️", night: "🌫️", condition: "Foggy", severity: 4 },
    48: { day: "🌫️", night: "🌫️", condition: "Foggy", severity: 4 },
    51: { day: "🌦️", night: "🌧️", condition: "Light drizzle", severity: 5 },
    53: { day: "🌦️", night: "🌧️", condition: "Drizzle", severity: 6 },
    55: { day: "🌧️", night: "🌧️", condition: "Heavy drizzle", severity: 7 },
    56: { day: "🌧️", night: "🌧️", condition: "Freezing drizzle", severity: 7 },
    57: { day: "🌧️", night: "🌧️", condition: "Freezing drizzle", severity: 8 },
    61: { day: "🌦️", night: "🌧️", condition: "Light rain", severity: 9 },
    63: { day: "🌧️", night: "🌧️", condition: "Rain", severity: 10 },
    65: { day: "🌧️", night: "🌧️", condition: "Heavy rain", severity: 11 },
    66: { day: "🌧️", night: "🌧️", condition: "Freezing rain", severity: 11 },
    67: { day: "🌧️", night: "🌧️", condition: "Freezing rain", severity: 12 },
    71: { day: "🌨️", night: "🌨️", condition: "Light snow", severity: 9 },
    73: { day: "🌨️", night: "🌨️", condition: "Snow", severity: 10 },
    75: { day: "❄️", night: "❄️", condition: "Heavy snow", severity: 11 },
    77: { day: "🌨️", night: "🌨️", condition: "Snow grains", severity: 9 },
    80: { day: "🌦️", night: "🌧️", condition: "Light showers", severity: 9 },
    81: { day: "🌧️", night: "🌧️", condition: "Showers", severity: 10 },
    82: { day: "⛈️", night: "⛈️", condition: "Heavy showers", severity: 12 },
    85: { day: "🌨️", night: "🌨️", condition: "Snow showers", severity: 10 },
    86: { day: "❄️", night: "❄️", condition: "Heavy snow showers", severity: 11 },
    95: { day: "⛈️", night: "⛈️", condition: "Thunderstorms", severity: 13 },
    96: { day: "⛈️", night: "⛈️", condition: "Thunderstorms with hail", severity: 14 },
    99: { day: "⛈️", night: "⛈️", condition: "Thunderstorms with hail", severity: 15 },
  };
  const info = map[code] || { day: "❓", night: "❓", condition: "Unknown", severity: -1 };
  const emoji = isNight ? info.night : info.day;
  let condition = info.condition;
  if (isNight && info.nightCondition) condition = info.nightCondition;
  return { emoji, condition, severity: info.severity };
}

function tempWord(c) {
  if (c < 2) return "freezing";
  if (c < 8) return "cold";
  if (c < 14) return "chilly";
  if (c < 19) return "mild";
  if (c < 25) return "warm";
  return "hot";
}

function prettyDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

function getDayParam() {
  const param = new URLSearchParams(window.location.search).get("day");
  if (param === "yesterday" || param === "tomorrow" || param === "today") return param;
  return "today";
}

function getPlace() {
  const param = new URLSearchParams(window.location.search).get("location");
  if (!param) return placeById("cobham");
  return placeById(param);
}

function townFromGeocode(result) {
  if (result.bua) {
    const town = result.bua.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (town) return town;
  }
  if (typeof result.ced === "string" && result.ced.trim()) return result.ced.trim();
  if (result.parish && !/unparished/i.test(result.parish)) {
    const town = result.parish.replace(/,.*$/, "").trim();
    if (town) return town;
  }
  if (result.admin_district) return result.admin_district;
  return null;
}

async function geocodePostcode(postcode) {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();
  if (!data.result || typeof data.result.latitude !== "number") {
    throw new Error("Geocode returned no coordinates");
  }
  return {
    lat: data.result.latitude,
    lon: data.result.longitude,
    town: townFromGeocode(data.result),
    country: "GB",
  };
}

async function geocodePlace(place) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place.query)}` +
    `&count=10&language=en&format=json&countryCode=${encodeURIComponent(place.country)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();
  const results = (data.results || []).filter((item) => item.country_code === place.country);
  results.sort((a, b) => (b.population || 0) - (a.population || 0));
  const hit = results[0];
  if (!hit || typeof hit.latitude !== "number" || typeof hit.longitude !== "number") {
    throw new Error("Geocode returned no coordinates");
  }
  if (!hit.timezone) throw new Error("Geocode returned no timezone");
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    town: hit.name,
    country: hit.country_code,
    timezone: hit.timezone,
  };
}

async function locate(place) {
  if (place.postcode) return geocodePostcode(place.postcode);
  return geocodePlace(place);
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,uv_index` +
    `&past_days=1&forecast_days=2&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data.hourly || !Array.isArray(data.hourly.time) || !data.timezone) {
    throw new Error("Weather returned no hourly data");
  }
  return { hourly: data.hourly, timezone: data.timezone };
}

async function fetchWarnings(loc, dates) {
  const params = new URLSearchParams({
    lat: String(loc.lat),
    lon: String(loc.lon),
    country: loc.country,
    timezone: loc.timezone,
    dates: dates.join(","),
  });
  const res = await fetch(`/api/warnings?${params}`);
  if (!res.ok) throw new Error(`Warnings failed: ${res.status}`);
  const data = await res.json();
  if (!data || typeof data.checked !== "boolean") throw new Error("Warnings returned nothing");
  return data;
}

function indexHourly(hourly) {
  const index = {};
  const { time, temperature_2m, weather_code, precipitation_probability, uv_index } = hourly;
  for (let i = 0; i < time.length; i++) {
    index[time[i]] = {
      temp: temperature_2m[i],
      code: weather_code[i],
      pop: precipitation_probability ? precipitation_probability[i] : null,
      uv: uv_index ? uv_index[i] : null,
    };
  }
  return index;
}

function bucketSummary(index, ymd, bucket, isNight) {
  const temps = [];
  let worst = null;
  for (let h = bucket.start; h <= bucket.end; h++) {
    const key = `${ymd}T${String(h).padStart(2, "0")}:00`;
    const entry = index[key];
    if (!entry) continue;
    if (typeof entry.temp === "number") temps.push(entry.temp);
    const info = weatherInfo(entry.code, isNight);
    if (!worst || info.severity > worst.severity) {
      worst = { ...info, code: entry.code };
    }
  }
  if (temps.length === 0 || !worst) return null;
  const avg = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
  return { temp: avg, emoji: worst.emoji, condition: worst.condition };
}

function collectHours(index, ymd, buckets) {
  const temps = [];
  const codes = [];
  const pops = [];
  const uvs = [];
  for (const bucket of buckets) {
    for (let h = bucket.start; h <= bucket.end; h++) {
      const entry = index[`${ymd}T${String(h).padStart(2, "0")}:00`];
      if (!entry) continue;
      temps.push(entry.temp);
      codes.push(entry.code);
      pops.push(entry.pop);
      uvs.push(entry.uv);
    }
  }
  return { temps, codes, pops, uvs };
}

function wearSamples(index, ymd) {
  const day = collectHours(index, ymd, [BUCKETS.morning, BUCKETS.afternoon]);
  const all = collectHours(index, ymd, [BUCKETS.morning, BUCKETS.afternoon, BUCKETS.night]);
  return { ...day, wetCodes: all.codes, wetPops: all.pops };
}

function renderColumn(id, summary) {
  const col = document.getElementById(id);
  const icon = col.querySelector('[data-role="icon"]');
  const temp = col.querySelector('[data-role="temp"]');
  const phrase = col.querySelector('[data-role="phrase"]');
  if (!summary) {
    icon.textContent = "—";
    temp.textContent = "";
    phrase.textContent = "No data";
    return;
  }
  icon.textContent = summary.emoji;
  temp.textContent = `${summary.temp}°C`;
  phrase.textContent = `${summary.condition} and ${tempWord(summary.temp)}`;
}

function setWarning(tone, symbol, text) {
  const el = document.getElementById("warning-corner");
  if (!el) return;
  el.className = `corner corner-warning warning-tone-${tone}`;
  el.querySelector(".warning-symbol").textContent = symbol;
  el.querySelector(".warning-text").textContent = text;
}

function renderWarning(result, ymd) {
  if (!result || result.checked !== true || !result.byDate || !result.byDate[ymd]) {
    setWarning("unknown", "❓", "Can't check warning");
    return;
  }
  const day = result.byDate[ymd];
  if (!day.checked) {
    setWarning("unknown", "❓", "Can't check warning");
    return;
  }
  const warning = (day.warnings || [])[0];
  if (!warning) {
    setWarning("none", "✅", "No weather warning");
    return;
  }
  const view = presentWarning(warning);
  setWarning(view.tone, view.symbol, view.text);
}

function renderWear(samples) {
  const row = document.getElementById("wear-row");
  if (!row) return;
  row.replaceChildren();
  const items = samples ? chooseWear(samples) : null;
  if (!items) {
    const item = document.createElement("div");
    item.className = "wear-item";
    const symbol = document.createElement("span");
    symbol.className = "wear-symbol";
    symbol.textContent = "❓";
    const label = document.createElement("span");
    label.className = "wear-label";
    label.textContent = "Clothes";
    item.append(symbol, label);
    row.append(item);
    return;
  }
  for (const wear of items) {
    const item = document.createElement("div");
    item.className = "wear-item";
    const symbol = document.createElement("span");
    symbol.className = "wear-symbol";
    symbol.textContent = wear.symbol;
    const label = document.createElement("span");
    label.className = "wear-label";
    label.textContent = wear.label;
    item.append(symbol, label);
    row.append(item);
  }
}

function markCurrentLink(day) {
  document.querySelectorAll(".day-links a").forEach((a) => {
    const linkDay = new URLSearchParams(a.search).get("day");
    a.classList.toggle("current", linkDay === day);
  });
}

function showError() {
  document.querySelector(".app").classList.add("error");
}

function suppressHoverUrl(links) {
  links.forEach((a) => {
    const url = a.getAttribute("href");
    if (!url) return;
    a.dataset.href = url;
    const strip = () => a.removeAttribute("href");
    const restore = () => {
      if (a.dataset.href) a.setAttribute("href", a.dataset.href);
    };
    a.addEventListener("pointerenter", strip);
    a.addEventListener("mouseenter", strip);
    a.addEventListener("pointerleave", restore);
    a.addEventListener("mouseleave", restore);
    a.addEventListener("blur", restore);
    a.addEventListener("click", (e) => {
      if (!a.getAttribute("href")) {
        e.preventDefault();
        window.location.href = a.dataset.href;
      }
    });
  });
}

function cacheKey(placeId) {
  return `teni-weather:${placeId}`;
}

function readCache(placeId) {
  try {
    const raw = localStorage.getItem(cacheKey(placeId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(placeId, payload) {
  try {
    localStorage.setItem(cacheKey(placeId), JSON.stringify(payload));
  } catch (e) {
    /* storage unavailable - fall back to live fetches */
  }
}

function hasDate(hourly, ymd) {
  return !!hourly && Array.isArray(hourly.time) && hourly.time.some((t) => t.startsWith(ymd));
}

function cacheIsFresh(cached) {
  return !!cached && typeof cached.ts === "number" && Date.now() - cached.ts < CACHE_TTL_MS;
}

async function refresh(place, existing) {
  let located = existing;
  if (!existing || typeof existing.lat !== "number" || !existing.country) {
    located = await locate(place);
  }
  const weather = await fetchWeather(located.lat, located.lon);
  const timezone = weather.timezone || located.timezone;
  if (!timezone) throw new Error("Weather returned no timezone");
  const today = dateInTimeZone(timezone);
  const dates = [shiftDate(today, -1), today, shiftDate(today, 1)];
  const loc = {
    lat: located.lat,
    lon: located.lon,
    town: located.town,
    country: located.country,
    timezone,
  };
  let warnings = null;
  try {
    warnings = await fetchWarnings(loc, dates);
  } catch (err) {
    console.error(err);
    warnings = { checked: false, byDate: null };
  }
  const payload = { ts: Date.now(), ...loc, hourly: weather.hourly, warnings };
  writeCache(place.id, payload);
  return payload;
}

function renderPlace(payload, targetDate) {
  const locationEl = document.getElementById("day-location");
  if (payload.town) {
    locationEl.textContent = payload.town;
    locationEl.hidden = false;
  } else {
    locationEl.hidden = true;
  }
  const index = indexHourly(payload.hourly);
  renderColumn("col-morning", bucketSummary(index, targetDate, BUCKETS.morning, false));
  renderColumn("col-afternoon", bucketSummary(index, targetDate, BUCKETS.afternoon, false));
  renderColumn("col-night", bucketSummary(index, targetDate, BUCKETS.night, true));
  renderWear(wearSamples(index, targetDate));
  renderWarning(payload.warnings, targetDate);
  document.querySelector(".app").classList.remove("error");
}

async function main() {
  const place = getPlace();
  const day = getDayParam();
  document.getElementById("day-title").textContent = day.charAt(0).toUpperCase() + day.slice(1);
  markCurrentLink(day);
  suppressHoverUrl(document.querySelectorAll(".day-links a"));

  if (!place) {
    document.getElementById("day-date").textContent = "";
    setWarning("unknown", "❓", "Can't check warning");
    showError();
    return;
  }

  const cached = readCache(place.id);
  let shownFromCache = false;
  if (cached && cached.timezone && cached.hourly) {
    const today = dateInTimeZone(cached.timezone);
    const targetDate = shiftDate(today, DAY_OFFSETS[day]);
    if (hasDate(cached.hourly, targetDate)) {
      document.getElementById("day-date").textContent = prettyDate(targetDate);
      renderPlace(cached, targetDate);
      shownFromCache = true;
      if (cacheIsFresh(cached) && cached.warnings) return;
    }
  }

  try {
    const payload = await refresh(place, shownFromCache ? cached : null);
    const today = dateInTimeZone(payload.timezone);
    const targetDate = shiftDate(today, DAY_OFFSETS[day]);
    document.getElementById("day-date").textContent = prettyDate(targetDate);
    renderPlace(payload, targetDate);
  } catch (err) {
    console.error(err);
    if (!shownFromCache) {
      setWarning("unknown", "❓", "Can't check warning");
      showError();
    }
  }
}

if (document.getElementById("col-morning")) {
  main();
} else {
  suppressHoverUrl(document.querySelectorAll(".place-links a"));
}
