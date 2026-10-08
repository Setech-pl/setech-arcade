// Static file server for the prototypes (repo root, http://localhost:8765/).
//   node spike/scripts/serve.mjs [port]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.argv[2] ?? 8765);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png", ".css": "text/css",
  ".atr": "application/octet-stream", ".rom": "application/octet-stream", ".svg": "image/svg+xml",
  ".glsl": "text/plain", ".txt": "text/plain", ".ttf": "font/ttf", ".woff2": "font/woff2",
};
export function serve(listenPort = port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(listenPort, () => resolve(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log(`serving ${root} on http://localhost:${port}/`);
}
