/* MagicMirror Module: MMM-Bring — iconName.js
 *
 * The one file-name rule for local catalog icons, shared by tools/import-catalog.js (writes the
 * icons) and BringClient.js (looks them up), so both sides can never drift apart.
 *
 * # Modified: 2026-11-23 19:40 - Created: shared icon-name rule for the local catalog.
 */

// Lower case, German umlauts spelled out, accents removed, every run of characters that is not a
// letter or digit replaced by "_". "WC-Papier" -> "wc_papier", "Äpfel" -> "aepfel".
// NFC first: carfile delivers names in decomposed form ("A" + combining diaeresis instead of "Ä"),
// which the umlaut replacement would otherwise miss.
function iconName(itemId) {
    return String(itemId).normalize("NFC").toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

module.exports = iconName;
