/**
 * Opn-gamedeck — one-origin static server for the whole deck.
 *
 * Serves the console shell at /, the games as cartridges under subpaths, and
 * the SDK IIFE bundle at /opencontrol.js. Listens on 0.0.0.0 so phones on
 * the same network can reach it — open the printed LAN URL on the desktop so
 * the QR code works for phones.
 *
 *   node server.mjs [port]
 *
 * Build first:
 *   cd sdk && npm run build
 *   cd console && npm run build
 *   cd game-racing && npm run build     (the platformer needs no build)
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8080;

/** Mount table, longest prefix first. Everything else falls back to the console. */
const MOUNTS = [
  { prefix: "/opencontrol.js", dir: path.join(ROOT, "sdk/dist"), strip: "/" },
  { prefix: "/platformer/", dir: path.join(ROOT, "game-platformer") },
  { prefix: "/racing/", dir: path.join(ROOT, "game-racing/dist") },
  { prefix: "/", dir: path.join(ROOT, "console/dist") },
];

const REQUIRED = [
  { file: "sdk/dist/opencontrol.js", fix: "cd sdk && npm install && npm run build" },
  { file: "console/dist/index.html", fix: "cd console && npm install && npm run link:sdk && npm run build" },
  { file: "game-racing/dist/index.html", fix: "cd game-racing && npm install && npm run link:sdk && npm run build" },
];

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

function resolveFile(pathname) {
  const mount = MOUNTS.find((m) => pathname.startsWith(m.prefix));
  let rest = pathname.slice((mount.strip ?? mount.prefix).length);
  if (rest === "" || rest.endsWith("/")) rest += "index.html";
  const filePath = path.join(mount.dir, rest);
  return filePath.startsWith(mount.dir) ? filePath : null; // traversal guard
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = resolveFile(decodeURIComponent(url.pathname));
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
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
  console.log("\nOpn-gamedeck");
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lan) {
    console.log(`  Network: http://${lan}:${PORT}  ← open THIS one so phones can scan the QR code`);
  } else {
    console.log("  (No LAN address found — phones may not be able to connect.)");
  }
  for (const { file, fix } of REQUIRED) {
    try {
      await fs.access(path.join(ROOT, file));
    } catch {
      console.warn(`\n  ⚠ ${file} missing. Run: ${fix}`);
    }
  }
  console.log();
});
