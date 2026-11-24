#!/usr/bin/env node
/* MagicMirror Module: MMM-Bring — tools/import-catalog.js
 *
 * Builds a local article catalog for MMM-Bring from a Bring! app package you own:
 *   - Android: the app's base.apk
 *   - iOS:     the app's .ipa
 *
 * Why: the public web catalog the module uses by default (web.getbring.com/locale/) has not been
 * updated since 2021, so newer articles show up as "own items" with a letter icon. The app itself
 * ships the current catalog; this script reads it from the package and writes it next to the module.
 *
 * Usage (inside the module folder):
 *   node tools/import-catalog.js /path/to/base.apk
 *   node tools/import-catalog.js /path/to/bring.ipa
 * then restart MagicMirror.
 *   node tools/import-catalog.js --remove
 * deletes the local catalog again; after a restart the module uses the web catalog as before.
 *
 * Requirements: `unzip`, or on Windows the built-in `tar.exe` (both packages);
 *               `carfile` (iOS only, unpacks the icon archive Assets.car) — in this tools/ folder or in PATH.
 * Output:       catalog-local/ in the module folder (replaced as a whole on every run).
 * The generated files contain Bring!'s data — for your own mirror only, do not redistribute.
 *
 * # Modified: 2026-11-23 18:10 - First draft for review.
 * # Modified: 2026-11-23 19:25 - Icon-name rule moved to ../iconName.js (shared with BringClient); --remove.
 * # Modified: 2026-11-23 20:45 - bsdtar (Windows tar.exe) as alternative to unzip; carfile also found in tools/.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// The icon file-name rule ("WC-Papier" -> "wc_papier"), shared with BringClient.js.
const iconName = require("../iconName");

// --- Settings -------------------------------------------------------------------------------------
// Where the result goes: <module folder>/catalog-local. The script lives in <module folder>/tools.
const MODULE_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(MODULE_DIR, "catalog-local");

// Upper bounds for anything we read out of the package. A catalog file is ~20 KB and the icon
// archive ~9 MB; anything far beyond that is not a Bring! package and is rejected instead of read.
const MAX_TEXT_ENTRY = 2 * 1024 * 1024;
const MAX_ICON_ARCHIVE = 64 * 1024 * 1024;
const MAX_LISTING = 64 * 1024 * 1024;

// Plausibility floor per language. The current app has 13 sections and 500-600 articles per
// language; much less means the format changed and we would write a broken catalog.
const MIN_SECTIONS = 5;
const MIN_ITEMS = 100;

// The iOS package names its language folders by language only ("de", "fr") or language-region
// ("de-AT"). The module uses language-region codes, so bare languages get their main region here.
const IOS_LANGUAGE_DEFAULTS = {
    de: "de-DE", en: "en-US", es: "es-ES", fr: "fr-FR", hu: "hu-HU", it: "it-IT", nb: "nb-NO",
    nl: "nl-NL", pl: "pl-PL", pt: "pt-BR", ru: "ru-RU", sv: "sv-SE", tr: "tr-TR"
};

// --- Small helpers --------------------------------------------------------------------------------

// Stop with a message the user can act on. Nothing has been written to the module at this point,
// because the output is only moved into place at the very end.
function fail(message) {
    console.error("import-catalog: " + message);
    process.exit(1);
}

// Check that an external program exists by running its version switch; say which README section
// explains the installation if it doesn't.
function requireTool(command, versionArg, hint) {
    try {
        execFileSync(command, [versionArg], { stdio: "ignore" });
    } catch (e) {
        fail(`'${command}' not found. ${hint}`);
    }
}

// Which program reads the package (an app package is a ZIP file):
//   "unzip" — Linux and Mac;
//   "tar"   — only if it is bsdtar, which reads ZIP files too: Windows 10/11 ship it as tar.exe.
//             (GNU tar on Linux cannot read ZIP files, so it is not accepted.)
function pickArchiveTool() {
    try {
        execFileSync("unzip", ["-v"], { stdio: "ignore" });
        return "unzip";
    } catch (e) { /* no unzip — try tar */ }
    try {
        if (/bsdtar/.test(execFileSync("tar", ["--version"]).toString())) return "tar";
    } catch (e) { /* no tar either */ }
    fail(process.platform === "win32"
        ? "neither 'unzip' nor Windows' own 'tar.exe' found (tar.exe is part of Windows 10 and 11)."
        : "'unzip' not found. Install it with: sudo apt install unzip");
}
let ARCHIVE_TOOL = null; // set in main()

