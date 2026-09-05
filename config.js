export const GAME_CONFIG = {
  targetScore: 1000,
  pointsPerCollectible: 10,
  hazardPenalty: 10,
  startingLives: 3,
  maximumLives: 4,
  collectibleChance: 0.34,
  heartHazardChance: 0.12,
  bonusLifeScore: 250,
  slowTimeScores: [200, 600],
  slowTimeDurationMs: 15000,
  slowTimeScale: 0.5,
};

// Replace any file in /assets while keeping its filename, or change its path here.
export const ART = {
  playerOpen: "./assets/player-open.webp",
  playerBlink: "./assets/player-blink.webp",
  collectible: "./assets/eye-collectible.webp",
  hazards: [
    "./assets/glitch-at.webp",
    "./assets/glitch-404.webp",
    "./assets/glitch-symbols.webp",
  ],
  heartHazard: "./assets/glitch-heart.webp",
  slowTime: "./assets/time-power-up.webp",
};
