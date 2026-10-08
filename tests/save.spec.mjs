// The best score survives a reload, and "Reset best score" clears it. The
// game itself writes the record (Void Strike 65: sector 599 at the level-end
// summary); the page keeps the written disk in IndexedDB per ATR hash.
import { expect, test } from "@playwright/test";
import { builtGames, gameModule, openPlay } from "./helpers.mjs";

for (const game of builtGames().filter((g) => g.saves === "disk")) {
  test(`${game.id}: the best score survives a reload and Reset clears it`, async ({ page }) => {
    const mod = await gameModule(game.id);
    test.skip(!mod?.toSummaryScript, `tests/games/${game.id}.mjs has no toSummaryScript`);

    await openPlay(page, game.id, "?manual=1&fresh=1");
    const blank = await page.evaluate((n) => window.arcade.diskSector(n), mod.SAVE_SECTOR);
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.evaluate((s) => window.arcade.runScript(s), mod.toSummaryScript);
    await page.waitForFunction(() => window.arcade.savedAtFrame !== null, null, { timeout: 10_000 });
    const written = await page.evaluate((n) => window.arcade.diskSector(n), mod.SAVE_SECTOR);
    expect(written, "the game wrote its record").not.toEqual(blank);
    await expect(page.locator("#save-status")).toHaveText(/Best score saved/);

    // reload: the saved disk comes back
    await openPlay(page, game.id, "?manual=1");
    expect(await page.evaluate(() => window.arcade.restoredFromSave)).toBe(true);
    expect(await page.evaluate((n) => window.arcade.diskSector(n), mod.SAVE_SECTOR)).toEqual(written);

    // Reset best score: confirm, the page reloads from the release disk
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reset best score" }).click();
    await page.waitForFunction(() => window.arcade?.ready === true && window.arcade.restoredFromSave === false, null, { timeout: 30_000 });
    expect(await page.evaluate((n) => window.arcade.diskSector(n), mod.SAVE_SECTOR)).toEqual(blank);

    // and a further reload stays fresh
    await openPlay(page, game.id, "?manual=1");
    expect(await page.evaluate(() => window.arcade.restoredFromSave)).toBe(false);
  });
}
