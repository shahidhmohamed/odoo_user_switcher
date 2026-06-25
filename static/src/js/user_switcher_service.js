/** @odoo-module **/

import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { browser } from "@web/core/browser/browser";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { session } from "@web/session";
import { getLastConnectedUsers, user } from "@web/core/user";
import { _t } from "@web/core/l10n/translation";

const OPEN_HOTKEYS = new Set(["control+shift+u", "control+alt+u"]);
const JUST_SWITCHED_KEY = "ghori_us_just_switched";

// Saved accounts and switch order now live in the database (model
// ghori.user.switcher.account), scoped to the current user. We keep an
// in-memory cache so the rest of the (synchronous) UI logic is unchanged;
// the cache is filled once on service start and written back via RPC.
// No password is ever stored: switching uses server-side "login as".
let accountsCache = [];

function callKw(model, method, args) {
    return rpc("/web/dataset/call_kw", {
        model,
        method,
        args,
        kwargs: {},
    });
}

async function fetchAccountsFromDb() {
    try {
        const result = await callKw("ghori.user.switcher.account", "ghori_us_load", []);
        accountsCache = Array.isArray(result?.accounts) ? result.accounts : [];
    } catch {
        accountsCache = [];
    }
    return accountsCache;
}

// Whether this session may use the switcher, and whether it is currently
// impersonating (so we can offer "return to my account"). Authority comes
// from the original switcher admin, not the (possibly low-privilege) current
// user, so an impersonated test user can still switch back.
async function fetchSwitchContext() {
    try {
        const ctx = await rpc("/ghori_user_switcher/context", {});
        return {
            canSwitch: Boolean(ctx?.can_switch),
            impersonating: Boolean(ctx?.impersonating),
            impersonatorLogin: ctx?.impersonator_login || "",
            canManageAccounts: Boolean(ctx?.can_manage_accounts),
        };
    } catch {
        return {
            canSwitch: false,
            impersonating: false,
            impersonatorLogin: "",
            canManageAccounts: false,
        };
    }
}

function persistAccountsToDb(accounts) {
    const payload = accounts.map((a) => ({
        login: a.login,
        label: a.label,
        color: a.color,
    }));
    // Fire-and-forget, mirroring the old synchronous localStorage write.
    callKw("ghori.user.switcher.account", "ghori_us_save", [payload]).catch(() => {});
}

function recordSwitchHistory(login) {
    const key = normalizeLogin(login);
    if (!key) {
        return;
    }
    const now = new Date().toISOString();
    const entry = accountsCache.find((a) => normalizeLogin(a.login) === key);
    if (entry) {
        entry.lastSwitchedOn = now;
    }
}

function switchHistoryRankByLogin() {
    const rank = new Map();
    let offset = 0;
    // Most-recently-switched first, derived from the DB-backed lastSwitchedOn.
    const byRecency = [...accountsCache]
        .filter((a) => a.lastSwitchedOn)
        .sort((a, b) => String(b.lastSwitchedOn).localeCompare(String(a.lastSwitchedOn)));
    for (const account of byRecency) {
        const key = normalizeLogin(account.login);
        if (key && !rank.has(key)) {
            rank.set(key, offset++);
        }
    }
    for (const entry of getLastConnectedUsers()) {
        const key = normalizeLogin(entry?.login);
        if (key && !rank.has(key)) {
            rank.set(key, offset++);
        }
    }
    return rank;
}

function sortAccountsBySwitchHistory(accounts) {
    const rank = switchHistoryRankByLogin();
    return [...accounts].sort((a, b) => {
        const aKey = normalizeLogin(a.login);
        const bKey = normalizeLogin(b.login);
        const aRank = rank.has(aKey) ? rank.get(aKey) : Number.MAX_SAFE_INTEGER;
        const bRank = rank.has(bKey) ? rank.get(bKey) : Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) {
            return aRank - bRank;
        }
        return (a.label || a.login || "").localeCompare(b.label || b.login || "", undefined, {
            sensitivity: "base",
        });
    });
}

