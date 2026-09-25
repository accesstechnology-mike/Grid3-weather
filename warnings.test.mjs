import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  chooseWear,
  indexNuts,
  judgeDay,
  matchAreaToNuts,
  overlapsDay,
  pointInRing,
  presentWarning,
  shiftDate,
} from "./logic.mjs";
import { parseCanada, parseMeteoAlarm, parseNws } from "./warnings.mjs";
import { PLACES } from "./places.mjs";

const SQUARE = [
  [0, 0],
  [0, 2],
  [2, 2],
  [2, 0],
  [0, 0],
];

test("point in ring", () => {
  assert.equal(pointInRing(1, 1, SQUARE), true);
  assert.equal(pointInRing(3, 1, SQUARE), false);
  assert.equal(pointInRing(0.01, 0.01, SQUARE), true);
});

test("a warning overlaps only the local days it covers", () => {
  const onset = "2026-09-25T14:00:00-04:00";
  const expires = "2026-09-27T06:00:00-04:00";
  assert.equal(overlapsDay(onset, expires, "2026-09-24", "America/New_York"), false);
  assert.equal(overlapsDay(onset, expires, "2026-09-25", "America/New_York"), true);
  assert.equal(overlapsDay(onset, expires, "2026-09-26", "America/New_York"), true);
  assert.equal(overlapsDay(onset, expires, "2026-09-27", "America/New_York"), true);
  assert.equal(overlapsDay(onset, expires, "2026-09-28", "America/New_York"), false);
});

test("shiftDate moves calendar days", () => {
  assert.equal(shiftDate("2026-09-25", -1), "2026-09-24");
  assert.equal(shiftDate("2026-09-25", 1), "2026-09-26");
});

test("named region warnings miss a point in a different region", () => {
  const nuts = indexNuts({
    features: [
      {
        properties: { CNTR_CODE: "IT", NUTS_ID: "ITI4", NUTS_NAME: "Lazio", NAME_LATN: "Lazio" },
        geometry: { type: "Polygon", coordinates: [[[11, 41], [11, 43], [14, 43], [14, 41], [11, 41]]] },
      },
      {
        properties: { CNTR_CODE: "IT", NUTS_ID: "ITF6", NUTS_NAME: "Calabria", NAME_LATN: "Calabria" },
        geometry: { type: "Polygon", coordinates: [[[15, 38], [15, 40], [17, 40], [17, 38], [15, 38]]] },
      },
      {
        properties: { CNTR_CODE: "IT", NUTS_ID: "ITH5", NUTS_NAME: "Emilia-Romagna", NAME_LATN: "Emilia-Romagna" },
        geometry: { type: "Polygon", coordinates: [[[9, 43.5], [9, 45], [13, 45], [13, 43.5], [9, 43.5]]] },
      },
      {
        properties: { CNTR_CODE: "IT", NUTS_ID: "ITH2", NUTS_NAME: "Provincia Autonoma di Trento", NAME_LATN: "Provincia Autonoma di Trento" },
        geometry: { type: "Polygon", coordinates: [[[10, 45.5], [10, 46.5], [12, 46.5], [12, 45.5], [10, 45.5]]] },
      },
      {
        properties: { CNTR_CODE: "IT", NUTS_ID: "ITH1", NUTS_NAME: "Provincia Autonoma di Bolzano/Bozen", NAME_LATN: "Provincia Autonoma di Bolzano/Bozen" },
        geometry: { type: "Polygon", coordinates: [[[10, 46.5], [10, 47.1], [12.5, 47.1], [12.5, 46.5], [10, 46.5]]] },
      },
    ],
  }, "IT");
  const rome = [12.5, 41.9];
  assert.equal(matchAreaToNuts("Calabria", ["IT001"], nuts, rome[0], rome[1]), "miss");
  assert.equal(matchAreaToNuts("Lazio", [], nuts, rome[0], rome[1]), "hit");
  assert.equal(matchAreaToNuts("Emilia e Romagna", [], nuts, rome[0], rome[1]), "miss");
  assert.equal(matchAreaToNuts("Trentino Alto Adige", [], nuts, rome[0], rome[1]), "miss");
  assert.equal(matchAreaToNuts("Trentino Alto Adige", [], nuts, 11, 46), "hit");
  const day = judgeDay(
    [{
      level: "yellow",
      kind: "wind",
      onset: "2026-09-25T00:00:00Z",
      expires: "2026-09-26T00:00:00Z",
      areas: [{ desc: "Calabria", codes: ["IT001"], rings: [] }],
    }],
    "2026-09-25",
    "Europe/Rome",
    rome[0],
    rome[1],
    nuts
  );
  assert.equal(day.state, "clear");
});

