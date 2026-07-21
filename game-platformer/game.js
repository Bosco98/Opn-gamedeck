/* OpenControl Platformer — host side.
 *
 * Everything network-y comes from the OpenControl SDK (script-tag build).
 * This file is only game logic + rendering, which is the whole point.
 */

/* ---------------------------------------------------------------- */
/* World                                                             */
/* ---------------------------------------------------------------- */

// Virtual world in fixed units; rendered with cover-scaling so the game
// always fills the entire window (no letterboxing, no boxes).
const W = 1600;
const H = 900;

const GRAVITY = 2600;
const MOVE_SPEED = 430;
const RUN_MULTIPLIER = 1.6;
const JUMP_VELOCITY = -1050;
const PLAYER_W = 44;
const PLAYER_H = 58;

const PLATFORMS = [
  { x: 0, y: 830, w: W, h: 70 },          // ground
  { x: 180, y: 660, w: 260, h: 26 },
  { x: 560, y: 540, w: 220, h: 26 },
  { x: 900, y: 640, w: 260, h: 26 },
  { x: 1260, y: 520, w: 220, h: 26 },
  { x: 680, y: 380, w: 240, h: 26 },
  { x: 260, y: 420, w: 180, h: 26 },
  { x: 1100, y: 330, w: 200, h: 26 },
];

const SPAWNS = [
  { x: 200, y: 700 },
  { x: 1350, y: 700 },
  { x: 780, y: 400 },
  { x: 500, y: 560 },
];

const COLORS = ["#7ee787", "#7aa2ff", "#ffd042", "#ff5a5f", "#c792ea", "#4dd0e1", "#ffa657", "#f0f6fc"];

const players = new Map(); // playerId → state
let paused = false;

/* ---------------------------------------------------------------- */
/* Canvas: fullscreen at all times, cover-scaled                     */
/* ---------------------------------------------------------------- */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = Math.floor(innerWidth * devicePixelRatio);
  canvas.height = Math.floor(innerHeight * devicePixelRatio);
}
addEventListener("resize", resize);
resize();

/* ---------------------------------------------------------------- */
/* Session                                                           */
/* ---------------------------------------------------------------- */

const joinOverlay = document.getElementById("join-overlay");
const hud = document.getElementById("hud");

async function start() {
  const session = await OpenControl.host({ controller: "classic" });

  const joinUrl = session.getJoinUrl(new URL("controller.html", location.href).toString());
  document.getElementById("room-code").textContent = session.code;
  document.getElementById("hud-code").textContent = session.code;
  document.getElementById("join-url").textContent = joinUrl.replace(/^https?:\/\//, "");
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    document.getElementById("localhost-warn").classList.remove("hidden");
  }
  renderQr(joinUrl);

  session.on("join", (player) => {
    spawnPlayer(player);
    updateOverlay(session);

    player.on("move", ({ x }) => {
      const p = players.get(player.id);
      if (p) p.dir = x;
    });
    player.on("buttonDown", ({ button }) => {
      const p = players.get(player.id);
      if (!p) return;
      if (button === "a") jump(p);
      if (button === "b") p.running = true;
    });
    player.on("buttonUp", ({ button }) => {
      const p = players.get(player.id);
      if (p && button === "b") p.running = false;
    });
    player.on("start", () => {
      paused = !paused;
    });
  });

  session.on("leave", (player) => {
    players.delete(player.id);
    updateOverlay(session);
  });
  session.on("disconnect", (player) => {
    const p = players.get(player.id);
    if (p) p.ghost = true;
  });
  session.on("reconnect", (player) => {
    const p = players.get(player.id);
    if (p) p.ghost = false;
  });

  requestAnimationFrame(loop);
}

function spawnPlayer(player) {
  const spawn = SPAWNS[player.index % SPAWNS.length];
  players.set(player.id, {
    ref: player,
    name: player.name,
    color: COLORS[player.index % COLORS.length],
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    dir: 0,
    running: false,
    onGround: false,
    ghost: false,
    faceRight: true,
  });
}

function updateOverlay(session) {
  const count = session.playerCount;
  joinOverlay.classList.toggle("hidden", count > 0);
  hud.style.display = count > 0 ? "block" : "none";
  document.getElementById("hud-players").textContent =
    count === 1 ? "1 player" : `${count} players`;
}

