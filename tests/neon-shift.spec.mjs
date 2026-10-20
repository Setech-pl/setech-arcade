// Input-only gameplay and disk persistence, using the pinned release disk.
import { expect, test } from '@playwright/test';
import { openPlay } from './helpers.mjs';
import { L } from './games/neon-shift-65.mjs';

const script = (page, s) => page.evaluate(s => window.arcade.runScript(s), s);
const state = page => page.evaluate(L => {
  const p = n => window.arcade.peek(n), g = L.gs;
  return { phase:p(L.phase), scene:p(L.scene), error:p(L.error),
    moves:p(g+785)+256*p(g+786), pushes:p(g+789),
    player:[p(g+762),p(g+763)], box:[p(g+764),p(g+765)],
    undo:p(L.count)+256*p(L.count+1) };
}, L);

test('neon-shift-65: push, undo, restart, save, cold Continue and reset progress', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await openPlay(page,'neon-shift-65','?manual=1&fresh=1');
  await expect(page.getByRole('link',{name:'Download ATR',exact:true})).toHaveAttribute('href','https://github.com/Setech-pl/neon-shift-65/releases/download/v1.0.0/neon-shift65.atr');
  await page.getByRole('button',{name:/Start game/}).click();
  await script(page,'frames 3000');
  expect((await state(page)).phase).toBe(0);
  await script(page,'fire 1\nframes 2\nfire 0\nframes 1500');
  const initial=await state(page);expect(initial.phase).toBe(1);expect(initial.moves).toBe(0);
  await script(page,'joy r\nframes 1\njoy c\nframes 20');
  const pushed=await state(page);expect(pushed.moves).toBe(1);expect(pushed.pushes).toBe(1);
  await script(page,'select 1\nframes 1\nselect 0\nframes 20');
  expect((await state(page)).moves).toBe(0);expect((await state(page)).box).toEqual(initial.box);
  await script(page,'joy r\nframes 1\njoy c\nframes 20\noption 1\nframes 2\noption 0\nframes 1500');
  const restarted=await state(page);expect(restarted.moves).toBe(0);expect(restarted.player).toEqual(initial.player);
  await script(page,'joy r\nframes 1\njoy c\nframes 20');const saved=await state(page);
  await script(page,'start 1\nframes 2\nstart 0\nframes 30\nselect 1\nframes 2\nselect 0\nframes 1500');
  await page.waitForFunction(()=>window.arcade.savedAtFrame!==null);
  await expect(page.locator('#save-status')).toHaveText(/Progress saved/);
  const records=await page.evaluate(()=>[8100,8101].map(n=>window.arcade.diskSector(n)));
  expect(records.some(r=>String.fromCharCode(...r.slice(0,4))==='NSAV')).toBe(true);
  await openPlay(page,'neon-shift-65','?manual=1');
  expect(await page.evaluate(()=>window.arcade.restoredFromSave)).toBe(true);
  await page.getByRole('button',{name:/Start game/}).click();
  await script(page,'frames 3000\njoy d\nframes 1\njoy c\nframes 20\nfire 1\nframes 2\nfire 0\nframes 1500');
  const cold=await state(page);expect(cold.phase).toBe(1);expect(cold.undo).toBe(0);
  expect(cold.moves).toBe(saved.moves);expect(cold.player).toEqual(saved.player);expect(cold.box).toEqual(saved.box);
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Reset saved progress'}).click();
  await page.waitForFunction(()=>window.arcade?.ready && !window.arcade.restoredFromSave);
  const fresh=await page.evaluate(()=>[8100,8101].map(n=>window.arcade.diskSector(n)));
  expect(fresh.every(r=>r.every(b=>b===0))).toBe(true);
  expect(errors).toEqual([]);
});

test('neon-shift-65: real keyboard push, SELECT undo and OPTION restart', async ({ page }) => {
  await openPlay(page,'neon-shift-65','?fresh=1');
  await page.getByRole('button',{name:/Start game/}).click();
  const ready=phase=>page.waitForFunction(({L,phase})=>{
    const a=window.arcade;return a.frame>900 && a.peek(L.phase)===phase && !a.peek(L.loading) && a.peek(L.display)===1;
  },{L,phase},{timeout:60000});
  await ready(0);await page.locator('#stage').focus();
  const tap=async(key,ms=100)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
  await tap('z');await ready(1);await page.waitForTimeout(250);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(g=>window.arcade.peek(g+785)>0,L.gs,{timeout:5000});
  await page.keyboard.up('ArrowRight');expect((await state(page)).pushes).toBeGreaterThan(0);
  await tap('F3',60);await page.waitForTimeout(250);expect((await state(page)).moves).toBe(0);
  await tap('F2',60);await ready(1);expect((await state(page)).moves).toBe(0);
});
