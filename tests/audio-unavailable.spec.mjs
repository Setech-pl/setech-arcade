// The game starts from the start button even when sound cannot: no audio
// device (Firefox's resume() then never settles - the CI runner has none,
// docs/fixes/firefox-keyboard-start.md), or no AudioContext at all. The game
// runs silently and offers to retry the sound.
import { expect, test } from "@playwright/test";
import { builtGames, openPlay } from "./helpers.mjs";

const STUBS = {
  // as Firefox without an audio device: the context stays suspended
  "resume() never settles": () => {
    Object.defineProperty(BaseAudioContext.prototype, "state", { get: () => "suspended" });
    AudioContext.prototype.resume = () => new Promise(() => {});
  },
  "AudioContext throws": () => {
    window.AudioContext = class { constructor() { throw new Error("no audio"); } };
  },
};

async function keyboardStart(page, id) {
  await openPlay(page, id, "?fresh=1");
  await page.focus("#start");
  await page.keyboard.press("Enter");
  await expect(page.locator("#start")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("stage");
  await page.waitForFunction(() => window.arcade.running && window.arcade.frame > 0, null, { timeout: 15_000 });
}

async function runsSilently(page) {
  await expect(page.locator("#sound-retry")).toBeVisible();
  await expect(page.locator("#sound-retry")).toHaveText(/Sound unavailable/);
  const before = await page.evaluate(() => window.arcade.frame);
  await expect.poll(() => page.evaluate(() => window.arcade.frame)).toBeGreaterThan(before + 25);
  // the notice does not take the keyboard from the game
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("stage");
}

for (const game of builtGames()) {
  for (const [name, stub] of Object.entries(STUBS)) {
    test(`${game.id}: keyboard start runs without sound when ${name}`, async ({ page }) => {
      await page.addInitScript(stub);
      await keyboardStart(page, game.id);
      await runsSilently(page);
    });
  }

  test(`${game.id}: "Sound unavailable" retries the sound`, async ({ page, browserName }) => {
    // the retry uses the real AudioContext, which needs an audio device
    // (Chromium resolves resume() without one; Firefox does not)
    test.skip(browserName !== "chromium", "needs a working audio output");
    await page.addInitScript(() => {
      const Real = window.AudioContext;
      let first = true;
      window.AudioContext = class extends Real {
        constructor(...a) {
          if (first) { first = false; throw new Error("no audio"); }
          super(...a);
        }
      };
    });
    await keyboardStart(page, game.id);
    await page.locator("#sound-retry").click();
    await expect(page.locator("#sound-retry")).toBeHidden();
    expect(await page.evaluate(() => window.arcade.audio.state)).toBe("running");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("stage");
  });

  // the real thing, no stubs: Firefox's own "no audio device" setting
  test(`${game.id}: keyboard start runs in Firefox with no audio device`, async ({ playwright, browserName, baseURL }) => {
    test.skip(browserName !== "firefox", "a Firefox setting");
    const browser = await playwright.firefox.launch({ firefoxUserPrefs: { "media.cubeb.force_null_context": true } });
    try {
      const page = await browser.newPage({ baseURL });
      await keyboardStart(page, game.id);
      await runsSilently(page);
    } finally {
      await browser.close();
    }
  });
}
