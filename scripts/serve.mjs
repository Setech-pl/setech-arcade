// Serves the built site (dist/) at http://localhost:8080/setech-arcade/ -
// the same path prefix as GitHub Pages, so relative links are tested as
// they will run there.
//   npm run serve [-- --port 8080] [-- --dir dist]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
export const BASE = "/setech-arcade/";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml",
  ".atr": "application/octet-stream", ".tgz": "application/gzip", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".c": "text/plain; charset=utf-8", ".sh": "text/plain; charset=utf-8",
};

export function serveDist({ dir = path.join(root, "dist"), port = 8080 } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") { res.writeHead(302, { location: BASE }).end(); return; }
    if (!url.pathname.startsWith(BASE)) { res.writeHead(404).end("not found"); return; }
    let file = path.join(dir, decodeURIComponent(url.pathname.slice(BASE.length)));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.pathname.endsWith("/")) { res.writeHead(301, { location: `${url.pathname}/` }).end(); return; }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(arg("port", 8080));
  const dir = path.resolve(arg("dir", path.join(root, "dist")));
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    console.error(`${dir} has no index.html: run npm run build first`);
    process.exit(1);
  }
  await serveDist({ dir, port });
  console.log(`Setech Arcade: http://localhost:${port}${BASE}`);
}
