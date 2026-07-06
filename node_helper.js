/* MagicMirror Module: MMM-Bring — node_helper.js
 *
 * Backend: owns the poll cycle (self-rescheduling), caches the last good payload,
 * handles mutations. Frontend sends config once and is a pure display.
 * Fork by Dr. Ralf Korell — original by David Werth.
 *
 * # Modified: 2026-07-06 21:41 - v2.0.0: backend-driven polling + cache + batch mutate.
 * # Modified: 2026-07-06 22:44 - QA: guard mutate before client init; prevent overlapping polls.
 * # Modified: 2026-07-06 23:06 - QA2: pendingPoll flag (no dropped refresh); validate updateInterval.
 */

const NodeHelper = require("node_helper");
const BringClient = require("./BringClient");

const MINUTE = 60 * 1000;
const DEFAULT_UPDATE_INTERVAL_MIN = 15;
const RETRY_INTERVAL = 1 * MINUTE; // after a failed cycle, retry sooner than a full interval

module.exports = NodeHelper.create({
    start() {
        this.config = null;
        this.client = null;
        this.lists = [];
        this.lastPayload = null;
        this.pollTimer = null;
        this.polling = false;
        this.pendingPoll = false;
    },

    socketNotificationReceived(notification, payload) {
        if (notification === "START_BRING_POLL") {
            this.config = payload;
            if (!this.client) {
                this.client = new BringClient(payload, this.path);
                this.poll();
            } else {
                // browser reload / list switch: serve cache instantly, then refresh now
                if (this.lastPayload) this.sendSocketNotification("LIST_DATA", this.lastPayload);
                this.pollNow();
            }
        } else if (notification === "BRING_MUTATE") {
            this.mutate(payload);
        }
    },

    intervalMs() {
        const min = Number(this.config && this.config.updateInterval);
        return (Number.isFinite(min) && min > 0 ? min : DEFAULT_UPDATE_INTERVAL_MIN) * MINUTE;
    },

    schedule(delay) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => this.poll(), delay);
    },

    pollNow() {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.poll();
    },

    async poll() {
        if (this.polling) {
            // a cycle is already running — remember that a fresh refresh was requested
            this.pendingPoll = true;
            return;
        }
        this.polling = true;
        let ok = false;
        try {
            this.lists = await this.client.getLists();
            const currentList = await this.client.getListModel(this.config.listName);
            this.lastPayload = { lists: this.lists, currentList };
            this.sendSocketNotification("LIST_DATA", this.lastPayload);
            ok = true;
        } catch (e) {
            // keep last good payload — never blank the display on a transient error
            console.error("MMM-Bring: poll failed:", e.message);
        } finally {
            this.polling = false;
            if (this.pendingPoll) {
                this.pendingPoll = false;
                this.pollNow(); // a refresh was requested mid-cycle (e.g. after a mutation) — run it now
            } else {
                this.schedule(ok ? this.intervalMs() : RETRY_INTERVAL);
            }
        }
    },

    async mutate(payload) {
        if (!this.client) return; // a mutation cannot arrive before the first START_BRING_POLL, but guard anyway
        try {
            const listId = (this.lastPayload && this.lastPayload.currentList && this.lastPayload.currentList.uuid)
                || this.client.resolveListId(this.config.listName);
            await this.client.mutate(listId, {
                itemId: payload.itemId,
                spec: payload.spec || "",
                uuid: payload.uuid,
                markPurchased: payload.markPurchased
            });
            this.pollNow(); // reflect the change immediately
        } catch (e) {
            console.error("MMM-Bring: mutate failed:", e.message);
        }
    }
});
