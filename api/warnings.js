import { getWarnings } from "../warnings.mjs";

export default async function handler(req, res) {
  const query = req.query || {};
  try {
    const dates = String(query.dates || "")
      .split(",")
      .filter(Boolean);
    const result = await getWarnings({
      lat: Number(query.lat),
      lon: Number(query.lon),
      country: query.country || "",
      timezone: query.timezone || "",
      dates,
    });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(200).json({ checked: false, byDate: null });
  }
}
