// The site's pages, rendered at build time from games/*.json. Plain template
// functions; every value from a data file goes through esc().
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SITE = "Setech Arcade";

function layout({ title, description, root, body, scripts = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0b0c10">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/css/arcade.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${root}">Setech <span>Arcade</span></a>
    <nav class="site-nav" aria-label="Site"><a href="${root}">All games</a> · <a href="${root}credits/">Credits &amp; licences</a></nav>
  </div>
  <div class="stripes" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
</header>
<main id="main"><div class="wrap">
${body}
</div></main>
<footer class="site-footer">
  <div class="wrap">
    <span>Setech Game Studio · non-commercial hobby projects, free to play.</span>
    <span><a href="${root}credits/">Credits &amp; licences</a> · Emulator: atari800 (GPL) · Site code: MIT</span>
  </div>
</footer>
${scripts}
</body>
</html>
`;
}

export function indexPage(games) {
  const cards = games.map((g) => `  <article class="card">
    <a class="shot" href="play/${esc(g.id)}/" tabindex="-1" aria-hidden="true"><img src="games/${esc(g.screenshots[0].src)}" alt="" width="672" height="480" loading="lazy"></a>
    <div class="body">
      <h2>${esc(g.title)}</h2>
      <p class="status">${esc(g.status)}</p>
      <p>${esc(g.tagline)}</p>
      <div class="actions">
        <a class="button primary" href="play/${esc(g.id)}/">Play<span class="visually-hidden"> ${esc(g.title)}</span></a>
        <span class="links"><a href="${esc(g.links.repo)}">Source</a> <a href="${esc(g.links.releases)}">Releases</a></span>
      </div>
    </div>
  </article>`).join("\n");
  return layout({
    title: `${SITE} · Setech Game Studio`,
    description: "Play Setech Game Studio's Atari 8-bit games in your browser.",
    root: "./",
    body: `<h1>Setech Arcade</h1>
<p class="lede">Setech Game Studio's games for the Atari 8-bit computers, playable in your browser. Each one runs from its released disk image in atari800, an Atari 800XL emulator, on a PAL machine with 64 KB, just as on a real Atari 65XE.</p>
<p class="lede">Best with a keyboard or a gamepad. Your best scores stay in this browser.</p>
<section class="games" aria-label="Games">
${cards}
</section>`,
  });
}

const KEYS = {
  Joystick: { keyboard: "<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>", gamepad: "D-pad or left stick", touch: "Direction pad" },
  Fire: { keyboard: "<kbd>Z</kbd>, <kbd>X</kbd>, <kbd>Ctrl</kbd>, <kbd>Alt</kbd> or <kbd>Shift</kbd>", gamepad: "A, B, X or Y", touch: "FIRE" },
  Space: { keyboard: "<kbd>Space</kbd>", gamepad: "Start", touch: "—" },
  Return: { keyboard: "<kbd>Enter</kbd>", gamepad: "—", touch: "—" },
  START: { keyboard: "<kbd>F4</kbd>", gamepad: "—", touch: "—" },
  SELECT: { keyboard: "<kbd>F3</kbd>", gamepad: "—", touch: "—" },
  OPTION: { keyboard: "<kbd>F2</kbd>", gamepad: "—", touch: "—" },
};

export function playPage(game, diskPath) {
  const rows = game.controls.map((c) => {
    const k = KEYS[c.atari] ?? { keyboard: "—", gamepad: "—", touch: "—" };
    return `<tr><td>${esc(c.action)}</td><td>${k.keyboard}</td><td>${k.gamepad}</td><td>${k.touch}</td></tr>`;
  }).join("\n          ");
  const data = JSON.stringify(game).replace(/</g, "\\u003c");
  return layout({
    title: `${game.title} · ${SITE}`,
    description: game.tagline,
    root: "../../",
    body: `<p class="site-nav"><a href="../../">← All games</a></p>
<h1>${esc(game.title)}</h1>
<p class="lede">${esc(game.tagline)}</p>

<section id="player" class="player" data-disk="${esc(diskPath)}" aria-label="${esc(game.title)}">
  <div id="stage" class="stage" tabindex="0" role="application"
       aria-label="${esc(game.title)} game screen. Arrow keys move, Z or X fires, Space pauses.">
    <canvas id="screen" width="336" height="240" aria-hidden="true"></canvas>
    <button id="start" class="start primary" type="button" disabled>▶ Start game (sound on)</button>
  </div>
  <div class="touch">
    <p class="touch-label">Best with a keyboard or gamepad</p>
    <div class="pad">
      <button class="up" type="button" data-joy="1" aria-label="Up">▲</button>
      <button class="left" type="button" data-joy="4" aria-label="Left">◀</button>
      <button class="right" type="button" data-joy="8" aria-label="Right">▶</button>
      <button class="down" type="button" data-joy="2" aria-label="Down">▼</button>
    </div>
    <button id="touch-fire" type="button" aria-label="Fire">FIRE</button>
  </div>
</section>
<div class="toolbar">
  <button id="fullscreen" type="button">Fullscreen</button>
  <button id="reset-score" class="danger" type="button">Reset best score</button>
  <button id="sound-retry" class="quiet" type="button" hidden>Sound unavailable — click to retry</button>
</div>
<p id="status" class="status-line" role="status" aria-live="polite"></p>
<p id="save-status" class="status-line" aria-live="polite"></p>
<noscript><p class="note">The game needs JavaScript and WebAssembly.</p></noscript>
<p id="safari-note" class="note" hidden></p>

<div class="columns">
  <section class="panel" aria-labelledby="controls-title">
    <h2 id="controls-title">Controls</h2>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th><th>Touch</th></tr></thead>
        <tbody>
          ${rows}
          <tr><td>RESET (restart the machine)</td><td><kbd>F5</kbd></td><td>—</td><td>—</td></tr>
        </tbody>
      </table>
    </div>
    <p class="muted">Click the game screen, or move to it with <kbd>Tab</kbd>, to give it the keyboard; <kbd>Tab</kbd> again leaves it. The touch controls appear on touch screens; the game is best with a keyboard or gamepad.</p>
  </section>
  <section class="panel" aria-labelledby="about-title">
    <h2 id="about-title">About the game</h2>
    <p>${esc(game.description)}</p>
    <p class="muted">${esc(game.studio)} · ${esc(game.year)} · ${esc(game.status)}</p>
    <p><a href="${esc(game.links.repo)}">Source code</a> · <a href="${esc(game.links.releases)}">Releases</a>${game.links.howToPlay ? ` · <a href="${esc(game.links.howToPlay)}">How to play</a>` : ""}</p>
    <p class="muted">${game.saves === "disk" ? "The game saves its best scores on its own disk; this site keeps that disk in your browser. A new version of the game starts with a fresh disk. " : ""}Licence: ${esc(game.licence.summary)} ${esc(game.licence.credit)}. <a href="../../credits/">Credits &amp; licences</a>.</p>
  </section>
</div>
<script type="application/json" id="game-data">${data}</script>`,
    scripts: `<script type="module" src="../../assets/js/player.js"></script>`,
  });
}

export function creditsPage(games, emulator) {
  const gameBlocks = games.map((g) => `<h3>${esc(g.title)}</h3>
<p>${esc(g.licence.credit)}. ${esc(g.licence.summary)} <a href="${esc(g.licence.url)}">Licence</a> · <a href="${esc(g.links.repo)}">Source</a> · disk: <a href="${esc(g.links.releases)}">release ${esc(g.disk.tag)}</a>, SHA-256 <code>${esc(g.disk.sha256)}</code>.</p>`).join("\n");
  return layout({
    title: `Credits & licences · ${SITE}`,
    description: "Credits and licences of the Setech Arcade, its emulator and its games.",
    root: "../",
    body: `<div class="prose">
<h1>Credits &amp; licences</h1>
<h2>Games</h2>
${gameBlocks}
<h2>Emulator: atari800 ${esc(emulator.version)}</h2>
<p>The games run in <a href="https://atari800.github.io/">atari800</a>, the Atari 8-bit emulator by the Atari800 Development Team, compiled to WebAssembly for this site. atari800 is free software under the <a href="../emulator/COPYING.txt">GNU General Public License, version 2 or later</a>.</p>
<p>Corresponding source: <a href="../emulator/${esc(emulator.tarball)}">${esc(emulator.tarball)}</a> (the exact release tarball the build used, SHA-256 <code>${esc(emulator.sha256)}</code>), plus <a href="../emulator/wasm-glue.c">wasm-glue.c</a> and <a href="../emulator/build.sh">build.sh</a>, built with Emscripten ${esc(emulator.emsdk)}.</p>
<p>The Emscripten runtime inside <code>atari800.js</code> is under the MIT and University of Illinois/NCSA licences (<a href="../emulator/EMSCRIPTEN-LICENSE.txt">text</a>).</p>
<h2>Operating system: AltirraOS</h2>
<p>The emulated machine runs AltirraOS 3.49 and Altirra BASIC 1.59, the open replacements for the Atari ROMs written by Avery Lee for <a href="https://www.virtualdub.org/altirra.html">Altirra</a> and built into atari800:</p>
<pre>Altirra - Atari 800/800XL emulator
Kernel ROM replacement
Copyright (C) 2008-2018 Avery Lee (AltirraOS); Copyright (C) 2008-2022 Avery Lee (Altirra BASIC)

Copying and distribution of this file, with or without modification,
are permitted in any medium without royalty provided the copyright
notice and this notice are preserved.  This file is offered as-is,
without any warranty.</pre>
<h2>This site</h2>
<p>The site's own code is under the <a href="../LICENSE.txt">MIT licence</a>. All notices: <a href="../THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>.</p>
<p>Atari is a trademark of its owner; this site is not affiliated with or endorsed by Atari. The names of the games and of Setech Game Studio belong to Setech Game Studio.</p>
</div>`,
  });
}
