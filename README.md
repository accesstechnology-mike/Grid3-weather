# Teni's Weather

A small, landscape weather page for Teni to talk about the weather in Grid 3.

It shows the weather for **Morning / Afternoon / Night** in three columns, for a chosen day, with three links underneath to switch between **Yesterday / Today / Tomorrow**.

A warning sits at the **top left**. What to wear or bring (up to three pictures) sits at the **top right**. The three weather columns stay in the middle.

## How it works

- Default place: Cobham, postcode `KT11 2JW`, geocoded live via [postcodes.io](https://postcodes.io). Other places are geocoded live via [Open-Meteo](https://open-meteo.com/en/docs/geocoding-api). Latitude and longitude are never stored in the app.
- Forecast: [Open-Meteo](https://open-meteo.com) (keyless), hourly temperature, weather code, rain chance and UV, `past_days=1` and `forecast_days=2`, `timezone=auto` so each place uses its own local day.
- Warnings come from the national service for that country: [MeteoAlarm](https://feeds.meteoalarm.org/) in Europe (matched to the place with the warning polygon, or with [Eurostat NUTS](https://gisco-services.ec.europa.eu/distribution/v2/nuts/) regions when the warning names a region), [api.weather.gov](https://www.weather.gov/documentation/services-web-api) in the United States, and [Environment Canada](https://api.weather.gc.ca/) in Canada. Green "no awareness" notices are not shown as warnings.
- If a check cannot be done, the page says **Can't check warning**. It does not say there is no warning unless the feed really has none for that place.
- No weather numbers are ever invented. If a fetch fails, the page says weather is unavailable.

## What to bring

Pictures and words, from the morning and afternoon forecast, at most three:

- Umbrella when rain is forecast
- Coat, hat or gloves when it is cold or snowy
- Fan, sunglasses and a sun hat when it is hot or bright
- Usual clothes when nothing extra is needed

## Grid 3 integration

Grid 3 scrapes the page for links and surfaces them in its own interface.

- The weather page is `index.html`. The day is `?day=yesterday`, `?day=today` (default) or `?day=tomorrow`. The place is `?location=cobham` (default) and so on.
- The three day links are the only links on the weather page. They keep the current place.
- The place list is a separate page, `locations.html`, so Grid can open it on its own. Cobham is the first link. Each link reloads the weather page for that place.

## Time buckets

- Morning: 06:00–11:59
- Afternoon: 12:00–17:59
- Night: 18:00–23:59

Each column shows a weather icon, the average temperature for that part of the day (whole degrees C), and a short plain-English phrase (e.g. "Sunny and warm").

## Files

- `index.html` – weather page, warning, what to bring, and the three day links.
- `locations.html` – place links for Grid 3.
- `style.css` – landscape layout that scales to fit a small window without scrolling.
- `app.js` – geocode, fetch, and render.
- `places.mjs` – the place list (names and countries only).
- `warnings.mjs` / `api/warnings.js` – warning lookup. `server.mjs` serves the site and that API locally.

## Running locally

Warnings are loaded from `/api/warnings`, so use the small server (not a plain static server):

```bash
node server.mjs
```

Then open `http://127.0.0.1:8765/index.html` and `http://127.0.0.1:8765/locations.html`.

```bash
npm test
```

## Deployment

Deploy on Vercel. There is no build command. `api/warnings.js` is the warning function; everything else is static.
