/**
 * Tiny static server for the platformer demo.
 *
 * Serves this folder plus the built SDK bundle at /opencontrol.js.
 * Listens on 0.0.0.0 so phones on the same network can reach it —
 * open the printed LAN URL on your desktop so the QR code works.
 *
 *   node server.mjs [port]
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SDK_BUNDLE_DIR = path.resolve(ROOT, "../sdk/dist");
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // The SDK bundle lives outside this folder — map it in explicitly.
  let filePath;
  if (pathname === "/opencontrol.js" || pathname === "/opencontrol.js.map") {
    filePath = path.join(SDK_BUNDLE_DIR, path.basename(pathname));
  } else {
    filePath = path.join(ROOT, pathname);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    if (pathname === "/opencontrol.js") {
      res.writeHead(404, { "Content-Type": "text/javascript" });
      res.end('document.body.innerHTML = "<h1 style=\\"font-family:sans-serif;color:#fff\\">SDK not built. Run: cd sdk && npm install && npm run build</h1>";');
      return;
    }
    res.writeHead(404).end("Not found");
  }
});

function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

server.listen(PORT, "0.0.0.0", async () => {
  const lan = lanAddress();
  console.log("\nOpenControl Platformer");
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lan) {
    console.log(`  Network: http://${lan}:${PORT}  ← open THIS one so phones can scan the QR code`);
  } else {
    console.log("  (No LAN address found — phones may not be able to connect.)");
  }
  try {
    await fs.access(path.join(SDK_BUNDLE_DIR, "opencontrol.js"));
  } catch {
    console.warn("\n  ⚠ SDK bundle missing. Run: cd ../sdk && npm install && npm run build");
  }
  console.log();
});
