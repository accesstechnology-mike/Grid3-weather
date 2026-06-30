# Teni's Weather

A small, landscape weather page for Teni to talk about the weather in Grid 3.

It shows the weather for **Morning / Afternoon / Night** in three columns, for a chosen day, with three links underneath to switch between **Yesterday / Today / Tomorrow**.

## How it works

- Location: postcode `KT11 2JW`, geocoded live via [postcodes.io](https://postcodes.io) (latitude/longitude are never hardcoded).
- Forecast: [Open-Meteo](https://open-meteo.com) (keyless), hourly temperature + weather codes, `past_days=1` and `forecast_days=2` so yesterday, today and tomorrow are all covered.
- All times use the `Europe/London` timezone.
- No data is ever faked. If a fetch fails, the page shows a clear "Weather unavailable" message rather than placeholder numbers.

## Grid 3 integration

Grid 3 scrapes the page for links and surfaces them in its own interface. So:

- The day is driven by a URL query parameter: `?day=yesterday`, `?day=today` (default), `?day=tomorrow`.
- The three day links are real static `<a href>` anchors that are present on every page, regardless of which day is shown, and they are the only links on the page.

## Time buckets

- Morning: 06:00–11:59
- Afternoon: 12:00–17:59
- Night: 18:00–23:59

Each column shows a weather icon, the average temperature for that part of the day (whole degrees C), and a short plain-English phrase (e.g. "Sunny and warm").

## Files

- `index.html` – markup, the three static day links, and the three-column skeleton.
- `style.css` – responsive landscape layout that scales to fit any small window without scrolling.
- `app.js` – geocode, fetch, bucket the hourly data, and render.

## Running locally

It is a static site with no build step. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/index.html`.

## Deployment

Deploy as a static site (e.g. link this repo to Vercel). There is no build command and no framework; the output is the repository root.
