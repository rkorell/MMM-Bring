/* MagicMirror Module: MMM-Bring — MMM-Bring.js (frontend)
 *
 * Pure display: sends its config once and renders whatever the backend delivers.
 * Fork by Dr. Ralf Korell — original by David Werth.
 *
 * # Modified: 2026-07-06 21:41 - v2.0.0: pure-display frontend, useSections render, batch mutate.
 * # Modified: 2026-07-06 22:44 - QA: register dropdown-close listener once (no leak); list names via textContent.
 * # Modified: 2026-07-06 23:06 - QA2: set background via style.backgroundColor; strict equality.
 */
/*jshint esversion: 6 */
Module.register("MMM-Bring", {

    defaults: {
        email: "",
        password: "",
        updateInterval: 15,
        listName: undefined,
        showListName: true,
        activeItemColor: "#EE524F",
        latestItemColor: "#4FABA2",
        showLatestItems: false,
        maxItems: 0,
        maxLatestItems: 0,
        locale: "de-DE",
        useKeyboard: false,
        customTitle: undefined,
        listDropdown: true,
        // "off" = raw list, "on" = sort by section (no headers), "show" = grouped with headers
        useSections: "on"
    },

    getStyles: function () {
        return [this.file('css/styles.css')];
    },

    start: function () {
        this.currentList = null;
        this.lists = [];
        this.sendSocketNotification("START_BRING_POLL", this.config);
        // Close the list dropdown on any outside click. Registered ONCE here — attaching this
        // inside getDom() would add a new listener on every re-render (leak).
        document.addEventListener("click", (event) => {
            if (!event.target.matches(".bring-titleBtn")) {
                const dropDown = document.getElementById("bring-dropItems");
                if (dropDown && dropDown.classList.contains("show")) {
                    dropDown.classList.remove("show");
                }
            }
        });
    },

    createDropDown: function () {
        const drop = document.createElement("div");
        drop.className = "bring-dropdown-title";
        const titleBtn = document.createElement("input");
        titleBtn.setAttribute("type", "button");
        titleBtn.className = "bring-titleBtn bright";
        titleBtn.value = this.config.listName + " ⯆";
        titleBtn.addEventListener("click", function () {
            document.getElementById("bring-dropItems").classList.toggle("show");
        });
        const dropList = document.createElement("div");
        dropList.id = "bring-dropList";
        const dropItems = document.createElement("div");
        dropItems.id = "bring-dropItems";
        var self = this;
        for (var i = 0; i < this.lists.length; i++) {
            var dropItem = document.createElement("div");
            dropItem.className = "bring-dropItem";
            dropItem.textContent = this.lists[i].name;
            dropItem.addEventListener("click", function () {
                self.config.listName = this.textContent;
                self.sendSocketNotification("START_BRING_POLL", self.config);
            });
            dropItems.appendChild(dropItem);
        }
        dropList.appendChild(dropItems);
        drop.appendChild(titleBtn);
        drop.appendChild(dropList);
        return drop;
    },

    // Build a single item card. `markPurchased` = what a click means for THIS item.
    buildItemEl: function (item, color, markPurchased) {
        const el = document.createElement("div");
        el.className = "bring-list-item-content";
        el.style.backgroundColor = color;
        el.onclick = () => this.itemClicked(item, markPurchased);

        const upperPartContainer = document.createElement("div");
        upperPartContainer.className = "bring-list-item-upper-part-container";
        const imageContainer = document.createElement("div");
        imageContainer.className = "bring-list-item-image-container";
        const image = document.createElement("img");
        image.src = item.imageSrc;
        imageContainer.appendChild(image);
        upperPartContainer.appendChild(imageContainer);
        el.appendChild(upperPartContainer);

        const itemTextContainer = document.createElement("div");
        itemTextContainer.className = "bring-list-item-text-container";
        const itemName = document.createElement("span");
        itemName.className = "bring-list-item-name";
        itemName.innerText = item.name;
        itemTextContainer.appendChild(itemName);
        const itemSpec = document.createElement("span");
        itemSpec.className = "bring-list-item-specification-label";
        itemSpec.innerText = item.specification;
        itemTextContainer.appendChild(itemSpec);
        el.appendChild(itemTextContainer);

        return el;
    },

    buildAddButton: function () {
        const bringListAdd = document.createElement("div");
        bringListAdd.className = "bring-list-item-add";
        bringListAdd.innerHTML = "+";
        bringListAdd.onclick = () => this.openKeyboard();
        return bringListAdd;
    },

    getDom: function () {
        // hide when there is nothing to show
        if (!this.currentList ||
            ((!this.currentList.purchase || this.currentList.purchase.length === 0) &&
                !this.config.showLatestItems)) {
            return document.createElement("span");
        }

        const container = document.createElement("div");
        container.className = "bring-list-container bring-" + this.data.position;

        if (!!this.config.customTitle) {
            const headerElem = document.createElement("header");
            headerElem.className = "module-header";
            headerElem.innerText = this.config.customTitle + " (" + (this.currentList.purchase || []).length + ")";
            container.appendChild(headerElem);
        }

        if (this.config.showListName && this.currentList && this.currentList.name) {
            if (this.config.listDropdown && (!!this.lists && this.lists.length > 1)) {
                const dropTitle = this.createDropDown();
                container.appendChild(dropTitle);
            } else {
                const title = document.createElement("h3");
                title.innerText = this.config.listName;
                container.appendChild(title);
            }
        }

        // --- Purchase area ---
        this.renderPurchase(container);

        // --- Recently bought area (unchanged behaviour) ---
        if (this.config.showLatestItems && this.currentList && this.currentList.recently) {
            const bringListRecent = document.createElement("div");
            bringListRecent.className = "bring-list";
            let max = this.currentList.recently.length;
            if (this.config.maxLatestItems !== 0 && max > this.config.maxLatestItems) {
                max = this.config.maxLatestItems;
            }
            for (let i = 0; i < max; i++) {
                bringListRecent.appendChild(
                    this.buildItemEl(this.currentList.recently[i], this.config.latestItemColor, false));
            }
            container.appendChild(bringListRecent);
        }

        return container;
    },

    renderPurchase: function (container) {
        const mode = this.config.useSections;
        const limit = (items) => {
            if (this.config.maxItems !== 0 && items.length > this.config.maxItems) {
                return items.slice(0, this.config.maxItems);
            }
            return items;
        };

        let lastList = null;

        if (mode === "show" && this.currentList.sections && this.currentList.sections.length) {
            // grouped: one header + one .bring-list per section, capped over the total
            let remaining = this.config.maxItems === 0 ? Infinity : this.config.maxItems;
            for (const section of this.currentList.sections) {
                if (remaining <= 0) break;
                const header = document.createElement("div");
                header.className = "bring-section-header";
                header.innerText = section.name;
                container.appendChild(header);

                const listEl = document.createElement("div");
                listEl.className = "bring-list";
                for (const item of section.items) {
                    if (remaining <= 0) break;
                    listEl.appendChild(this.buildItemEl(item, this.config.activeItemColor, true));
                    remaining--;
                }
                container.appendChild(listEl);
                lastList = listEl;
            }
        } else {
            // flat: "on" uses the section-sorted order, "off" the raw order
            const source = (mode === "on" && this.currentList.purchaseSorted)
                ? this.currentList.purchaseSorted
                : (this.currentList.purchase || []);
            const items = limit(source);
            const listEl = document.createElement("div");
            listEl.className = "bring-list";
            for (const item of items) {
                listEl.appendChild(this.buildItemEl(item, this.config.activeItemColor, true));
            }
            container.appendChild(listEl);
            lastList = listEl;
        }

        if (this.config.useKeyboard && lastList) {
            lastList.appendChild(this.buildAddButton());
        }
    },

    openKeyboard: function () {
        this.sendNotification("KEYBOARD", {key: "mmm-bring", style: "default"});
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "LIST_DATA") {
            this.currentList = payload.currentList;
            this.lists = payload.lists;
            if (!this.config.listName && this.currentList) {
                this.config.listName = this.currentList.name;
            }
            this.updateDom(1000);
        }
    },

    notificationReceived: function (notification, payload) {
        if (notification === "KEYBOARD_INPUT" && payload.key === "mmm-bring" && payload.message !== '') {
            const name = payload.message[0].toUpperCase() + payload.message.substring(1);
            // new custom item -> add to the "to buy" list (TO_PURCHASE)
            this.sendSocketNotification("BRING_MUTATE", { itemId: name, spec: "", markPurchased: false });
        } else if (notification === "HIDE_SHIPPING") {
            this.hide(1000, {lockString: "LOCKEDBYMODULE"});
        } else if (notification === "SHOW_SHIPPING") {
            this.show(1000, {lockString: "LOCKEDBYMODULE"});
        }
    },

    // markPurchased: true  = item is on the buy-list, a click marks it bought (TO_RECENTLY)
    //                false = item is in "recently", a click puts it back on the list (TO_PURCHASE)
    itemClicked: function (item, markPurchased) {
        this.sendSocketNotification("BRING_MUTATE", {
            itemId: item.itemId,
            spec: item.specification || "",
            uuid: item.uuid,
            markPurchased: markPurchased
        });
    }

});
