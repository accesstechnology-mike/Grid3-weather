"use strict";

// The one configured input (the spec): Teni's postcode. Lat/long are never
// hardcoded - they are geocoded live from this value.
const POSTCODE = "KT11 2JW";

const BUCKETS = {
  morning: { start: 6, end: 11 },
  afternoon: { start: 12, end: 17 },
  night: { start: 18, end: 23 },
};

// WMO weather code -> emoji + plain condition. `isNight` swaps sun for moon
// on clear/mainly-clear conditions. severity is used to pick the most
// significant condition within a time bucket.
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

// Today's calendar date in Teni's timezone as YYYY-MM-DD.
function londonToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function shiftDate(ymd, offset) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + offset);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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

const DAY_OFFSETS = { yesterday: -1, today: 0, tomorrow: 1 };

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

async function geocode(postcode) {
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
  };
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,weather_code&past_days=1&forecast_days=2&timezone=Europe%2FLondon`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error("Weather returned no hourly data");
  }
  return data.hourly;
}

// Build { "YYYY-MM-DDTHH": {temp, code} } lookup from the hourly arrays.
function indexHourly(hourly) {
  const index = {};
  const { time, temperature_2m, weather_code } = hourly;
  for (let i = 0; i < time.length; i++) {
    index[time[i]] = { temp: temperature_2m[i], code: weather_code[i] };
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

function markCurrentLink(day) {
  document.querySelectorAll(".day-links a").forEach((a) => {
    const linkDay = new URLSearchParams(a.search).get("day");
    a.classList.toggle("current", linkDay === day);
  });
}

function showError() {
  document.querySelector(".app").classList.add("error");
}

// Hide the browser's hover URL preview (shown in Grid 3's web cell and in
// desktop browsers) without breaking the links Grid reads. The real href is in
// the static markup and is present at load (when Grid harvests the links). It is
// only stripped while the pointer is over/dwelling on a link, so no status bar
// appears, then restored on leave. Activation navigates via JS using the stored
// URL, so dwell-clicks still work even while the href is stripped.
function suppressHoverUrl() {
  document.querySelectorAll(".day-links a").forEach((a) => {
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

async function main() {
  const day = getDayParam();
  const today = londonToday();
  const targetDate = shiftDate(today, DAY_OFFSETS[day]);

  document.getElementById("day-title").textContent =
    day.charAt(0).toUpperCase() + day.slice(1);
  document.getElementById("day-date").textContent = prettyDate(targetDate);
  markCurrentLink(day);
  suppressHoverUrl();

  try {
    const { lat, lon, town } = await geocode(POSTCODE);
    const locationEl = document.getElementById("day-location");
    if (town) {
      locationEl.textContent = town;
    } else {
      locationEl.hidden = true;
    }
    const hourly = await fetchWeather(lat, lon);
    const index = indexHourly(hourly);

    renderColumn("col-morning", bucketSummary(index, targetDate, BUCKETS.morning, false));
    renderColumn("col-afternoon", bucketSummary(index, targetDate, BUCKETS.afternoon, false));
    renderColumn("col-night", bucketSummary(index, targetDate, BUCKETS.night, true));
  } catch (err) {
    console.error(err);
    showError();
  }
}

main();