// Both tools treat entry names as patterns (*, ?, [ ]). Escape those so an entry name is always
// taken literally.
function literal(entryName) {
    return entryName.replace(/[*?[\]]/g, "\\$&");
}

// List all entry names of the package without extracting anything (folders are left out).
function listEntries(archive) {
    const out = ARCHIVE_TOOL === "unzip"
        ? execFileSync("unzip", ["-Z1", archive], { maxBuffer: MAX_LISTING })
        : execFileSync("tar", ["-tf", archive], { maxBuffer: MAX_LISTING });
    return out.toString("utf8").split(/\r?\n/).filter(e => e && !e.endsWith("/"));
}

// Read one entry straight into memory. Nothing is written to disk under a name taken from the
// archive, so a crafted package cannot place files outside our folders. maxBuffer is the size cap.
function readEntry(archive, entryName, limit) {
    try {
        return ARCHIVE_TOOL === "unzip"
            ? execFileSync("unzip", ["-p", archive, literal(entryName)], { maxBuffer: limit })
            : execFileSync("tar", ["-xOf", archive, literal(entryName)], { maxBuffer: limit });
    } catch (e) {
        fail(`cannot read '${entryName}' from the package (${e.code || e.message}).`);
    }
}

// Extract all .webp files of one archive folder into targetDir and return the folder they landed in.
// unzip -j drops the archive's folder names; bsdtar keeps them but refuses ".." and absolute paths,
// so both stay inside targetDir.
function extractWebps(archive, folder, targetDir) {
    if (ARCHIVE_TOOL === "unzip") {
        execFileSync("unzip", ["-q", "-j", archive, literal(folder) + "/*.webp", "-d", targetDir], { maxBuffer: MAX_LISTING });
        return targetDir;
    }
    execFileSync("tar", ["-xf", archive, "-C", targetDir, literal(folder) + "/*.webp"], { maxBuffer: MAX_LISTING });
    return path.join(targetDir, folder);
}

// carfile is looked for in this tools/ folder first (no PATH setup needed), then in PATH.
function carfileCommand() {
    const local = path.join(__dirname, process.platform === "win32" ? "carfile.exe" : "carfile");
    return fs.existsSync(local) ? local : "carfile";
}

// --- Parsers for the text formats -----------------------------------------------------------------

// Android "Articles.strings" is a Java properties file: one "key=value" per line, "#" comments,
// backslash escapes ("Saure\ Sahne", "ä"), a trailing backslash continues the line.
function parseProperties(text) {
    const result = {};
    const lines = text.replace(/\\\r?\n[ \t]*/g, "").split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trimStart();
        if (!line || line[0] === "#" || line[0] === "!") continue;
        // the key ends at the first "=" or ":" that is not escaped
        let i = 0;
        while (i < line.length && !((line[i] === "=" || line[i] === ":") && line[i - 1] !== "\\")) i++;
        if (i >= line.length) continue;
        result[unescapeJava(line.slice(0, i).trim())] = unescapeJava(line.slice(i + 1).trim());
    }
    return result;
}

function unescapeJava(s) {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\t/g, "\t").replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
}

// iOS "Articles.strings" is the Apple strings format: "key" = "value"; with /* */ or // comments
// and backslash escapes inside the quotes. Spaces around "=" are optional.
function parseAppleStrings(text) {
    const result = {};
    const body = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const pair = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
    let m;
    while ((m = pair.exec(body)) !== null) result[unescapeApple(m[1])] = unescapeApple(m[2]);
    return result;
}

