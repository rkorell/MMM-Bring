# Changelog

All notable changes to this fork are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [3.0.0] — 2026-11-23

No breaking changes — without a local catalog the module behaves exactly as before.

### Added
- **Local catalog (optional).** Bring!'s public web catalog, which the module used so far, has not been updated
  since 2021, so newer articles (e.g. "Handschuhe") showed up as *own items* with a letter icon. The new
  `tools/import-catalog.js` reads the current catalog — sections, article names and icons, all 20 languages — from
  a Bring! app package you own (Android `base.apk` or iOS `.ipa`) and writes it to `catalog-local/` in the module
  folder. When present, the module uses it per language instead of the web catalog: categories, names and icons
  then match the app, including the letter icon for articles without an own icon.
  `node tools/import-catalog.js --remove` deletes it again. See *Local catalog* in the README.
- **Fixed:** root cause of [#1](https://github.com/rkorell/MMM-Bring/issues/1). The diagnostic report showed
  that Bring! had stored the list's section order with "Eigene Artikel" twice; the module emitted that section
  once per entry. Duplicate entries in the section order are now ignored, so the consistency check from 2.1.1
  no longer has to repair (and report) this case.
- One log line per language naming the catalog in use, e.g.
  `MMM-Bring: catalog = local, de-DE, 604 items, CATALOG.VERSION 10, imported 2026-11-23` or
  `MMM-Bring: catalog = web (web.getbring.com), de-DE`.

Update: `git pull`

## [2.1.1] — 2026-11-23

### Fixed
- With `useSections` `"on"` or `"show"`, items of one section could appear twice
  ([#1](https://github.com/rkorell/MMM-Bring/issues/1)). The sorted list is now checked after every refresh: each
  item that is not in a hidden section must appear exactly once. On a violation the display is repaired (repeats
  dropped, missing items appended) and a full diagnostic report is written to
  `diagnostics/inconsistency-<list name>.json` in the module folder (overwritten when the list data change); one
  log line points to it. Please attach that file to the issue. It contains list and item names, no credentials.

Update: `git pull`

## [2.1.0] — 2026-07-07

### Added
- `showCount` (default `true`): a title-line count indicator, shown only when the purchase list is longer than
  `maxItems`. Appended to the title as ` (total)` (e.g. `Home (11)`), or shown standalone as `...[maxItems/total]`
  (e.g. `...[8/11]`) when there is no title.

### Changed
- The `customTitle` item count now follows `showCount` (only shown when the list is truncated) instead of being
  appended unconditionally.

### Docs
- README: locale-neutral wording (no German section names or fallback label in the English text); the *own items*
  label is documented as localized per `locale`; `customTitle`'s count behaviour is documented; install/update
  steps corrected (zero-dependency — no `npm install`); added a *Migrating from the original module* section;
  credited [miaucl/bring-api](https://github.com/miaucl/bring-api) as inspiration; moved the Museo Sans font
  attribution into the `LICENSE` file and linked it from the README.

## [2.0.0] — 2026-07-06

Complete rewrite of the [rkorell/MMM-Bring](https://github.com/rkorell/MMM-Bring) fork of David
Werth's original module. Modernised for current MagicMirror / Node versions, with app-identical
category grouping.

### Added
- **App-identical category grouping** via new config `useSections: "off" | "on" | "show"`
  (`off` = raw order, `on` = sorted into the app's section order without headers, `show` = with
  category headers). Grouping/order follows the list's own `listSectionOrder`, honours
  `hiddenSections`, language from `listArticleLanguage`.
- **Localized "own items" fallback section** — standard `translations/` files, one `OWN_ITEMS`
  key, covering all 20 supported locales (13 languages), selected by the `locale` config.
- **Backend-driven polling** with a cached last-good payload, so a browser reload shows data
  instantly and a transient network error never blanks the list.
- **Refresh-token authentication** (password re-login only as a fallback).
- `.bring-section-header` styling for the `show` mode; README screenshots of all three modes.

### Changed
- **Zero runtime dependencies**: replaced `axios` and `data-store` with native `fetch` +
  `AbortController` (Node ≥ 18) and a small `fs` JSON token store.
- Frontend is now a **pure display**; the node helper owns the poll cycle and builds the grouped model.
- Mutations use the modern batch endpoint `v2/bringlists/{uuid}/items`; `itemId` is kept canonical
  (fixes marking/adding items whose display name is translated).
- Section and item names are localized via `catalog.<locale>.json` / `articles.<locale>.json`.
- Slimmed `.gitignore`; MIT copyright updated for the fork.

### Removed
- `axios ^0.21.2` (2 high-severity CVEs) and its `follow-redirects` transitive dependency.
- `data-store` dependency.
- Paid *Museo Sans 300* font weight (kept the free 500 with exljbris attribution); the
  specification label now uses *Roboto Condensed*.

### Fixed
- **Event-listener leak**: the dropdown's outside-click handler was attached inside `getDom()`,
  adding a new global listener on every re-render; it is now registered once in `start()`.
- `getImageSrc` no longer stringifies the whole article catalog per item (computed once per refresh).
- Parameter shadowing of the `path` module inside the request helper.
- List names are rendered via `textContent` instead of `innerHTML`.
- Removed dead `_get`/`_set` helpers and a duplicate CSS `border-radius`.
- Guards against a mutation arriving before init and against overlapping poll cycles.
- A refresh requested mid-cycle (e.g. right after a mutation) is no longer dropped — it runs as
  soon as the running poll finishes (`pendingPoll`).
- Cold-start resilience: if the public locale catalog is briefly unreachable, the list still
  renders ungrouped instead of the whole refresh failing.

### Security
- Locale codes are validated before being used in file paths / URLs.
- Dictionaries keyed by API data use null-prototype objects (no `__proto__`/`constructor` key hazards).
- No credentials in the repository; the auth-token cache (`bring.config.json`) is gitignored and
  written with mode `0600` (enforced on every save).

---

Earlier history: this fork is based on [werthdavid/MMM-Bring](https://github.com/werthdavid/MMM-Bring)
1.0.0. Changes before the fork are not tracked here.
