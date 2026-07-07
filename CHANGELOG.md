# Changelog

All notable changes to this fork are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project
adheres to [Semantic Versioning](https://semver.org/).

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