test("polygon warnings use the polygon, not the region name", () => {
  const day = judgeDay(
    [{
      level: "yellow",
      kind: "wind",
      onset: "2026-09-25T06:00:00Z",
      expires: "2026-09-25T18:00:00Z",
      areas: [{ desc: "Somewhere", codes: [], rings: [SQUARE] }],
    }],
    "2026-09-25",
    "UTC",
    1,
    1,
    null
  );
  assert.equal(day.state, "warning");
  assert.equal(day.warning.kind, "wind");
  const outside = judgeDay(
    [{
      level: "yellow",
      kind: "wind",
      onset: "2026-09-25T06:00:00Z",
      expires: "2026-09-25T18:00:00Z",
      areas: [{ desc: "Somewhere", codes: [], rings: [SQUARE] }],
    }],
    "2026-09-25",
    "UTC",
    5,
    5,
    null
  );
  assert.equal(dayOutside(outside), "clear");
});

function dayOutside(day) {
  return day.state;
}

test("an unplaced warning is not reported as clear", () => {
  const day = judgeDay(
    [{
      level: "amber",
      kind: "rain",
      onset: "2026-09-25T00:00:00Z",
      expires: "2026-09-26T00:00:00Z",
      areas: [{ desc: "Custom zone", codes: ["ES999"], rings: [] }],
    }],
    "2026-09-25",
    "Europe/Madrid",
    -3.7,
    40.4,
    indexNuts({ features: [] }, "ES")
  );
  assert.equal(day.state, "unknown");
});

test("green meteoalarm notices are not warnings", () => {
  const parsed = parseMeteoAlarm({
    warnings: [{
      alert: {
        status: "Actual",
        msgType: "Alert",
        info: [{
          language: "en-GB",
          event: "Green Thunderstorm Warning",
          onset: "2026-09-25T00:00:00Z",
          expires: "2026-09-26T00:00:00Z",
          parameter: [
            { valueName: "awareness_level", value: "1; green; Minor" },
            { valueName: "awareness_type", value: "3; Thunderstorm" },
          ],
          area: [{ areaDesc: "Lazio", geocode: [] }],
        }],
      },
    }],
  });
  assert.equal(parsed.length, 0);
});

test("meteoalarm keeps a yellow wind warning and its polygon", () => {
  const parsed = parseMeteoAlarm({
    warnings: [{
      alert: {
        status: "Actual",
        msgType: "Alert",
        info: [{
          language: "en-GB",
          event: "Wind",
          onset: "2026-09-25T08:00:00Z",
          expires: "2026-09-25T16:00:00Z",
          parameter: [
            { valueName: "awareness_level", value: "2; yellow; Moderate" },
            { valueName: "awareness_type", value: "1; Wind" },
          ],
          area: [{ areaDesc: "Coast", polygon: ["70.0,20.0 71.0,20.0 71.0,22.0 70.0,22.0 70.0,20.0"] }],
        }],
      },
    }],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].level, "yellow");
  assert.equal(parsed[0].kind, "wind");
  assert.equal(parsed[0].areas[0].rings.length, 1);
  assert.equal(parsed[0].areas[0].rings[0][0][0], 20);
  assert.equal(parsed[0].areas[0].rings[0][0][1], 70);
});

