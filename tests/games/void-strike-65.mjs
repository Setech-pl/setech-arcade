// Test knowledge for Void Strike 65 v0.2.3 - RAM addresses checked against
// the running game in the emulator spike (docs/spike-emulator.md §1, v0.2.2)
// and re-checked for v0.2.3 (only the summary's display list moved, $0B72 ->
// $0B58). They drive the tests only; the site needs none of them.
export const GAME_STATE = 0x9a; // 0 loader, 1 main menu, 6 gameplay
export const SAVE_SECTOR = 599; // the best-score record ("VR" ...)

export const inMenu = { addr: GAME_STATE, value: 1 };
export const inGameplay = { addr: GAME_STATE, value: 6 };

// From power-on to the level-end summary, by which time the record is on the
// disk: menu, START GAME, gameplay held invincible (hull $4E5D, lives $4EAB),
// a bot to the boss ($6DE8 becomes a JMP at the boss entry, the charset byte
// $0C40 is $55 once the band is live) and through the fight, until ANTIC's
// display list is the summary's ($0B58). About 8,700 frames: under a second
// of stepping in a desktop browser.
export const toSummaryScript = `
until 0x9A 1 1500
frames 25
fire 1
frames 4
fire 0
frames 350
fire 1
frames 4
fire 0
until 0x9A 6 600
hold 0x4E5D 10
hold 0x4EAB 3
sweep 40
until 0x6DE8 0x4C 8000
until 0x0C40 0x55 2000
sweep 0
hunt 0x80 0x30 0xC8 30 u
untildl 0x0B58 30000
hunt off
unhold 0x4E5D
unhold 0x4EAB
frames 200
`;
