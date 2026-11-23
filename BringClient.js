/* MagicMirror Module: MMM-Bring — BringClient.js
 *
 * Bring! shopping list API client.
 * Original module by David Werth (https://github.com/werthdavid/MMM-Bring).
 * Fork & rewrite by Dr. Ralf Korell (https://github.com/rkorell/MMM-Bring).
 *
 * Zero runtime dependencies: uses native fetch + AbortController (Node >= 18).
 * Auth via access_token + refresh_token; public locale catalogs need no auth.
 *
 * # Modified: 2026-07-06 21:41 - v2.0.0: axios/data-store removed, native fetch,
 *   refresh-token auth, app-identical section model (catalog + user settings).
 * # Modified: 2026-07-06 22:44 - QA: hoist image-src stringify, rename _request path param,
 *   drop dead _get/_set, validate locale, enforce store file mode 0600.
 * # Modified: 2026-07-06 23:06 - QA2: graceful catalog-fetch fallback, null-proto maps for
 *   API-keyed dicts, _webGetJson cache optional, safeLocale moved after constants.
 * # Modified: 2026-07-27 11:00 - gitleaks:allow on the public community api-key line.
 * # Modified: 2026-11-23 16:58 - Issue #1: consistency guard on the sorted list (each item exactly once),
 *   full diagnostic report on violation (diagnostics/inconsistency-<list>.json, one log line), display repaired.
 */

const fs = require("fs");
const path = require("path");

// --- Endpoints & constants -------------------------------------------------
const API_BASE = "https://api.getbring.com/rest/";
const WEB_LOCALE_BASE = "https://web.getbring.com/locale/";
const ITEM_IMAGE_BASE = "https://web.getbring.com/assets/images/items/";
const API_KEY = "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp"; // gitleaks:allow — public Bring community key, not a secret

const DEFAULT_LOCALE = "de-DE";
// Last resort only. The "own items" section is app-side (not in the catalog); its real id/label
// is normally derived from the user's own listSectionOrder — this is used only if that fails.
const DEFAULT_OWN_ITEMS_ID = "Eigene Artikel";

const HTTP_TIMEOUT = 15 * 1000;
const TOKEN_REFRESH_MARGIN = 60 * 1000; // renew token this long before expiry

// Bring! batch-operation identifiers (v2/bringlists/{uuid}/items)
const OP_TO_PURCHASE = "TO_PURCHASE"; // add to / restore onto the "to buy" list
const OP_TO_RECENTLY = "TO_RECENTLY"; // mark as bought (move to recently)
const BATCH_BASE_PARAMS = { accuracy: "0.0", altitude: "0.0", latitude: "0.0", longitude: "0.0" };

const BASE_HEADERS = {
    "X-BRING-API-KEY": API_KEY,
    "X-BRING-CLIENT": "android",
    "X-BRING-APPLICATION": "bring",
    "X-BRING-COUNTRY": "DE"
};

// Accept only well-formed locale codes (guards fs paths and URLs). Falls back to the default.
function safeLocale(loc) {
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(loc || "") ? loc : DEFAULT_LOCALE;
}

class BringClient {
    constructor(opts, modulePath) {
        this.email = opts.email;
        this.password = opts.password;
        this.locale = safeLocale(opts.locale);
        this.ownItems = this._loadOwnItemsLabel(); // localized label for the "no category" section
        this.storePath = modulePath + "/bring.config.json";
        this.diagnosticsDir = path.join(modulePath, "diagnostics"); // inconsistency reports, one file per list
        this.store = this._loadStore();
        // in-memory caches for the static public locale files
        this._catalogCache = {};
        this._articlesCache = {};
        this._reportedSig = Object.create(null); // listId -> signature of the last written inconsistency report
        this.diagContext = {};                   // set by node_helper: version + display config (report only)
    }

    // --- persistent token store (tiny fs JSON, replaces data-store) ---------
    _loadStore() {
        try {
            return JSON.parse(fs.readFileSync(this.storePath, "utf8"));
        } catch (e) {
            return {};
        }
    }