function uuid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function colorFromLogin(login) {
    const palette = [
        "#0d9488",
        "#2563eb",
        "#7c3aed",
        "#db2777",
        "#ea580c",
        "#059669",
        "#4f46e5",
        "#0891b2",
    ];
    let hash = 0;
    const text = login || "?";
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
}

function loadAccounts() {
    // Synchronous read from the in-memory cache (filled from DB on start/open).
    return accountsCache.map((a) => ({ ...a }));
}

function saveAccounts(accounts) {
    accountsCache = accounts.map((a) => ({ ...a }));
    persistAccountsToDb(accountsCache);
}

function normalizeLogin(login) {
    return (login || "").trim().toLowerCase();
}

function loginsMatch(a, b) {
    const left = normalizeLogin(a);
    const right = normalizeLogin(b);
    return Boolean(left) && left === right;
}

function currentLogin() {
    return user.login || "";
}

function lastConnectedByLogin() {
    const map = new Map();
    for (const entry of getLastConnectedUsers()) {
        if (entry?.login) {
            map.set(normalizeLogin(entry.login), entry);
        }
    }
    return map;
}

function enrichAccountAvatar(account) {
    if (account.isReturn) {
        return { ...account };
    }
    let partnerId = account.partnerId;
    let partnerWriteDate = account.partnerWriteDate;

    if (loginsMatch(account.login, currentLogin())) {
        partnerId = user.partnerId;
        partnerWriteDate = user.writeDate;
    } else {
        const match = lastConnectedByLogin().get(normalizeLogin(account.login));
        if (match?.partnerId) {
            partnerId = match.partnerId;
            partnerWriteDate = match.partnerWriteDate;
        }
    }

    return {
        ...account,
        label:
            account.label ||
            (loginsMatch(account.login, currentLogin()) ? user.name : account.label),
        partnerId,
        partnerWriteDate,
    };
}

function persistAvatarMetadata() {
    // Avatar metadata (partnerId / writeDate) is re-derived from
    // getLastConnectedUsers() on every open, so there is nothing to persist
    // server-side. Kept as a no-op to preserve the call sites.
    return;
}

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getOverlayRoot() {
    return document.querySelector(".ghori-us-overlay");
}

function getOverlayPanel() {
    return document.querySelector(".ghori-us-panel");
}

function getFocusableElements(container) {
    if (!container) {
        return [];
    }
    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null && !el.closest("[disabled]")
    );
}

function focusFirstInOverlay(container) {
    const focusable = getFocusableElements(container);
    if (focusable.length) {
        focusable[0].focus({ preventScroll: true });
        return;
    }
    getOverlayPanel()?.focus({ preventScroll: true });
}

function cycleTabInOverlay(ev, container) {
    const focusable = getFocusableElements(container);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!focusable.length) {
        getOverlayPanel()?.focus({ preventScroll: true });
        return;
    }
    const active = document.activeElement;
    let index = focusable.indexOf(active);
    if (index === -1 || !container?.contains(active)) {
        focusable[0].focus({ preventScroll: true });
        return;
    }
    if (ev.shiftKey) {
        const next = index <= 0 ? focusable.length - 1 : index - 1;
        focusable[next].focus({ preventScroll: true });
    } else {
        const next = index >= focusable.length - 1 ? 0 : index + 1;
        focusable[next].focus({ preventScroll: true });
    }
}

export const userSwitcherState = reactive({
    isOpen: false,
    mode: "picker",
    selectedIndex: 0,
    /** Saved accounts only (localStorage). */
    accounts: [],
    /** Carousel order: current user first, then others by switch history (MRU). */
    displayAccounts: [],
    loading: false,
    passwordAccountId: null,
    editAccountId: null,
    passwordValue: "",
    error: "",
    successMessage: "",
    /** True while logged in as someone else via an admin's impersonation. */
    impersonating: false,
    /** Login of the original admin to return to. */
    impersonatorLogin: "",
    /** May open the switcher (admin or impersonated return). */
    canSwitch: false,
    /** May add/edit/remove saved accounts (switcher admin only, not while impersonating). */
    canManageAccounts: false,
});