function renderQr(url) {
  const el = document.getElementById("qr");
  if (typeof qrcode === "undefined") return; // CDN blocked/offline — link still shown
  try {
    const qr = qrcode(0, "M"); // type 0 = auto-detect smallest size
    qr.addData(url);
    qr.make();
    el.innerHTML = qr.createImgTag(6, 0);
    el.classList.add("ready");
  } catch {
    // link/code text is still shown even if QR rendering fails
  }
}

/* ---------------------------------------------------------------- */
/* Simulation                                                        */
/* ---------------------------------------------------------------- */

function jump(p) {
  if (p.onGround && !paused) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
  }
}

function respawn(p) {
  const spawn = SPAWNS[p.ref.index % SPAWNS.length];
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.ref.vibrate(200); // host → controller feedback
}

function step(dt) {
  for (const p of players.values()) {
    if (p.ghost) continue;

    const speed = MOVE_SPEED * (p.running ? RUN_MULTIPLIER : 1);
    p.vx = p.dir * speed;
    if (p.dir !== 0) p.faceRight = p.dir > 0;

    p.vy += GRAVITY * dt;
    const prevBottom = p.y + PLAYER_H;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.x = Math.max(0, Math.min(W - PLAYER_W, p.x));

    // One-way platforms: land only when falling onto the top.
    p.onGround = false;
    if (p.vy >= 0) {
      for (const plat of PLATFORMS) {
        const overlapsX = p.x + PLAYER_W > plat.x && p.x < plat.x + plat.w;
        const crossedTop = prevBottom <= plat.y + 1 && p.y + PLAYER_H >= plat.y;
        if (overlapsX && crossedTop) {
          p.y = plat.y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      }
    }

    if (p.y > H + 300) respawn(p);
  }
}

/* ---------------------------------------------------------------- */
/* Rendering                                                         */
/* ---------------------------------------------------------------- */

function draw() {
  const scale = Math.max(canvas.width / W, canvas.height / H);
  const offsetX = (canvas.width - W * scale) / 2;
  const offsetY = (canvas.height - H * scale) / 2;

  // Sky
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#141a2e");
  sky.addColorStop(1, "#0b0d12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  // Stars
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < 60; i++) {
    const sx = (i * 379) % W;
    const sy = (i * 211) % (H * 0.7);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Platforms
  for (const plat of PLATFORMS) {
    ctx.fillStyle = "#2b3245";
    roundRect(plat.x, plat.y, plat.w, plat.h, 8);
    ctx.fill();
    ctx.fillStyle = "#3d4763";
    roundRect(plat.x, plat.y, plat.w, 6, 3);
    ctx.fill();
  }

  // Players
  ctx.textAlign = "center";
  for (const p of players.values()) {
    ctx.globalAlpha = p.ghost ? 0.35 : 1;

    ctx.fillStyle = p.color;
    roundRect(p.x, p.y, PLAYER_W, PLAYER_H, 10);
    ctx.fill();

    // Face
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    const eyeOffset = p.faceRight ? 6 : -6;
    ctx.beginPath();
    ctx.arc(p.x + PLAYER_W / 2 + eyeOffset - 7, p.y + 20, 4, 0, Math.PI * 2);
    ctx.arc(p.x + PLAYER_W / 2 + eyeOffset + 7, p.y + 20, 4, 0, Math.PI * 2);
    ctx.fill();

    // Name tag
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(p.ghost ? `${p.name} (reconnecting…)` : p.name, p.x + PLAYER_W / 2, p.y - 12);

    ctx.globalAlpha = 1;
  }

  // Paused banner
  if (paused) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(canvas.height * 0.07)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    ctx.font = `400 ${Math.round(canvas.height * 0.025)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("press START to resume", canvas.width / 2, canvas.height / 2 + canvas.height * 0.06);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------------------------------------------------------- */
/* Main loop                                                         */
/* ---------------------------------------------------------------- */

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (!paused) step(dt);
  draw();
  requestAnimationFrame(loop);
}

start().catch((err) => {
  document.getElementById("room-code").textContent = "✕";
  document.getElementById("join-url").textContent = `Could not start session: ${err.message}`;
  console.error(err);
});