function unescapeApple(s) {
    return s.replace(/\\U([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(.)/g, "$1");
}

// iOS "bringItems.plist" is an XML property list: an array of dicts, each with a section name and an
// array of article ids. We only need those two fields, so a targeted pattern is enough.
function parseSectionsPlist(text) {
    const xml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const sections = [];
    const dict = /<key>(?:sectionName|sectionId)<\/key>\s*<string>([^<]*)<\/string>\s*<key>items<\/key>\s*<array>([\s\S]*?)<\/array>/g;
    let m;
    while ((m = dict.exec(text)) !== null) {
        const items = [...m[2].matchAll(/<string>([^<]*)<\/string>/g)].map(x => xml(x[1]));
        sections.push({ sectionId: xml(m[1]), items });
    }
    return sections;
}

// --- Reading an Android package -------------------------------------------------------------------

// Catalog: assets/catalog/<LL_RR>/bringItems.json (sections) + Articles.strings (display names).
// Icons:   res/drawable-<density>/<name>.webp, named by the same rule as iconName().
function readApk(archive, entries, workDir) {
    const languages = {};
    for (const entry of entries) {
        const m = entry.match(/^assets\/catalog\/([A-Z]{2})_([A-Z]{2})\/bringItems\.json$/);
        if (!m) continue;
        const folder = `assets/catalog/${m[1]}_${m[2]}/`;
        const locale = `${m[1].toLowerCase()}-${m[2]}`;
        let sections;
        try {
            sections = JSON.parse(readEntry(archive, entry, MAX_TEXT_ENTRY).toString("utf8"));
        } catch (e) {
            fail(`${entry} is not valid JSON — the app's catalog format may have changed.`);
        }
        const articles = entries.includes(folder + "Articles.strings")
            ? parseProperties(readEntry(archive, folder + "Articles.strings", MAX_TEXT_ENTRY).toString("utf8"))
            : {};
        // CATALOG.VERSION is the content revision of this language's catalog (8-11 in app 4.96.1),
        // not a format version — kept per language for the module's log line.
        const catalogVersion = entries.includes(folder + "CATALOG.VERSION")
            ? readEntry(archive, folder + "CATALOG.VERSION", 1024).toString("utf8").trim()
            : null;
        languages[locale] = { sections, articles, catalogVersion };
    }

    // Pick the drawable folder that holds the most article icons (today: drawable-xhdpi-v4) and
    // extract only its .webp files into our temporary folder.
    const wanted = wantedIconNames(languages);
    const byFolder = {};
    for (const entry of entries) {
        const m = entry.match(/^(res\/drawable[^/]*)\/([^/]+)\.webp$/);
        if (m && wanted.has(m[2])) byFolder[m[1]] = (byFolder[m[1]] || 0) + 1;
    }
    const best = Object.keys(byFolder).sort((a, b) => byFolder[b] - byFolder[a])[0];
    const icons = {};
    if (best) {
        const target = path.join(workDir, "apk-icons");
        fs.mkdirSync(target);
        const iconDir = extractWebps(archive, best, target);
        for (const file of fs.readdirSync(iconDir)) {
            const name = path.basename(file, ".webp");
            if (wanted.has(name)) icons[name] = path.join(iconDir, file);
        }
    }
    return { source: "apk", languages, icons };
}

// --- Reading an iOS package -----------------------------------------------------------------------

// Catalog: Payload/<App>.app/BringList_BringList.bundle/<lang>.lproj/bringItems.plist + Articles.strings.
//          (The same files exist again inside the app's extensions under PlugIns/; we take the main app.)
// Icons:   the same bundle's Assets.car, Apple's compiled image archive, unpacked with carfile into
//          one folder per image ("Handschuhe/Handschuhe@2x.png").
function readIpa(archive, entries, workDir) {
    const languages = {};
    let bundle = null;
    for (const entry of entries) {
        const m = entry.match(/^(Payload\/[^/]+\.app\/BringList_BringList\.bundle)\/([^/]+)\.lproj\/bringItems\.plist$/);
        if (!m) continue;
        bundle = m[1];
        const locale = m[2].includes("-") ? m[2] : IOS_LANGUAGE_DEFAULTS[m[2]];
        if (!locale) {
            console.warn(`import-catalog: skipping unknown language folder '${m[2]}.lproj'.`);
            continue;
        }
        const sections = parseSectionsPlist(readEntry(archive, entry, MAX_TEXT_ENTRY).toString("utf8"));
        const stringsEntry = `${bundle}/${m[2]}.lproj/Articles.strings`;
        const articles = entries.includes(stringsEntry)
            ? parseAppleStrings(readEntry(archive, stringsEntry, MAX_TEXT_ENTRY).toString("utf8"))
            : {};
        languages[locale] = { sections, articles, catalogVersion: null }; // iOS ships no CATALOG.VERSION
    }

    const icons = {};
    const carEntry = bundle && `${bundle}/Assets.car`;
    if (carEntry && entries.includes(carEntry)) {
        // carfile needs a real file: write the archive under OUR name, then let carfile unpack it.
        const carFile = path.join(workDir, "Assets.car");
        const carOut = path.join(workDir, "ipa-icons");
        fs.writeFileSync(carFile, readEntry(archive, carEntry, MAX_ICON_ARCHIVE));
        execFileSync(carfileCommand(), ["-o", carOut, carFile], { stdio: "ignore" });

        // One folder per image. Prefer the @2x PNG (same size class as the Android icons), then
        // @3x, then whatever PNG/JPG is there.
        const wanted = wantedIconNames(languages);
        for (const folder of fs.readdirSync(carOut)) {
            const dir = path.join(carOut, folder);
            if (!fs.statSync(dir).isDirectory()) continue;
            const name = iconName(folder);
            if (!wanted.has(name) || icons[name]) continue;
            const files = fs.readdirSync(dir);
            const pick = files.find(f => /@2x\.png$/i.test(f)) || files.find(f => /@3x\.png$/i.test(f))
                || files.find(f => /\.png$/i.test(f)) || files.find(f => /\.jpe?g$/i.test(f));
            if (pick) icons[name] = path.join(dir, pick);
        }
    }
    return { source: "ipa", languages, icons };
}

// The icons worth keeping: one per catalog article (any language) plus the single-letter fallbacks
// the app shows for articles without an own icon (a-z, and other alphabets on iOS).
function wantedIconNames(languages) {
    const names = new Set();
    for (const lang of Object.values(languages)) {
        for (const s of (Array.isArray(lang.sections) ? lang.sections : [])) {
            for (const item of (Array.isArray(s.items) ? s.items : [])) names.add(iconName(item));
        }
    }
    return {
        has: (name) => names.has(name) || /^\p{L}$/u.test(name)
    };
}

// --- Checking what we read ------------------------------------------------------------------------

// Every language must look like a catalog: an array of sections, each with a text id and a list of
// text article ids, and enough of both. Languages that fail are dropped with a warning; if none
// survives, the package format has changed and we stop without touching the existing catalog.
function validate(result) {
    const good = {};
    for (const [locale, lang] of Object.entries(result.languages)) {
        const s = lang.sections;
        const shapeOk = Array.isArray(s) && s.every(x => x && typeof x.sectionId === "string"
            && Array.isArray(x.items) && x.items.every(i => typeof i === "string"));
        const itemCount = shapeOk ? s.reduce((n, x) => n + x.items.length, 0) : 0;
        if (!shapeOk || s.length < MIN_SECTIONS || itemCount < MIN_ITEMS) {
            console.warn(`import-catalog: skipping ${locale} — unexpected structure (${shapeOk ? s.length + " sections, " + itemCount + " items" : "wrong format"}).`);
            continue;
        }
        good[locale] = lang;
    }
    if (!Object.keys(good).length) fail("no usable catalog found in the package — the app's catalog format may have changed.");
    result.languages = good;
}

// --- Writing the result ---------------------------------------------------------------------------

// Writes into a fresh temporary folder next to the module and swaps it in at the end, so the module
// either sees the complete old catalog or the complete new one — never a half-written one.
//
// Per language, the same two files the module downloads from the web today, in the same shape:
//   catalog.<locale>.json  { "catalog": { "sections": [ { sectionId, name, items: [ { itemId, name } ] } ] } }
//   articles.<locale>.json { "<itemId or sectionId>": "<display name>", ... }
// plus icons/<iconName>.<ext> and info.json (source, version, date, counts — read for the log line).
function writeCatalog(result, packagePath) {
    const staging = fs.mkdtempSync(path.join(MODULE_DIR, ".catalog-local-"));
    const info = {
        source: result.source,
        package: path.basename(packagePath),
        importedAt: new Date().toISOString(),
        languages: {},
        icons: 0
    };

    for (const [locale, lang] of Object.entries(result.languages)) {
        const sections = lang.sections.map(s => ({
            sectionId: s.sectionId,
            name: lang.articles[s.sectionId] || s.sectionId,
            items: s.items.map(id => ({ itemId: id, name: lang.articles[id] || id }))
        }));
        fs.writeFileSync(path.join(staging, `catalog.${locale}.json`), JSON.stringify({ catalog: { sections } }));
        fs.writeFileSync(path.join(staging, `articles.${locale}.json`), JSON.stringify(lang.articles));
        info.languages[locale] = {
            sections: sections.length,
            items: sections.reduce((n, s) => n + s.items.length, 0),
            catalogVersion: lang.catalogVersion
        };
    }

    // Icons keep their original format (.webp from Android, .png/.jpg from iOS) — no conversion.
    fs.mkdirSync(path.join(staging, "icons"));
    for (const [name, file] of Object.entries(result.icons)) {
        fs.copyFileSync(file, path.join(staging, "icons", name + path.extname(file).toLowerCase()));
        info.icons++;
    }
    fs.writeFileSync(path.join(staging, "info.json"), JSON.stringify(info, null, 2));

    // Swap: old -> backup name, new -> final name, then drop the backup.
    const backup = OUTPUT_DIR + ".old";
    fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(OUTPUT_DIR)) fs.renameSync(OUTPUT_DIR, backup);
    fs.renameSync(staging, OUTPUT_DIR);
    fs.rmSync(backup, { recursive: true, force: true });
    return info;
}

// --- Removing the local catalog -------------------------------------------------------------------

// Deletes everything this script may have created in the module folder: the catalog itself, the
// backup name used during the swap, and staging folders left behind by an interrupted run.
function removeCatalog() {
    const leftovers = fs.readdirSync(MODULE_DIR)
        .filter(f => f.startsWith(".catalog-local-") || f === "catalog-local" || f === "catalog-local.old")
        .map(f => path.join(MODULE_DIR, f));
    if (!leftovers.length) {
        console.log("import-catalog: no local catalog found — nothing to remove.");
        return;
    }
    for (const dir of leftovers) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`import-catalog: local catalog removed (${leftovers.map(d => path.basename(d)).join(", ")}).`);
    console.log("import-catalog: restart MagicMirror — the module then uses the web catalog again.");
}

