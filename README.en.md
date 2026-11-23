<div align="center">

# dsh-bartending · Tipsy Planet 「调酒」

**A cocktail-teaching site that lives inside DSH: twelve IBA classics with recipes, techniques and a step-by-step animation stage.**

One row in the sidebar's More menu, no extra service — the panel inherits the DSH session.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/DSH-DeepSeek%20Harness-5b5ef7)](https://github.com/frankfurtlin/dsh-pocket)

[中文](README.md) · [English](README.en.md)

</div>

![Tipsy Planet inside the DSH panel](verification/shots/04-app.png)

## What it is

dsh-bartending packages **Tipsy Planet** (微醺星球), the cocktail page that used to live under the betterlife project, as a standalone DSH plugin. It adds exactly one row to the sidebar's More menu — **调酒** — and opens the site in an iframe in the main panel instead of a tab of its own. There is no second process to start and no port to open: the host half serves files from the plugin's own `app/site/`.

The site is a small reference for anyone learning to mix drinks at home: twelve recipes, three techniques, and an animated stage that shows the steps in order. It has no accounts and no ads; the only external requests are the recipe card images and the stage backdrop, which are served from a CDN (`static.frankfurtlin.top`).

Every request passes DSH's `connection.requestRejection()` first — 401 if the browser is not logged in, 403 if the Host/Origin is outside the trusted fence. The embedded page therefore reuses the DSH session; the plugin contains no authentication code of its own.

## Features

- **12 IBA classics** — Margarita, Mojito, Negroni, Old Fashioned, Manhattan, Martini, Daiquiri, Whiskey Sour, Aperol Spritz, Long Island Iced Tea, Cosmopolitan and Espresso Martini. Each recipe has its story, ingredients in ml, steps, garnish, ABV and difficulty.
- **3 techniques** — shake, stir and build, each with an equipment list and the cue that tells you it is done.
- **Animation stage** — glassware and ingredients are generated as SVG from the recipe and animated step by step; play, replay, scrub the timeline or jump to a step.
- **Two themes** — warm paper and deep night, stored in `localStorage['tipsy-theme']`. The animation stage stays dark in both.
- **Zero build** — no library CDN and no bundler; every CSS/JS file is relative and lives inside the plugin.
- **One More-menu row** — registered on `sidebar.panellist.actions` with order 40, so permanent sidebar rows keep their places.
- **Read-only and bounded** — GET/HEAD only, resolved paths must stay inside the site directory, HTML is never cached and other assets get a 5-minute cache.
- **Toolbar** — back to chat, reload, open in a new window.

## Install

```bash
# Preferred: Plugins → Add plugin → paste this repo's absolute path → Install →
# turn the switch on → reload the page. That path hot-mounts the plugin; no restart.
# Equivalent manual install:
dsh plugin --profile web add /root/workspace/plugins/dsh-bartending
# then add "dsh-bartending" to dsh.profile.bundles in the profile's package.json
systemctl restart deepseek-harness.service
```

Uninstall with `dsh plugin --profile web remove dsh-bartending` (or remove the bundle from the Plugins page) and restart DSH Web.

## Configuration

Nothing to configure, and no environment variables are read. The relevant facts are fixed in code:

- `/bartending/` serves the site. `/bartending` without the trailing slash answers 302 to `/bartending/`, because the app resolves every internal path relatively.
- The site directory is resolved from `lib/index.js`, so the plugin works from any install path.
- Cache headers: `text/html` → `no-cache`, other files → `public, max-age=300`, unknown extensions → `application/octet-stream`.

## Usage

1. Open **More** in the DSH sidebar and pick **调酒**. The main panel opens with a toolbar and the site in an iframe.
2. The home page shows the recipe grid. Click a card to enter the detail view; the route is a hash (`#/cocktail/<id>`), so the browser back button works.
3. In a detail view: play or replay the animation, drag the timeline, click a step to jump to it, toggle sound, and switch theme with the moon/sun button in the header.
4. The toolbar's **返回对话**, **刷新** and **新窗口打开** are useful while editing `app/site/`.

## Verification

The plugin ships a Playwright end-to-end check that runs inside DSH:

```bash
cd /root/workspace/plugins/dsh-bartending/verification
TOKEN=$(journalctl -u deepseek-harness --no-pager --since today | grep -o 'token=[A-Za-z0-9_-]*' | tail -1)
node verify.mjs --url "http://127.0.0.1:3080/?$TOKEN"
```

The last recorded run passed 7/7: anonymous requests get 401, the More entry exists, the 调酒 row exists, the iframe mounts, the app title renders, and the plugin produces no console errors. Screenshots land in `verification/shots/`: `02-more-menu.png` (the menu row) and `04-app.png` (the app inside the panel).

## Repository layout

```
package.json             plugin manifest (dsh.bundle.patch, dsh.client.platform=web)
cordis.patch.yml         bundle patch: insert id=dsh-bartending
lib/index.js             host half: /bartending static server, auth gate, traversal guard
client.js                client half: main panel (toolbar + iframe) and the More-menu row
app/site/                the cocktail app itself (index.html, css, js; copied from betterlife)
verification/verify.mjs  Playwright end-to-end check inside DSH
verification/shots/      screenshots from the last run (git-ignored)
```

## Known limitations

- The app's theme is independent of the DSH theme; it has its own `tipsy-theme` switch.
- The More-menu row depends on the host's `sidebar.panellist.actions` seat. If a DSH upgrade changes that seat, `client.js` has to register under the new name.
- Static assets are cached for 5 minutes, so after editing `app/site/` a hard refresh may be needed.
- The 12 card images and the stage backdrop are loaded from the CDN `static.frankfurtlin.top`; without network access the layout still works but pictures are missing.
- `app/site/` is still a copy of the betterlife page rather than the source of truth.

## Keeping the app in sync

`app/site/` is copied from betterlife. After the betterlife side changes, resync it:

```bash
rsync -a --delete /root/workspace/betterlife/app/domains/bartending/ \
  /root/workspace/plugins/dsh-bartending/app/site/
```

Once betterlife is trimmed down, delete its `app/domains/bartending/` and treat this directory as the only copy.