test("nws advisories become one ranked warning and skip statements", () => {
  const parsed = parseNws({
    features: [
      {
        properties: {
          status: "Actual",
          messageType: "Update",
          event: "Coastal Flood Advisory",
          severity: "Minor",
          onset: "2026-09-25T18:00:00-04:00",
          ends: "2026-09-27T18:00:00-04:00",
        },
      },
      {
        properties: {
          status: "Actual",
          messageType: "Update",
          event: "Wind Advisory",
          severity: "Moderate",
          onset: "2026-09-25T14:00:00-04:00",
          ends: "2026-09-27T06:00:00-04:00",
        },
      },
      {
        properties: {
          status: "Actual",
          event: "Special Weather Statement",
          severity: "Minor",
          onset: "2026-09-25T12:00:00-04:00",
          ends: "2026-09-25T20:00:00-04:00",
        },
      },
    ],
  });
  assert.equal(parsed.length, 2);
  const day = judgeDay(parsed, "2026-09-25", "America/New_York", -74, 40.7, null);
  assert.equal(day.state, "warning");
  assert.equal(day.warning.kind, "wind");
  assert.equal(day.warning.level, "amber");
  const view = presentWarning(day.warning);
  assert.equal(view.text, "Amber wind warning");
  assert.equal(view.symbol, "💨");
  assert.equal(view.tone, "amber");
});

test("ended canadian alerts are dropped and geometry is required", () => {
  const parsed = parseCanada({
    features: [
      {
        geometry: { type: "Polygon", coordinates: [[[-80, 43], [-80, 44], [-79, 44], [-79, 43], [-80, 43]]] },
        properties: {
          status_en: "ended",
          risk_colour_en: "yellow",
          alert_type: "advisory",
          alert_name_en: "frost advisory",
          event_end_datetime: "2026-09-25T14:00:00Z",
        },
      },
      {
        geometry: { type: "Polygon", coordinates: [[[-80, 43], [-80, 44], [-79, 44], [-79, 43], [-80, 43]]] },
        properties: {
          status_en: "active",
          risk_colour_en: "orange",
          alert_type: "warning",
          alert_name_en: "rainfall warning",
          validity_datetime: "2026-09-25T10:00:00Z",
          event_end_datetime: "2026-09-25T22:00:00Z",
        },
      },
    ],
  }, -79.4, 43.7);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].kind, "rain");
  assert.equal(parsed[0].level, "amber");
  const outside = parseCanada({
    features: [{
      geometry: { type: "Polygon", coordinates: [[[-80, 43], [-80, 44], [-79, 44], [-79, 43], [-80, 43]]] },
      properties: {
        status_en: "active",
        risk_colour_en: "red",
        alert_type: "warning",
        alert_name_en: "rainfall warning",
      },
    }],
  }, -100, 43.7);
  assert.equal(outside.length, 0);
});

test("what to bring follows the daytime weather", () => {
  const hot = chooseWear({ temps: [28, 31, 30], codes: [0, 1, 0], pops: [0, 5, 0], uvs: [7, 8, 6] });
  assert.deepEqual(hot.map((item) => item.label), ["Fan", "Sunglasses", "Hat"]);
  const wet = chooseWear({ temps: [8, 9, 7], codes: [61, 63, 3], pops: [80, 70, 40], uvs: [1, 1, 1] });
  assert.deepEqual(wet.map((item) => item.label), ["Umbrella", "Coat", "Hat"]);
  const usual = chooseWear({ temps: [16, 17, 18], codes: [3, 2, 3], pops: [10, 10, 10], uvs: [2, 2, 2] });
  assert.deepEqual(usual.map((item) => item.label), ["Usual clothes"]);
  const hotAfternoon = chooseWear({ temps: [21, 22, 27], codes: [1, 0, 0], pops: [0, 0, 0], uvs: [3, 6, 7] });
  assert.deepEqual(hotAfternoon.map((item) => item.label), ["Fan", "Sunglasses", "Hat"]);
  const nightRain = chooseWear({
    temps: [18, 19],
    codes: [3, 3],
    pops: [10, 10],
    uvs: [1, 1],
    wetCodes: [3, 3, 61],
    wetPops: [10, 10, 70],
  });
  assert.deepEqual(nightRain.map((item) => item.label), ["Umbrella"]);
  assert.equal(chooseWear({ temps: [], codes: [0], pops: [], uvs: [] }), null);
});

test("the place list matches the location page, with Cobham first", () => {
  const html = fs.readFileSync(new URL("./locations.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/location=([a-z0-9-]+)/g)].map((match) => match[1]);
  assert.deepEqual(ids, PLACES.map((place) => place.id));
  assert.equal(ids[0], "cobham");
  assert.equal(ids.length, 10);
  const index = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const dayLinks = [...index.matchAll(/<a href="[^"]*">/g)].map((match) => match[0]);
  assert.equal(dayLinks.length, 3);
});