    _saveStore() {
        try {
            fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), { mode: 0o600 });
            fs.chmodSync(this.storePath, 0o600); // enforce even if the file pre-existed (holds the auth token)
        } catch (e) {
            console.error("MMM-Bring: cannot persist token store:", e.message);
        }
    }

    get userId() { return this.store.user_id; }

    get defaultListId() { return this.store.default_list_id; }

    // Localized label for the "no category" section, looked up by the module's `locale`
    // config (full locale first, then the language part). Standard MagicMirror translations/ files.
    _loadOwnItemsLabel() {
        const lang = (this.locale || "").split("-")[0];
        for (const key of [this.locale, lang]) {
            if (!key) continue;
            try {
                const data = JSON.parse(fs.readFileSync(path.join(__dirname, "translations", key + ".json"), "utf8"));
                if (data && data.OWN_ITEMS) return data.OWN_ITEMS;
            } catch (e) { /* try next candidate */ }
        }
        return DEFAULT_OWN_ITEMS_ID;
    }

    // --- low-level request helpers -----------------------------------------
    async _request(method, endpoint, { form, json, auth = true } = {}) {
        const headers = { ...BASE_HEADERS };
        let body;
        if (form) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            body = new URLSearchParams(form).toString();
        } else if (json) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(json);
        }
        if (auth && this.store.access_token) {
            headers["Authorization"] = "Bearer " + this.store.access_token;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
        try {
            const res = await fetch(API_BASE + endpoint, { method, headers, body, signal: controller.signal });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`Bring API HTTP ${res.status} on ${method} ${endpoint}: ${txt.slice(0, 200)}`);
            }
            if (res.status === 204) return null;
            const text = await res.text();
            return text ? JSON.parse(text) : null;
        } finally {
            clearTimeout(timer);
        }
    }

    async _webGetJson(fileName, cache, cacheKey) {
        if (cache && cache[cacheKey]) return cache[cacheKey];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
        try {
            const res = await fetch(WEB_LOCALE_BASE + fileName, { signal: controller.signal });
            if (!res.ok) throw new Error(`Bring locale HTTP ${res.status} on ${fileName}`);
            const data = await res.json();
            if (cache) cache[cacheKey] = data;
            return data;
        } finally {
            clearTimeout(timer);
        }
    }

    // --- authentication -----------------------------------------------------
    _tokenExpired() {
        return !this.store.access_token || !this.store.valid_until
            || Date.now() > (this.store.valid_until - TOKEN_REFRESH_MARGIN);
    }

    _persistAuth(data) {
        this.store.user_id = data.uuid;
        this.store.default_list_id = data.bringListUUID;
        this.store.access_token = data.access_token;
        if (data.refresh_token) this.store.refresh_token = data.refresh_token;
        this.store.valid_until = Date.now() + (data.expires_in * 1000);
        this._saveStore();
    }

    async login() {
        const data = await this._request("POST", "v2/bringauth", {
            auth: false,
            form: { email: this.email, password: this.password }
        });
        this._persistAuth(data);
    }

    async refresh() {
        const data = await this._request("POST", "v2/bringauth/token", {
            auth: false,
            form: { grant_type: "refresh_token", refresh_token: this.store.refresh_token }
        });
        // refresh response omits uuid/bringListUUID — keep the stored ones
        this.store.access_token = data.access_token;
        if (data.refresh_token) this.store.refresh_token = data.refresh_token;
        this.store.valid_until = Date.now() + (data.expires_in * 1000);
        this._saveStore();
    }

    async ensureAuth() {
        if (!this._tokenExpired()) return;
        if (this.store.refresh_token) {
            try {
                await this.refresh();
                return;
            } catch (e) {
                console.error("MMM-Bring: token refresh failed, falling back to login:", e.message);
            }
        }
        await this.login();
    }

    // --- lists & settings ---------------------------------------------------
    async getLists() {
        await this.ensureAuth();
        const data = await this._request("GET", "bringusers/" + this.userId + "/lists");
        const lists = data.lists || [];
        for (const l of lists) {
            this.store["list_name_" + l.listUuid] = l.name;
            this.store["list_id_" + l.name] = l.listUuid;
        }
        this._saveStore();
        return lists;
    }

    resolveListId(listName) {
        if (listName && this.store["list_id_" + listName]) {
            return this.store["list_id_" + listName];
        }
        return this.defaultListId;
    }

    // Fetched fresh on every poll so section reorders / hides in the app are followed.
    async getUserSettings() {
        const data = await this._request("GET", "bringusersettings/" + this.userId);
        const byList = Object.create(null);
        for (const uls of (data.userlistsettings || [])) {
            const kv = Object.create(null);
            for (const s of (uls.usersettings || [])) kv[s.key] = s.value;
            byList[uls.listUuid] = {
                listSectionOrder: this._safeParseArray(kv.listSectionOrder),
                hiddenSections: this._safeParseArray(kv.hiddenSections),
                listArticleLanguage: kv.listArticleLanguage || null,
                // unparsed originals, for the consistency report only
                rawListSectionOrder: kv.listSectionOrder,
                rawHiddenSections: kv.hiddenSections
            };
        }
        return byList;
    }

    _safeParseArray(value) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    // --- public locale catalogs (no auth) -----------------------------------
    async getCatalog(locale) {
        if (this._catalogCache[locale]) return this._catalogCache[locale];
        const raw = await this._webGetJson(`catalog.${locale}.json`);
        const secName = Object.create(null);
        const defaultOrder = [];
        const defaultSection = Object.create(null);
        for (const s of (raw.catalog && raw.catalog.sections ? raw.catalog.sections : [])) {
            secName[s.sectionId] = s.name;
            defaultOrder.push(s.sectionId);
            for (const it of (s.items || [])) defaultSection[it.itemId] = s.sectionId;
        }
        const model = { secName, defaultOrder, defaultSection };
        this._catalogCache[locale] = model;
        return model;
    }

    async getArticles(locale) {
        return this._webGetJson(`articles.${locale}.json`, this._articlesCache, locale);
    }

    // --- image url (original normalization; catalog haystack/keys precomputed by the caller) ---
    getImageSrc(itemId, detail, articleHaystack, articleKeysLower) {
        let name = itemId;
        if (detail && detail.userIconItemId) name = detail.userIconItemId;
        if (articleHaystack && articleHaystack.indexOf(name.toLowerCase()) === -1) {
            let found = false;
            for (const key of articleKeysLower) {
                if (itemId.toLowerCase().indexOf(key) >= 0) {
                    name = key;
                    found = true;
                    break;
                }
            }
            if (!found) name = itemId.substr(0, 1);
        }
        return ITEM_IMAGE_BASE + name
            .replace(/[.*+-?^${}()|/[\]\\]/g, "_")
            .replace(/&/g, "_")
            .replace(/\s/g, "_")
            .replace(/ä/ig, "ae")
            .replace(/ö/ig, "oe")
            .replace(/ü/ig, "ue")
            .replace(/__/g, "_")
            .replace(/__/g, "_")
            .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip combining diacritics (è, é …)
            .toLowerCase() + ".png";
    }

    // --- the full list model (app-identical grouping) -----------------------
    async getListModel(listName) {
        await this.ensureAuth();
        const listId = this.resolveListId(listName);

        const raw = await this._request("GET", "v2/bringlists/" + listId);
        const items = (raw && raw.items) || { purchase: [], recently: [] };
        const purchaseRaw = items.purchase || [];
        const recentlyRaw = items.recently || [];

        const detailsArr = await this._request("GET", "bringlists/" + listId + "/details");
        const detailById = Object.create(null);
        for (const d of (detailsArr || [])) detailById[d.itemId] = d;

        // list-specific settings (section order, hidden sections, language)
        const settings = (await this.getUserSettings())[listId] || {};
        const locale = safeLocale(settings.listArticleLanguage || this.locale);
        const sectionOrder = settings.listSectionOrder && settings.listSectionOrder.length
            ? settings.listSectionOrder : null;
        const hidden = new Set(settings.hiddenSections || []);

        // The catalogs live on a public CDN. If they are unreachable on a cold start, degrade to an
        // ungrouped view (items keep raw names/order) instead of failing the whole refresh.
        let catalog, articles;
        let catalogError = null;
        try {
            catalog = await this.getCatalog(locale);
            articles = await this.getArticles(locale);
        } catch (e) {
            catalogError = e.message;
            console.error("MMM-Bring: locale catalog unavailable, showing ungrouped:", e.message);
            catalog = { secName: Object.create(null), defaultOrder: [], defaultSection: Object.create(null) };
            articles = null;
        }
        // precomputed once here — getImageSrc would otherwise stringify the whole catalog per item
        const articleHaystack = articles ? JSON.stringify(articles).toLowerCase() : "";
        const articleKeysLower = articles ? Object.keys(articles).map(k => k.toLowerCase()) : [];

        // The "own items" fallback is not in the catalog. Its bucket/position key is derived from the
        // user's own listSectionOrder (the single entry that is not a catalog section); its DISPLAY name
        // is the localized OWN_ITEMS translation, looked up by the module's `locale`.
        const fallbackId = (sectionOrder || []).find(id => !catalog.secName[id]) || DEFAULT_OWN_ITEMS_ID;
        const sectionName = (sid) => sid === fallbackId ? this.ownItems : (catalog.secName[sid] || sid);

        const sectionSource = Object.create(null); // itemId -> "user" | "catalog" | "fallback" (report only)
        const enrich = (apiItem) => {
            const itemId = apiItem.itemId;
            const detail = detailById[itemId];
            let sectionId = detail && detail.userSectionId ? detail.userSectionId : null;
            sectionSource[itemId] = sectionId ? "user" : (catalog.defaultSection[itemId] ? "catalog" : "fallback");
            if (!sectionId) sectionId = catalog.defaultSection[itemId] || fallbackId;
            return {
                itemId, // canonical key — used for mutations (never translated)
                uuid: apiItem.uuid,
                name: (articles && articles[itemId]) || itemId, // display name
                specification: apiItem.specification || "",
                imageSrc: this.getImageSrc(itemId, detail, articleHaystack, articleKeysLower),
                sectionId
            };
        };

        const purchase = purchaseRaw.map(enrich);
        const recently = recentlyRaw.map(enrich);

        // group by section, then order by listSectionOrder (fallback: catalog order)
        const order = sectionOrder || catalog.defaultOrder;
        const bySection = Object.create(null);
        for (const it of purchase) (bySection[it.sectionId] = bySection[it.sectionId] || []).push(it);

        let sections = [];
        let purchaseSorted = [];
        const emitted = new Set();
        const trace = []; // emission steps (report only)
        for (const sid of order) {
            if (hidden.has(sid) || !bySection[sid]) continue;
            emitted.add(sid);
            trace.push({ loop: "order", sid, type: typeof sid, items: bySection[sid].length });
            sections.push({ sectionId: sid, name: sectionName(sid), items: bySection[sid] });
            purchaseSorted.push(...bySection[sid]);
        }
        // any section not covered by listSectionOrder (safety net, keeps items visible)
        for (const sid of Object.keys(bySection)) {
            if (emitted.has(sid) || hidden.has(sid)) continue;
            trace.push({ loop: "safety-net", sid, type: typeof sid, items: bySection[sid].length });
            sections.push({ sectionId: sid, name: sectionName(sid), items: bySection[sid] });
            purchaseSorted.push(...bySection[sid]);
        }

        // Consistency guard: every raw item outside a hidden section must appear exactly once in
        // purchaseSorted and in sections. On a violation, log a full report once and repair the result.
        const listDisplayName = this.store["list_name_" + listId] || listName || "";
        const expected = purchase.filter(it => !hidden.has(it.sectionId));
        const sortedCheck = this._repairFlat(purchaseSorted, expected);
        const sectionsCheck = this._repairSections(sections, expected, fallbackId, sectionName);
        if (sortedCheck.violated || sectionsCheck.violated) {
            this._reportInconsistency(listId, {
                list: { id: listId, name: listDisplayName, listArticleLanguage: settings.listArticleLanguage || null },
                rawListSectionOrder: settings.rawListSectionOrder,
                parsedListSectionOrder: (settings.listSectionOrder || []).map(v => ({ value: v, type: Array.isArray(v) ? "array" : typeof v })),
                rawHiddenSections: settings.rawHiddenSections,
                catalog: {
                    source: WEB_LOCALE_BASE, locale, error: catalogError,
                    sections: catalog.defaultOrder.length, items: Object.keys(catalog.defaultSection).length
                },
                fallbackId,
                purchaseRaw: purchaseRaw.map(i => ({ uuid: i.uuid, itemId: i.itemId, specification: i.specification || "" })),
                details: purchaseRaw.map(i => ({
                    itemId: i.itemId,
                    records: (detailsArr || []).filter(d => d.itemId === i.itemId)
                        .map(d => ({ uuid: d.uuid, userSectionId: d.userSectionId, userIconItemId: d.userIconItemId }))
                })),
                assignment: purchase.map(it => ({ uuid: it.uuid, itemId: it.itemId, sectionId: it.sectionId, source: sectionSource[it.itemId] })),
                buckets: Object.keys(bySection).map(sid => ({ sid, items: bySection[sid].map(i => i.itemId) })),
                trace,
                result: {
                    purchaseSorted: { count: purchaseSorted.length, duplicates: sortedCheck.duplicates, missing: sortedCheck.missing },
                    sections: { count: sections.length, duplicates: sectionsCheck.duplicates, missing: sectionsCheck.missing }
                }
            });
            purchaseSorted = sortedCheck.items;
            sections = sectionsCheck.sections;
        }

        return {
            uuid: listId,
            name: listDisplayName,
            purchase,        // raw API order (for useSections: "off")
            purchaseSorted,  // section-ordered flat list (for useSections: "on")
            sections,        // grouped + ordered (for useSections: "show")
            recently
        };
    }

    // --- consistency guard (report + repair) --------------------------------
    _itemKey(it) { return it.uuid || it.itemId + "|" + it.specification; }

    // Keep the first occurrence of each expected item, drop repeats, append missing ones.
    _repairFlat(list, expected) {
        const seen = new Set();
        const duplicates = [];
        const items = [];
        for (const it of list) {
            const key = this._itemKey(it);
            if (seen.has(key)) { duplicates.push(it.itemId); continue; }
            seen.add(key);
            items.push(it);
        }
        const missingItems = expected.filter(it => !seen.has(this._itemKey(it)));
        items.push(...missingItems);
        const missing = missingItems.map(it => it.itemId);
        return { items, duplicates, missing, violated: duplicates.length > 0 || missing.length > 0 };
    }

    // Same rule for the grouped view; missing items go into the own-items section.
    _repairSections(sections, expected, fallbackId, sectionName) {
        const seen = new Set();
        const duplicates = [];
        let fixed = sections.map(s => ({
            ...s,
            items: s.items.filter(it => {
                const key = this._itemKey(it);
                if (seen.has(key)) { duplicates.push(it.itemId); return false; }
                seen.add(key);
                return true;
            })
        })).filter(s => s.items.length > 0);
        const missingItems = expected.filter(it => !seen.has(this._itemKey(it)));
        if (missingItems.length) {
            const own = fixed.find(s => s.sectionId === fallbackId);
            if (own) own.items = own.items.concat(missingItems);
            else fixed = fixed.concat([{ sectionId: fallbackId, name: sectionName(fallbackId), items: missingItems }]);
        }
        const missing = missingItems.map(it => it.itemId);
        return { sections: fixed, duplicates, missing, violated: duplicates.length > 0 || missing.length > 0 };
    }

    // Write the full report to diagnostics/inconsistency-<list name>.json (overwritten when the input data
    // change) and log one line pointing to it. If the file cannot be written, the report goes to the log.
    _reportInconsistency(listId, report) {
        const signature = JSON.stringify([report.purchaseRaw, report.rawListSectionOrder, report.rawHiddenSections, report.assignment]);
        if (this._reportedSig[listId] === signature) return;
        this._reportedSig[listId] = signature;
        const content = JSON.stringify({ createdAt: new Date().toISOString(), module: this.diagContext || {}, ...report }, null, 1);
        const file = path.join(this.diagnosticsDir, "inconsistency-" + this._safeFileName(report.list.name, listId) + ".json");
        const intro = `MMM-Bring: inconsistency in list "${report.list.name}" — display repaired`;
        try {
            fs.mkdirSync(this.diagnosticsDir, { recursive: true });
            fs.writeFileSync(file, content);
            console.warn(`${intro}, report written to ${file} — please attach it to an issue at https://github.com/rkorell/MMM-Bring/issues`);
        } catch (e) {
            console.warn(`${intro}; report file not writable (${e.message}), report follows:\n${content}`);
        }
    }

    // List name as a readable file name: umlauts spelled out, everything else non-alphanumeric -> "-".
    _safeFileName(name, fallback) {
        const s = String(name || "")
            .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
            .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return s || fallback;
    }

    // --- mutations (modern batch endpoint) ----------------------------------
    async mutate(listId, { itemId, spec = "", uuid, markPurchased }) {
        await this.ensureAuth();
        const change = {
            ...BATCH_BASE_PARAMS,
            itemId,
            spec,
            operation: markPurchased ? OP_TO_RECENTLY : OP_TO_PURCHASE
        };
        if (uuid) change.uuid = uuid;
        return this._request("PUT", "v2/bringlists/" + listId + "/items", {
            json: { changes: [change], sender: "" }
        });
    }
}

module.exports = BringClient;
