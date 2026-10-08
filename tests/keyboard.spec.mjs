// The play page works with the keyboard only, in real time: Tab to the start
// button, Enter, and the game screen takes the keyboard - arrows and fire
// play, the page does not scroll, Tab leaves the game again.
import { expect, test } from "@playwright/test";
import { builtGames, gameModule, openPlay } from "./helpers.mjs";

// Safari (and Playwright's WebKit) moves between buttons with Option+Tab;
// plain Tab skips them unless "Press Tab to highlight each item" is on.
async function tabTo(page, selector, max = 25) {
  const key = page.context().browser().browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i <= max; i += 1) {
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return i;
    await page.keyboard.press(key);
  }
  throw new Error(`${selector} is not reachable with Tab`);
}
const isState = (page, s) => page.evaluate(({ addr, value }) => window.arcade.peek(addr) === value, s);
async function tap(page, key, ms = 150) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

for (const game of builtGames()) {
  test(`${game.id}: keyboard only, from the start button into the game`, async ({ page }) => {
    const mod = await gameModule(game.id);
    await openPlay(page, game.id, "?fresh=1");
    await tabTo(page, "#start");
    await page.keyboard.press("Enter");
    await expect(page.locator("#start")).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("stage");
    await page.waitForFunction(() => window.arcade.running && window.arcade.frame > 0, null, { timeout: 15_000 });

    // the menu, then the game's own keys
    const menuFrame = game.tests.menuFrame;
    await page.waitForFunction((n) => window.arcade.frame >= n, menuFrame, { timeout: 30_000 });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    // the game's menu wants the stick back in the centre between moves
    await tap(page, "ArrowDown");
    await page.waitForTimeout(400);
    await tap(page, "ArrowUp");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY), "arrow keys go to the game, not the page").toBe(scrollBefore);
    if (mod?.inMenu) expect(await isState(page, mod.inMenu)).toBe(true);
    await tap(page, "z"); // fire on START GAME
    if (mod?.inGameplay) {
      // the loader shows PRESS FIRE after about three seconds; press until in play
      await expect.poll(async () => {
        await tap(page, "z");
        return isState(page, mod.inGameplay);
      }, { timeout: 30_000, intervals: [1000] }).toBe(true);
    }
    // Tab leaves the game screen for the next control
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe("stage");
    // every visible control on the page is reachable (the page hides
    // Fullscreen where the browser does not allow it)
    for (const sel of ["#fullscreen", "#reset-score"]) {
      if (await page.locator(sel).isVisible()) await tabTo(page, sel, 40);
    }
  });
}