// --- Main -----------------------------------------------------------------------------------------

function main() {
    const packagePath = process.argv[2];
    if (!packagePath) fail("usage: node tools/import-catalog.js <base.apk | bring.ipa>  |  --remove");
    if (packagePath === "--remove") return removeCatalog();
    if (!fs.existsSync(packagePath)) fail(`file not found: ${packagePath}`);
    ARCHIVE_TOOL = pickArchiveTool();

    // Decide by content, not by file name: an Android package has assets/catalog/, an iOS package a
    // Payload/<App>.app/ folder with the BringList bundle.
    const entries = listEntries(packagePath);
    const isApk = entries.some(e => e.startsWith("assets/catalog/"));
    const isIpa = entries.some(e => /^Payload\/[^/]+\.app\/BringList_BringList\.bundle\//.test(e));
    if (!isApk && !isIpa) {
        fail("this is not a Bring! app package with a catalog. For Android use base.apk (not a split_config.*.apk).");
    }
    if (isIpa) requireTool(carfileCommand(), "--version", "It is needed for iOS packages — see tools/README.md.");

    // All intermediate files go to a private temp folder that is removed at the end, also on errors.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmm-bring-import-"));
    try {
        const result = isApk ? readApk(packagePath, entries, workDir) : readIpa(packagePath, entries, workDir);
        validate(result);
        const info = writeCatalog(result, packagePath);

        const de = info.languages["de-DE"];
        console.log(`import-catalog: source ${info.source}, ${Object.keys(info.languages).length} languages`
            + `${de ? ", de-DE " + de.items + " items" + (de.catalogVersion ? " (CATALOG.VERSION " + de.catalogVersion + ")" : "") : ""}`
            + `, ${info.icons} icons.`);
        console.log(`import-catalog: written to ${OUTPUT_DIR}`);
        console.log("import-catalog: restart MagicMirror to use it. The files contain Bring!'s data — for your own mirror only.");
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

main();
