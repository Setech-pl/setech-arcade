// Each game boots to its menu, and that frame matches its stored reference
// image exactly. The emulator is deterministic, so frame N after power-on is
// the same in every browser (and the same as native atari800 7.2.1).
// UPDATE_REFERENCE=1 npx playwright test menu --project=chromium  rewrites them.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { ROOT, builtGames, comparePng, openPlay, pngFromDataUrl } from "./helpers.mjs";

for (const game of builtGames()) {
  test(`${game.id}: boots to its menu, frame ${game.tests.menuFrame} matches the reference`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openPlay(page, game.id, "?manual=1&fresh=1");
    await page.getByRole("button", { name: /Start game/ }).click();
    const run = await page.evaluate((n) => window.arcade.runScript(`frames ${n}\nshot menu`), game.tests.menuFrame);
    const actual = pngFromDataUrl(run.shots.menu);
    const reference = path.join(ROOT, "tests", "reference", `${game.id}-menu.png`);
    if (process.env.UPDATE_REFERENCE) {
      fs.writeFileSync(reference, PNG.sync.write(actual));
      test.info().annotations.push({ type: "updated", description: reference });
      return;
    }
    expect(fs.existsSync(reference), `missing ${reference}`).toBe(true);
    const { count, diff, reason } = comparePng(actual, reference);
    if (count) {
      await info.attach("actual.png", { body: PNG.sync.write(actual), contentType: "image/png" });
      if (diff) await info.attach("diff.png", { body: PNG.sync.write(diff), contentType: "image/png" });
    }
    expect(count, reason ?? `${count} pixels differ from ${path.relative(ROOT, reference)}`).toBe(0);
    expect(errors).toEqual([]);
  });
}
