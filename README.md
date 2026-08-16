# MMM-Bring

A module for [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) that displays your
[Bring!](https://www.getbring.com) shopping list — optionally **grouped by category and sorted exactly like the
Bring! app** (section order, hidden sections and language are taken from your list settings).

### The three `useSections` modes

| `"show"` — grouped with category headers | `"on"` — sorted into category order, no headers | `"off"` — raw list order |
|:---:|:---:|:---:|
| ![useSections: show](/img/readme/mmm-bring-2026-sections.png) | ![useSections: on](/img/readme/mmm-bring-2026-listtitle.png) | ![useSections: off](/img/readme/mmm-bring-2026.png) |
| Items grouped into Bring! sections with a header per category, exactly like the app. | Items sorted into the app's category order as one continuous list — no headers, no extra breaks. | The plain list in the raw order the API returns it. |

This is a fork of the original [werthdavid/MMM-Bring](https://github.com/werthdavid/MMM-Bring), modernised for
current MagicMirror / Node versions.

## What's new in 2.0.0
* **App-identical categories** — items are grouped into the same sections the Bring! app uses, ordered by your
  list's own `listSectionOrder`, honouring hidden sections; items with no category go into an *own items* section
  whose label is localized per `locale`.
* **Zero runtime dependencies** — `axios` and `data-store` removed; uses native `fetch` (Node ≥ 18).
* **Backend-driven polling** — the node helper owns the refresh cycle and caches the last good state, so a browser
  reload shows data instantly and a transient network error never blanks the list.
* **Modern auth** — access token is refreshed via `refresh_token`, with a password re-login only as fallback.

The full list of changes (including bug fixes and the security/QA pass) is in [CHANGELOG.md](CHANGELOG.md).

## Features
* Category grouping / sorting (`useSections`)
* Touch support (mark bought, add via MMM-Keyboard)
* Locale support
* Auto-layout

## Installing
```bash
cd ~/MagicMirror/modules
git clone https://github.com/rkorell/MMM-Bring.git
```
No `npm install` needed — the module has **zero runtime dependencies**. Just add the module block to your
`config.js` (see [Configuration](#configuration)).

## Updating
```bash
cd ~/MagicMirror/modules/MMM-Bring
git pull
```

## Migrating from the original module
If you already run David Werth's original `MMM-Bring` and want to switch to this fork, the simplest way is to
replace the folder — your `config.js` entry stays the same:
```bash
cd ~/MagicMirror/modules
rm -rf MMM-Bring
git clone https://github.com/rkorell/MMM-Bring.git
```
Alternatively, if you are comfortable with git, just repoint the remote (the fork shares the original's history,
so this fast-forwards):
```bash
cd ~/MagicMirror/modules/MMM-Bring
git remote set-url origin https://github.com/rkorell/MMM-Bring.git
git pull
```
The first refresh logs in again automatically (the local token cache is rebuilt).

## Configuration
```json5
{
    module: "MMM-Bring",
    position: "top_right",
    config: {
        email: "USER@EXAMPLE.COM",
        password: "SECRET",
        updateInterval: 15,       // minutes
        listName: "Home",         // optional; default = your default list
        showListName: true,
        showCount: true,          // show a count when the list is longer than maxItems
        useSections: "on",        // "off" | "on" | "show"
        activeItemColor: "#EE524F",
        latestItemColor: "#4FABA2",
        showLatestItems: false,
        maxItems: 0,
        maxLatestItems: 0,
        locale: "de-DE",
        useKeyboard: false,
        customTitle: "My shopping list", // optional
        listDropdown: true
    }
}
```

| Option            | Description |
|-------------------|-------------|
| `email`           | *Required.* Bring! account email. |
| `password`        | *Required.* Bring! account password. |
| `updateInterval`  | How often the list is reloaded. **Type:** `number` (minutes) **Default:** `15` |
| `listName`        | Name of the list to display. **Type:** `string` **Default:** your default list |
| `showListName`    | Show the list name as title. **Type:** `boolean` **Default:** `true` |
| `showCount`       | When the purchase list is longer than `maxItems`, show a count. Appended to the title as ` (total)` (e.g. `Home (11)`); if there is no title (`showListName: false` and no `customTitle`) it is shown alone as `...[maxItems/total]` (e.g. `...[8/11]`). Never shown when `maxItems: 0`. **Type:** `boolean` **Default:** `true` |
| `useSections`     | Category handling. **`"off"`** = flat list in raw order. **`"on"`** = items *sorted* into the app's section order as one continuous list, **without** headers. **`"show"`** = additionally render the category name as a header. **Type:** `string` **Default:** `"on"` |
| `activeItemColor` | Colour for items to buy. **Type:** `string` **Default:** `#EE524F` <img src="img/swatch-ee524f.svg" width="13" height="13" alt="#EE524F"> |
| `latestItemColor` | Colour for recently bought items. **Type:** `string` **Default:** `#4FABA2` <img src="img/swatch-4faba2.svg" width="13" height="13" alt="#4FABA2"> |
| `showLatestItems` | Show recently bought items. **Type:** `boolean` **Default:** `false` |
| `maxItems`        | Max items to display. **Type:** `number` **Default:** `0` (all) |
| `maxLatestItems`  | Max recent items to display. **Type:** `number` **Default:** `0` (all) |
| `locale`          | Fallback language if the list has no `listArticleLanguage`. **Type:** `string` **Default:** `de-DE` |
| `useKeyboard`     | Use together with MMM-Keyboard to add items. **Type:** `boolean` **Default:** `false` |
| `customTitle`     | Show this text as the module title (above the list name). When set, the `showCount` count is appended here instead of to the list name. **Type:** `string` **Default:** `undefined` |
| `listDropdown`    | With more than one list, show a dropdown selector. **Type:** `boolean` **Default:** `true` |

### Valid locales
`de-AT`, `de-CH`, `de-DE`, `es-ES`, `en-GB`, `en-US`, `en-CA`, `en-AU`, `fr-CH`, `fr-FR`, `it-CH`, `it-IT`,
`pt-BR`, `nl-NL`, `hu-HU`, `nb-NO`, `pl-PL`, `ru-RU`, `sv-SE`, `tr-TR`

## Notes
* **Localization.** Category names and item names are shown in your list's language (`listArticleLanguage` from
  the Bring! app, `locale` as fallback) — the module fetches the matching `catalog.<locale>.json` and
  `articles.<locale>.json`. The *own items* fallback section is not part of that catalog; its label comes from
  the module's own `translations/` files, selected by your `locale` setting.
* **Unofficial API.** Bring! provides no public API; this module uses the same internal endpoints as the app. They
  may change without notice.
* **Font.** The item name uses *Museo Sans 500* by Jos Buivenga / [exljbris](https://www.exljbris.com/museosans.html)
  (free weight; attribution as required by its licence). The specification label uses *Roboto Condensed* (the
  MagicMirror default font).

## Credits
* Original module: **David Werth** — <https://github.com/werthdavid/MMM-Bring>
* Fork & 2.0.0 rewrite: **Dr. Ralf Korell** — <https://github.com/rkorell/MMM-Bring>
* API interaction inspired by [miaucl/bring-api](https://github.com/miaucl/bring-api) (Python) as a reference for a current, state-of-the-art Bring! implementation.

## License
[MIT](LICENSE) — see the [LICENSE](LICENSE) file for the full text. The bundled font ("Museo Sans" by Jos Buivenga / exljbris) is covered by a separate free-font licence; see the [NOTICE](NOTICE) file for the required attribution.
