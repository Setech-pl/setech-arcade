// The reference scenario in the harness script language, shared by the
// native atari800 run (reference-run.mjs) and the browser prototypes.
// Game RAM, release v0.2.2 (cross-checked against the running game: lives
// read 3 at the start, the boss head JMP appears at the boss entry).
export const GAME_STATE = "0x9A"; // 0 loader, 1 main menu, 6 gameplay
export const PLAYER_HEALTH = "0x4E5D"; // BROAD_PLAYER_HEALTH, ten units
export const PLAYER_LIVES = "0x4EAB";
export const PLAYER_X = "0x80";
export const BOSS_HEAD = "0x6DE8"; // overlay slot A: becomes $4C (JMP) first thing at the boss entry
export const BOSS_CHARSET = "0x0C40"; // boss region charset: $55 once installed, the band goes live
export const SUMMARY_DLIST = "0x0B72"; // ANTIC's display list pointer at frame end on the summary screen

export const ATR_HEADER = 16;
export const SECTOR = 128;
export const sectorBytes = (bytes, n) => bytes.subarray(ATR_HEADER + (n - 1) * SECTOR, ATR_HEADER + n * SECTOR);

export function pressFire(lines) {
  lines.push("fire 1", "frames 4", "fire 0");
}

export function scenario() {
  const s = [];
  s.push(`watch ${GAME_STATE}`);
  s.push(`until ${GAME_STATE} 1 1500`, "mark menu");
  s.push("wav 01-menu-music.wav", "frames 100", "shot 01-menu", "frames 400", "wavstop");
  pressFire(s);
  s.push("frames 50", "shot 02-start-game-engaging", "frames 100", "shot 03-loader-panel", "frames 200", "shot 04-press-fire");
  pressFire(s);
  s.push(`until ${GAME_STATE} 6 600`, "mark gameplay");
  // Invincible auto-play: the boss must be reached and beaten in every run.
  s.push(`hold ${PLAYER_HEALTH} 10`, `hold ${PLAYER_LIVES} 3`, "sweep 40");
  s.push("frames 150", "shot 05-gameplay-early");
  s.push("frames 1150", "shot 06-capital-corridor", "frames 300", "shot 07-capital-corridor-b");
  s.push(`until ${BOSS_HEAD} 0x4C 8000`, "mark boss-entry", "frames 60", "shot 08-boss-warning");
  s.push(`until ${BOSS_CHARSET} 0x55 2000`, "mark boss-band-live");
  s.push("sweep 0", `hunt ${PLAYER_X} 0x30 0xC8 30 u`, "frames 240", "shot 09-boss-band");
  // The first laser shot of the fight: band live + 507 frames on atari800.
  s.push("frames 267", "shot 09b-boss-laser");
  s.push("shotevery 50 boss/");
  s.push(`untildl ${SUMMARY_DLIST} 30000`, "mark level-end", "shotevery 0", "hunt off", "fire 0", "joy c", "frames 25", "shot 10-summary");
  s.push("frames 200", "shot 11-summary-press-fire");
  pressFire(s);
  s.push(`until ${GAME_STATE} 1 3000`, "mark menu-after-level", "frames 100", "shot 12-menu-after-level");
  // Power cycle: the record must come back from the disk.
  s.push(`unhold ${PLAYER_HEALTH}`, `unhold ${PLAYER_LIVES}`, "coldstart", "mark coldstart");
  // RAM still holds the old state for a moment after the power cycle.
  s.push("frames 100", `until ${GAME_STATE} 1 1500`, "mark menu-after-coldstart", "frames 25");
  pressFire(s);
  s.push("frames 350", "shot 13-best-after-power-cycle");
  pressFire(s);
  s.push(`until ${GAME_STATE} 6 600`, "frames 300", "shot 14-before-reset");
  s.push("reset", "frames 25", "shot 15-reset-25", "frames 100", "shot 16-reset-125", "frames 200", "shot 17-reset-325");
  s.push(`until ${GAME_STATE} 1 1500`, "mark menu-after-reset", "frames 100", "shot 18-menu-after-reset");
  return s.join("\n") + "\n";
}