export const userSwitcherService = {
    dependencies: ["notification", "hotkey"],

    start(env, { notification, hotkey }) {
        /** @type {HTMLElement[]} */
        let inertTargets = [];
        let previouslyFocused = null;

        const lockBackground = () => {
            const webClient = document.querySelector(".o_web_client");
            if (webClient) {
                for (const child of [...webClient.children]) {
                    if (child.classList.contains("o-main-components-container")) {
                        for (const mcChild of [...child.children]) {
                            if (mcChild.querySelector(".ghori-us-overlay")) {
                                continue;
                            }
                            mcChild.setAttribute("inert", "");
                            mcChild.setAttribute("aria-hidden", "true");
                            inertTargets.push(mcChild);
                        }
                        continue;
                    }
                    child.setAttribute("inert", "");
                    child.setAttribute("aria-hidden", "true");
                    inertTargets.push(child);
                }
            }
            document.body.classList.add("ghori-us-open");
        };

        const unlockBackground = () => {
            for (const el of inertTargets) {
                el.removeAttribute("inert");
                el.removeAttribute("aria-hidden");
            }
            inertTargets = [];
            document.body.classList.remove("ghori-us-open");
        };

        const rebuildDisplayList = () => {
            const saved = loadAccounts().map((account) => ({
                ...account,
                color: account.color || colorFromLogin(account.login),
            }));
            userSwitcherState.accounts = saved;

            const login = currentLogin();
            const savedIdx = saved.findIndex((a) => loginsMatch(a.login, login));
            let ordered;
            if (savedIdx >= 0) {
                const current = saved[savedIdx];
                const others = sortAccountsBySwitchHistory(
                    saved.filter((_, i) => i !== savedIdx)
                );
                ordered = [current, ...others];
                userSwitcherState.selectedIndex = 0;
            } else {
                ordered = sortAccountsBySwitchHistory(saved);
                userSwitcherState.selectedIndex = 0;
            }
            const displayAccounts = ordered.map(enrichAccountAvatar);
            // While impersonating, prepend a keyboard-navigable "return" card so
            // the test user can go back with the arrow keys + Enter shortcut.
            if (userSwitcherState.impersonating) {
                const returnLogin = userSwitcherState.impersonatorLogin || "";
                const returnCard = enrichAccountAvatar({
                    id: "__ghori_us_return__",
                    isReturn: true,
                    login: returnLogin,
                    label: returnLogin
                        ? _t("Return to %s", returnLogin)
                        : _t("Return to my account"),
                    color: "#7c3aed",
                });
                displayAccounts.unshift(returnCard);
                userSwitcherState.selectedIndex = 0;
            }
            userSwitcherState.displayAccounts = displayAccounts;
            persistAvatarMetadata(displayAccounts);
        };

        const close = () => {
            userSwitcherState.isOpen = false;
            userSwitcherState.mode = "picker";
            userSwitcherState.loading = false;
            userSwitcherState.passwordAccountId = null;
            userSwitcherState.editAccountId = null;
            userSwitcherState.passwordValue = "";
            userSwitcherState.error = "";
            userSwitcherState.successMessage = "";
            unlockBackground();
            if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
                previouslyFocused.focus({ preventScroll: true });
            }
            previouslyFocused = null;
        };

        const open = async () => {
            // Authority can come from an in-progress impersonation, so ask the
            // server (not just the current user's groups). The server enforces
            // this again on every switch/return route.
            const ctx = await fetchSwitchContext();
            userSwitcherState.impersonating = ctx.impersonating;
            userSwitcherState.impersonatorLogin = ctx.impersonatorLogin;
            userSwitcherState.canSwitch = ctx.canSwitch;
            userSwitcherState.canManageAccounts = ctx.canManageAccounts;
            if (!ctx.canSwitch) {
                return;
            }
            previouslyFocused = document.activeElement;
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            // Load the latest saved accounts from the database before showing.
            // While impersonating, the test user cannot read the admin's saved
            // list (record rule); that's fine — the "Return" action is shown.
            await fetchAccountsFromDb();
            rebuildDisplayList();
            userSwitcherState.isOpen = true;
            userSwitcherState.mode = "picker";
            userSwitcherState.error = "";
            userSwitcherState.successMessage = "";
            lockBackground();
        };

        const showSuccess = (message) => {
            userSwitcherState.successMessage = message;
            browser.setTimeout(() => {
                if (userSwitcherState.successMessage === message) {
                    userSwitcherState.successMessage = "";
                }
            }, 2500);
        };

        const isSessionAccount = (account) => loginsMatch(account?.login, currentLogin());

        const addAccount = ({ label, login }) => {
            if (!userSwitcherState.canManageAccounts) {
                throw new Error(_t("You are not allowed to manage saved accounts."));
            }
            const trimmedLogin = (login || "").trim();
            if (!trimmedLogin) {
                throw new Error(_t("Login is required."));
            }
            const accounts = loadAccounts();
            if (accounts.some((a) => loginsMatch(a.login, trimmedLogin))) {
                throw new Error(_t("An account with this login already exists."));
            }
            const entry = {
                id: uuid(),
                label: (label || "").trim() || trimmedLogin,
                login: trimmedLogin,
                db: session.db,
                color: colorFromLogin(trimmedLogin),
            };
            accounts.push(entry);
            saveAccounts(accounts);
            rebuildDisplayList();
            userSwitcherState.mode = "picker";
            const newIdx = userSwitcherState.displayAccounts.findIndex((a) => a.id === entry.id);
            userSwitcherState.selectedIndex = newIdx >= 0 ? newIdx : 0;
            userSwitcherState.error = "";
            showSuccess(_t("Account saved."));
        };

        const updateAccount = (accountId, { label, login }) => {
            if (!userSwitcherState.canManageAccounts) {
                throw new Error(_t("You are not allowed to manage saved accounts."));
            }
            const trimmedLogin = (login || "").trim();
            if (!trimmedLogin) {
                throw new Error(_t("Login is required."));
            }
            const accounts = loadAccounts();
            const idx = accounts.findIndex((a) => a.id === accountId);
            if (idx < 0) {
                throw new Error(_t("Account not found."));
            }
            if (accounts.some((a) => a.id !== accountId && loginsMatch(a.login, trimmedLogin))) {
                throw new Error(_t("An account with this login already exists."));
            }
            const existing = accounts[idx];
            accounts[idx] = {
                ...existing,
                label: (label || "").trim() || trimmedLogin,
                login: trimmedLogin,
                db: session.db,
                color: colorFromLogin(trimmedLogin),
            };
            saveAccounts(accounts);
            rebuildDisplayList();
            userSwitcherState.mode = "picker";
            userSwitcherState.editAccountId = null;
            const newIdx = userSwitcherState.displayAccounts.findIndex((a) => a.id === accountId);
            userSwitcherState.selectedIndex = newIdx >= 0 ? newIdx : 0;
            userSwitcherState.error = "";
            showSuccess(_t("Account updated."));
        };

        const removeAccount = (accountId) => {
            if (!userSwitcherState.canManageAccounts) {
                return;
            }
            const accounts = loadAccounts().filter((a) => a.id !== accountId);
            saveAccounts(accounts);
            rebuildDisplayList();
            userSwitcherState.error = "";
            showSuccess(_t("Account removed."));
        };

        // Server-side "login as": no password is sent or stored. The server
        // verifies the actor is in the Ghori User Switcher group before
        // finalizing the session as the target user.
        const authenticateAs = async (account) => {
            userSwitcherState.loading = true;
            userSwitcherState.error = "";
            try {
                const result = await rpc("/ghori_user_switcher/impersonate", {
                    db: account.db || session.db,
                    login: account.login,
                });
                if (!result?.ok || !result?.uid) {
                    throw new Error(
                        result?.error || _t("Could not switch account. Try again.")
                    );
                }
                recordSwitchHistory(account.login);
                close();
                browser.sessionStorage.setItem(JUST_SWITCHED_KEY, "1");
                browser.location.assign("/odoo");
                return true;
            } catch (error) {
                const message =
                    error?.data?.message ||
                    error?.message ||
                    _t("Could not switch account. Try again.");
                userSwitcherState.error = message;
                notification.add(message, { type: "danger" });
                rebuildDisplayList();
                userSwitcherState.mode = "picker";
                userSwitcherState.passwordAccountId = null;
                return false;
            } finally {
                userSwitcherState.loading = false;
            }
        };

        const switchToAccount = async (account) => {
            if (!account) {
                close();
                return;
            }
            // The synthetic "return" card goes back to the original admin.
            if (account.isReturn) {
                await returnToSelf();
                return;
            }
            if (isSessionAccount(account)) {
                close();
                return;
            }
            // No password prompt: switching is permission-based (login as).
            await authenticateAs(account);
        };

        // Return to the original admin that started the impersonation chain.
        const returnToSelf = async () => {
            userSwitcherState.loading = true;
            userSwitcherState.error = "";
            try {
                const result = await rpc("/ghori_user_switcher/return", {});
                if (!result?.ok || !result?.uid) {
                    throw new Error(
                        result?.error || _t("Could not return to your account.")
                    );
                }
                close();
                browser.sessionStorage.setItem(JUST_SWITCHED_KEY, "1");
                browser.location.assign("/odoo");
                return true;
            } catch (error) {
                const message =
                    error?.data?.message ||
                    error?.message ||
                    _t("Could not return to your account.");
                userSwitcherState.error = message;
                notification.add(message, { type: "danger" });
                return false;
            } finally {
                userSwitcherState.loading = false;
            }
        };

        // Retained for the overlay's password-mode UI; with permission-based
        // switching it simply performs the same passwordless switch.
        const confirmPasswordSwitch = async () => {
            const account = userSwitcherState.accounts.find(
                (a) => a.id === userSwitcherState.passwordAccountId
            );
            if (!account) {
                userSwitcherState.mode = "picker";
                return;
            }
            await authenticateAs(account);
        };

        const selectRelative = (delta) => {
            const total = userSwitcherState.displayAccounts.length;
            if (!total) {
                return;
            }
            let idx = userSwitcherState.selectedIndex + delta;
            if (idx < 0) {
                idx = total - 1;
            }
            if (idx >= total) {
                idx = 0;
            }
            userSwitcherState.selectedIndex = idx;
        };

        const selectedEntry = () =>
            userSwitcherState.displayAccounts[userSwitcherState.selectedIndex] || null;

        const onOpenShortcut = (ev) => {
            if (userSwitcherState.isOpen) {
                return;
            }
            const hotkeyStr = getActiveHotkey(ev);
            if (!hotkeyStr || !OPEN_HOTKEYS.has(hotkeyStr)) {
                return;
            }
            ev.preventDefault();
            ev.stopImmediatePropagation();
            open();
        };

        const stopKey = (ev) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
        };

        const onGlobalKeydown = (ev) => {
            onOpenShortcut(ev);
            if (!userSwitcherState.isOpen) {
                return;
            }
            if (ev.key === "Escape") {
                stopKey(ev);
                if (userSwitcherState.mode !== "picker") {
                    userSwitcherState.mode = "picker";
                    userSwitcherState.editAccountId = null;
                    userSwitcherState.error = "";
                } else {
                    close();
                }
                return;
            }

            const overlay = getOverlayRoot();

            if (userSwitcherState.mode === "add" || userSwitcherState.mode === "edit" || userSwitcherState.mode === "password") {
                if (ev.key === "Tab") {
                    cycleTabInOverlay(ev, overlay);
                    return;
                }
                const active = document.activeElement;
                const userSearchActive =
                    active instanceof HTMLInputElement &&
                    active.closest(".ghori-us-user-search") &&
                    overlay?.querySelector(".ghori-us-user-results li");
                if (userSearchActive && (ev.key === "Enter" || ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
                    return;
                }
                if (ev.key === "Enter") {
                    if (overlay?.contains(active)) {
                        stopKey(ev);
                        if (active instanceof HTMLButtonElement) {
                            active.click();
                        } else if (userSwitcherState.mode === "password") {
                            confirmPasswordSwitch();
                        } else if (userSwitcherState.mode === "add" || userSwitcherState.mode === "edit") {
                            overlay
                                ?.querySelector(".ghori-us-form .btn-primary")
                                ?.click();
                        }
                    }
                }
                return;
            }

            if (ev.key === "Tab") {
                stopKey(ev);
                selectRelative(ev.shiftKey ? -1 : 1);
                getOverlayPanel()?.focus({ preventScroll: true });
                return;
            }
            if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
                stopKey(ev);
                selectRelative(1);
            } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
                stopKey(ev);
                selectRelative(-1);
            } else if (ev.key === "Enter") {
                stopKey(ev);
                switchToAccount(selectedEntry());
            } else if (
                userSwitcherState.canManageAccounts &&
                (ev.key === "n" || ev.key === "N" || ev.key === "+")
            ) {
                stopKey(ev);
                userSwitcherState.mode = "add";
                userSwitcherState.editAccountId = null;
                userSwitcherState.error = "";
            } else if (userSwitcherState.canManageAccounts && (ev.key === "e" || ev.key === "E")) {
                stopKey(ev);
                const entry = selectedEntry();
                if (entry && !entry.isReturn) {
                    userSwitcherState.mode = "edit";
                    userSwitcherState.editAccountId = entry.id;
                    userSwitcherState.error = "";
                }
            }
        };

        const onFocusIn = (ev) => {
            if (!userSwitcherState.isOpen) {
                return;
            }
            const overlay = getOverlayRoot();
            if (!overlay || overlay.contains(ev.target)) {
                return;
            }
            browser.requestAnimationFrame(() => {
                if (!userSwitcherState.isOpen) {
                    return;
                }
                const currentOverlay = getOverlayRoot();
                if (!currentOverlay) {
                    return;
                }
                if (
                    userSwitcherState.mode === "add" ||
                    userSwitcherState.mode === "edit" ||
                    userSwitcherState.mode === "password"
                ) {
                    focusFirstInOverlay(currentOverlay);
                } else {
                    getOverlayPanel()?.focus({ preventScroll: true });
                }
            });
        };

        // Warm the in-memory cache + impersonation context once at startup so
        // the first open() and systray render are ready. Skip work for sessions
        // that may not switch at all.
        fetchSwitchContext().then((ctx) => {
            userSwitcherState.impersonating = ctx.impersonating;
            userSwitcherState.impersonatorLogin = ctx.impersonatorLogin;
            userSwitcherState.canSwitch = ctx.canSwitch;
            userSwitcherState.canManageAccounts = ctx.canManageAccounts;
            if (ctx.canSwitch && !ctx.impersonating) {
                fetchAccountsFromDb().then(() => rebuildDisplayList());
            }
        });

        browser.addEventListener("keydown", onGlobalKeydown, true);
        browser.addEventListener("focusin", onFocusIn, true);

        // Cmd+Shift+U (Mac) / Ctrl+Shift+U (Windows) — Odoo maps these to control+shift+u.
        // Mac Ctrl+Shift+U stays Odoo's company switcher (alt+shift+u).
        const hotkeyOptions = { global: true, bypassEditableProtection: true };
        hotkey.add("control+shift+u", () => open(), hotkeyOptions);
        hotkey.add("control+alt+u", () => open(), hotkeyOptions);

        return {
            state: userSwitcherState,
            open,
            close,
            rebuildDisplayList,
            isSessionAccount,
            addAccount,
            updateAccount,
            removeAccount,
            switchToAccount,
            confirmPasswordSwitch,
            returnToSelf,
            selectRelative,
            selectedEntry,
        };
    },
};

registry.category("services").add("ghori_user_switcher", userSwitcherService);
