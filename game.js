import { ART, GAME_CONFIG as CONFIG } from "./config.js";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const field = document.querySelector("#game-field");
const startOverlay = document.querySelector("#start-overlay");
const controlsOverlay = document.querySelector("#controls-overlay");
const pauseOverlay = document.querySelector("#pause-overlay");
const gameOverOverlay = document.querySelector("#game-over-overlay");
const completeOverlay = document.querySelector("#complete-overlay");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const hud = document.querySelector("#hud");
const stopwatch = document.querySelector("#stopwatch");
const livesLabel = document.querySelector("#lives");
const scoreLabel = document.querySelector("#score");

const STORAGE_KEYS = {
  highScore: "eye-catcher-high-score",
  bestTime: "eye-catcher-best-time-ms",
};

const state = {
  mode: "loading",
  width: 1,
  height: 1,
  playerX: 0.5,
  playerTargetX: null,
  playerVelocity: 0,
  playerFacing: 1,
  keys: { left: false, right: false },
  items: [],
  score: 0,
  lives: CONFIG.startingLives,
  milestones: new Set(),
  pendingTimePowerUps: 0,
  slowTimeRemainingMs: 0,
  runElapsedMs: 0,
  previousFrame: performance.now(),
  lastSpawn: 0,
  nextBlinkAt: 0,
  blinkUntil: 0,
};

