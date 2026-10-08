// Local preview: serves /site and runs the scanner at /api/scan.
// Usage: node scripts/dev-server.mjs   → http://localhost:8888
// (Netlify Forms only work once deployed; locally the forms show their fallback message.)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import scan from "../netlify/functions/scan.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "site");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json" };
const port = Number(process.env.PORT || 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/scan") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await scan(new Request("http://localhost/api/scan", { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), { ip: req.socket.remoteAddress });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  if (req.method === "POST") { res.writeHead(404); return res.end("Netlify Forms are only available when deployed"); }
  let p = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404, { "content-type": types[".html"] }); return res.end(fs.readFileSync(path.join(root, "404.html"))); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log("Preview on http://localhost:" + port));
