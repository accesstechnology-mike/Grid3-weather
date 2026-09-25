import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { getWarnings } from "./warnings.mjs";

const port = Number(process.env.PORT) || 8765;
const root = path.dirname(new URL(import.meta.url).pathname);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/warnings") {
    try {
      const result = await getWarnings({
        lat: Number(url.searchParams.get("lat")),
        lon: Number(url.searchParams.get("lon")),
        country: url.searchParams.get("country") || "",
        timezone: url.searchParams.get("timezone") || "",
        dates: (url.searchParams.get("dates") || "").split(",").filter(Boolean),
      });
      sendJson(res, 200, result);
    } catch (err) {
      console.error(err);
      sendJson(res, 200, { checked: false, byDate: null });
    }
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Teni's Weather at http://127.0.0.1:${port}/`);
});