const images = {};

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${source}`));
    image.src = source;
  });
}

async function loadArt() {
  const entries = [
    ["playerOpen", ART.playerOpen],
    ["playerBlink", ART.playerBlink],
    ["collectible", ART.collectible],
    ["heart", ART.heartHazard],
    ["time", ART.slowTime],
    ...ART.hazards.map((source, index) => [`hazard${index}`, source]),
  ];
  const loaded = await Promise.all(entries.map(async ([key, source]) => [key, await loadImage(source)]));
  Object.assign(images, Object.fromEntries(loaded));
  state.mode = "ready";
  state.nextBlinkAt = performance.now() + 1800;
  startButton.disabled = false;
  startButton.textContent = "START";
}

function formatTime(milliseconds) {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function hideOverlays() {
  [startOverlay, controlsOverlay, pauseOverlay, gameOverOverlay, completeOverlay].forEach((overlay) => overlay.classList.add("hidden"));
}

function updateHud() {
  livesLabel.textContent = Array.from({ length: CONFIG.maximumLives }, (_, index) => index < state.lives ? "♥" : "♡").join(" ");
  scoreLabel.textContent = String(state.score).padStart(4, "0");
  stopwatch.textContent = formatTime(state.runElapsedMs);
  const active = state.mode === "running";
  hud.classList.toggle("is-hidden", !active);
  stopwatch.classList.toggle("is-hidden", !active);
}

function resetGame() {
  state.mode = "running";
  state.playerX = 0.5;
  state.playerTargetX = null;
  state.playerVelocity = 0;
  state.playerFacing = 1;
  state.keys.left = false;
  state.keys.right = false;
  state.items = [];
  state.score = 0;
  state.lives = CONFIG.startingLives;
  state.milestones.clear();
  state.pendingTimePowerUps = 0;
  state.slowTimeRemainingMs = 0;
  state.runElapsedMs = 0;
  state.lastSpawn = performance.now();
  state.previousFrame = performance.now();
  hideOverlays();
  updateHud();
  canvas.focus({ preventScroll: true });
}

function pauseGame() {
  if (state.mode !== "running") return;
  state.mode = "paused";
  state.keys.left = false;
  state.keys.right = false;
  pauseOverlay.classList.remove("hidden");
  updateHud();
}

function resumeGame() {
  if (state.mode !== "paused") return;
  state.mode = "running";
  state.previousFrame = performance.now();
  state.lastSpawn = performance.now();
  pauseOverlay.classList.add("hidden");
  updateHud();
  canvas.focus({ preventScroll: true });
}

function finishGame() {
  state.mode = "game-over";
  const storedHighScore = Number(localStorage.getItem(STORAGE_KEYS.highScore) || 0);
  localStorage.setItem(STORAGE_KEYS.highScore, String(Math.max(storedHighScore, state.score)));
  document.querySelector("#game-over-score").textContent = `SCORE ${String(state.score).padStart(4, "0")}`;
  gameOverOverlay.classList.remove("hidden");
  updateHud();
}

function completeRun() {
  state.mode = "complete";
  const storedBest = Number(localStorage.getItem(STORAGE_KEYS.bestTime));
  const previousBest = Number.isFinite(storedBest) && storedBest > 0 ? storedBest : null;
  const isNewBest = previousBest === null || state.runElapsedMs < previousBest;
  const best = isNewBest ? state.runElapsedMs : previousBest;
  localStorage.setItem(STORAGE_KEYS.bestTime, String(Math.round(best)));
  document.querySelector("#complete-score").textContent = String(state.score).padStart(4, "0");
  document.querySelector("#complete-time").textContent = formatTime(state.runElapsedMs);
  document.querySelector("#best-time").textContent = formatTime(best);
  document.querySelector("#new-best").classList.toggle("hidden", !isNewBest);
  completeOverlay.classList.remove("hidden");
  updateHud();
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 2);
  state.width = Math.max(1, bounds.width);
  state.height = Math.max(1, bounds.height);
  canvas.width = Math.floor(state.width * scale);
  canvas.height = Math.floor(state.height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
}

function spawnItem(now, timeScale) {
  const interval = Math.max(330, 820 - state.score * 1.6) / timeScale;
  if (now - state.lastSpawn <= interval) return;

  const forceTime = state.pendingTimePowerUps > 0;
  const roll = Math.random();
  const kind = forceTime
    ? "time"
    : roll < CONFIG.collectibleChance
      ? "collectible"
      : roll < CONFIG.collectibleChance + CONFIG.heartHazardChance
        ? "heart"
        : "hazard";
  const hazardIndex = Math.floor(Math.random() * ART.hazards.length);
  if (forceTime) state.pendingTimePowerUps -= 1;
  state.items.push({
    kind,
    image: kind === "hazard" ? images[`hazard${hazardIndex}`] : images[kind],
    x: 24 + Math.random() * Math.max(1, state.width - 48),
    y: -28,
    radius: kind === "collectible" ? 19 : kind === "time" ? 18 : kind === "heart" ? 17 : 16,
    speed: 92 + Math.random() * 85 + state.score * 0.22,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.8,
    scale: 0.86 + Math.random() * 0.3,
    drift: (Math.random() - 0.5) * 34,
  });
  state.lastSpawn = now;
}

function movePlayer(delta) {
  const keyboardDirection = Number(state.keys.right) - Number(state.keys.left);
  if (keyboardDirection) {
    state.playerTargetX = null;
    state.playerVelocity += keyboardDirection * 3.4 * delta;
    state.playerVelocity *= Math.exp(-2.8 * delta);
  } else {
    state.playerVelocity *= Math.exp(-8.5 * delta);
  }

  if (state.playerTargetX !== null) {
    const distance = state.playerTargetX - state.playerX;
    state.playerVelocity += distance * 24 * delta;
    state.playerVelocity *= Math.exp(-5 * delta);
    if (Math.abs(distance) < 0.003 && Math.abs(state.playerVelocity) < 0.02) state.playerTargetX = null;
  }

  state.playerVelocity = Math.max(-0.9, Math.min(0.9, state.playerVelocity));
  state.playerX += state.playerVelocity * delta;
  if (state.playerX < 0 || state.playerX > 1) {
    state.playerX = Math.max(0, Math.min(1, state.playerX));
    state.playerVelocity *= -0.18;
  }
  if (state.playerVelocity > 0.02) state.playerFacing = 1;
  if (state.playerVelocity < -0.02) state.playerFacing = -1;
}

function drawPlayer(now) {
  if (now >= state.nextBlinkAt) {
    state.blinkUntil = now + 130;
    state.nextBlinkAt = now + 2600 + Math.random() * 3200;
  }
  const image = now < state.blinkUntil ? images.playerBlink : images.playerOpen;
  if (!image) return null;
  const height = Math.max(74, Math.min(108, state.width * 0.19));
  const width = height * (image.naturalWidth / image.naturalHeight);
  const x = state.playerX * state.width;
  const y = state.height - height / 2 - 32;
  const bob = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.sin(now * 0.0045) * 3;
  const tilt = Math.max(-0.17, Math.min(0.17, state.playerVelocity * 0.24));
  context.save();
  context.translate(x, y + bob);
  context.rotate(tilt);
  context.scale(state.playerFacing, 1);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  return { x, y: y + bob, radius: Math.min(width, height) * 0.36 };
}

function drawItem(item, now) {
  const multipliers = { collectible: 2.75, time: 3.75, heart: 3.55, hazard: 3.45 };
  const pulse = item.kind === "time" ? 1 + Math.sin(now * 0.008) * 0.07 : 1;
  const maxSize = item.radius * multipliers[item.kind] * item.scale * pulse;
  const imageScale = maxSize / Math.max(item.image.naturalWidth, item.image.naturalHeight);
  const width = item.image.naturalWidth * imageScale;
  const height = item.image.naturalHeight * imageScale;
  context.save();
  context.translate(item.x, item.y);
  context.rotate(item.rotation);
  if (item.kind !== "collectible") {
    context.shadowColor = "rgba(255, 70, 218, .9)";
    context.shadowBlur = item.kind === "time" ? 20 : 14;
  }
  context.drawImage(item.image, -width / 2, -height / 2, width, height);
  context.restore();
}

function collect(item) {
  if (item.kind === "collectible") {
    state.score += CONFIG.pointsPerCollectible;
    if (state.score >= CONFIG.bonusLifeScore && !state.milestones.has(CONFIG.bonusLifeScore)) {
      state.milestones.add(CONFIG.bonusLifeScore);
      state.lives = Math.min(CONFIG.maximumLives, state.lives + 1);
    }
    CONFIG.slowTimeScores.forEach((threshold) => {
      if (state.score >= threshold && !state.milestones.has(threshold)) {
        state.milestones.add(threshold);
        state.pendingTimePowerUps += 1;
      }
    });
    if (state.score >= CONFIG.targetScore) completeRun();
  } else if (item.kind === "time") {
    state.slowTimeRemainingMs = CONFIG.slowTimeDurationMs;
    stopwatch.classList.add("is-slowed");
  } else if (item.kind === "heart") {
    state.lives -= 1;
    field.classList.remove("heart-hit");
    void field.offsetWidth;
    field.classList.add("heart-hit");
    if (state.lives <= 0) finishGame();
  } else {
    state.score = Math.max(0, state.score - CONFIG.hazardPenalty);
    field.classList.remove("glitch-hit");
    void field.offsetWidth;
    field.classList.add("glitch-hit");
  }
  updateHud();
}

function frame(now) {
  const elapsed = Math.max(0, (now - state.previousFrame) / 1000);
  const delta = Math.min(elapsed, 0.05);
  state.previousFrame = now;
  context.clearRect(0, 0, state.width, state.height);

  const running = state.mode === "running";
  const slow = state.slowTimeRemainingMs > 0;
  const timeScale = slow ? CONFIG.slowTimeScale : 1;
  if (running) {
    state.runElapsedMs += elapsed * 1000 * timeScale;
    if (slow) {
      state.slowTimeRemainingMs = Math.max(0, state.slowTimeRemainingMs - elapsed * 1000);
      if (state.slowTimeRemainingMs === 0) stopwatch.classList.remove("is-slowed");
    }
    movePlayer(delta);
    spawnItem(now, timeScale);
  }

  const player = drawPlayer(now);
  const remaining = [];
  for (const item of state.items) {
    if (running) {
      item.y += item.speed * delta * timeScale;
      item.x += item.drift * delta * timeScale;
      item.rotation += item.spin * delta * timeScale;
      if (item.x < 20 || item.x > state.width - 20) item.drift *= -1;
    }
    drawItem(item, now);
    const collided = running && player && Math.hypot(item.x - player.x, item.y - player.y) < item.radius + player.radius;
    if (collided) collect(item);
    else if (item.y < state.height + 60) remaining.push(item);
    if (state.mode !== "running") break;
  }
  state.items = remaining;
  if (running) updateHud();
  requestAnimationFrame(frame);
}

function setTargetFromPointer(event) {
  if (state.mode !== "running") return;
  const bounds = canvas.getBoundingClientRect();
  state.playerTargetX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  setTargetFromPointer(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) setTargetFromPointer(event);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (event.key === "ArrowLeft" || key === "a") {
    event.preventDefault();
    state.keys.left = true;
  }
  if (event.key === "ArrowRight" || key === "d") {
    event.preventDefault();
    state.keys.right = true;
  }
  if (event.key === " " || key === "p") {
    event.preventDefault();
    if (state.mode === "running") pauseGame();
    else if (state.mode === "paused") resumeGame();
    else if (state.mode === "ready" || state.mode === "game-over" || state.mode === "complete") resetGame();
  }
});
window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (event.key === "ArrowLeft" || key === "a") state.keys.left = false;
  if (event.key === "ArrowRight" || key === "d") state.keys.right = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

startButton.addEventListener("click", resetGame);
pauseButton.addEventListener("click", pauseGame);
document.querySelector("#resume-button").addEventListener("click", resumeGame);
document.querySelector("#restart-from-pause-button").addEventListener("click", resetGame);
document.querySelector("#play-again-button").addEventListener("click", resetGame);
document.querySelector("#play-again-complete-button").addEventListener("click", resetGame);
document.querySelector("#controls-button").addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  controlsOverlay.classList.remove("hidden");
});
document.querySelector("#close-controls-button").addEventListener("click", () => {
  controlsOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
updateHud();
requestAnimationFrame(frame);
loadArt().catch((error) => {
  startButton.textContent = "ART FAILED TO LOAD";
  console.error(error);
});
