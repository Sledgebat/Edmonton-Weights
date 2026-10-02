/**
 * Serves the built site (the `out` folder) locally, the way GitHub Pages will:
 *   npm run build && npm run preview   → http://localhost:3000
 * Usage: node scripts/serve-static.mjs <folder> <port>
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** Stream a file; if it vanished (the site is mid-rebuild), say so instead of crashing. */
function send(res, file, status, type) {
  const stream = createReadStream(file);
  stream.on("open", () => res.writeHead(status, { "Content-Type": type }));
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(503, { "Content-Type": TYPES[".txt"] });
    res.end("The site is being rebuilt. Refresh in a few seconds.");
  });
  stream.pipe(res);
}

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(root, url);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let isDir = false;
  try {
    isDir = existsSync(file) && statSync(file).isDirectory();
  } catch {
    /* removed mid-rebuild: treated as missing below */
  }
  if (isDir) {
    if (!url.endsWith("/")) {
      res.writeHead(301, { Location: url + "/" + (req.url?.includes("?") ? "?" + req.url.split("?")[1] : "") }).end();
      return;
    }
    file = path.join(file, "index.html");
  }
  if (!existsSync(file)) {
    send(res, path.join(root, "404.html"), 404, TYPES[".html"]);
    return;
  }
  send(res, file, 200, TYPES[path.extname(file)] ?? "application/octet-stream");
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
