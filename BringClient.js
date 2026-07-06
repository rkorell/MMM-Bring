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
 */

const fs = require("fs");
const path = require("path");

// --- Endpoints & constants -------------------------------------------------
const API_BASE = "https://api.getbring.com/rest/";
const WEB_LOCALE_BASE = "https://web.getbring.com/locale/";
const ITEM_IMAGE_BASE = "https://web.getbring.com/assets/images/items/";
const API_KEY = "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp";

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
        this.store = this._loadStore();
        // in-memory caches for the static public locale files
        this._catalogCache = {};
        this._articlesCache = {};
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
                listArticleLanguage: kv.listArticleLanguage || null
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
        try {
            catalog = await this.getCatalog(locale);
            articles = await this.getArticles(locale);
        } catch (e) {
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

        const enrich = (apiItem) => {
            const itemId = apiItem.itemId;
            const detail = detailById[itemId];
            let sectionId = detail && detail.userSectionId ? detail.userSectionId : null;
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

        const sections = [];
        const purchaseSorted = [];
        const emitted = new Set();
        for (const sid of order) {
            if (hidden.has(sid) || !bySection[sid]) continue;
            emitted.add(sid);
            sections.push({ sectionId: sid, name: sectionName(sid), items: bySection[sid] });
            purchaseSorted.push(...bySection[sid]);
        }
        // any section not covered by listSectionOrder (safety net, keeps items visible)
        for (const sid of Object.keys(bySection)) {
            if (emitted.has(sid) || hidden.has(sid)) continue;
            sections.push({ sectionId: sid, name: sectionName(sid), items: bySection[sid] });
            purchaseSorted.push(...bySection[sid]);
        }

        return {
            uuid: listId,
            name: this.store["list_name_" + listId] || listName || "",
            purchase,        // raw API order (for useSections: "off")
            purchaseSorted,  // section-ordered flat list (for useSections: "on")
            sections,        // grouped + ordered (for useSections: "show")
            recently
        };
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
