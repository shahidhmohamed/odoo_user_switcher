/** @odoo-module **/

import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { browser } from "@web/core/browser/browser";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { session } from "@web/session";
import { _t } from "@web/core/l10n/translation";

const OPEN_HOTKEYS = new Set(["control+shift+u", "control+alt+u"]);
const JUST_SWITCHED_KEY = "ghori_us_just_switched";

const STORAGE_KEY = "ghori_user_switcher_accounts_v1";

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
    try {
        const raw = browser.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveAccounts(accounts) {
    browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function encodeSecret(value) {
    if (!value) {
        return "";
    }
    try {
        return btoa(unescape(encodeURIComponent(value)));
    } catch {
        return "";
    }
}

function decodeSecret(value) {
    if (!value) {
        return "";
    }
    try {
        return decodeURIComponent(escape(atob(value)));
    } catch {
        return "";
    }
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
    accounts: [],
    loading: false,
    passwordAccountId: null,
    passwordValue: "",
    error: "",
    successMessage: "",
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

        const reloadAccounts = () => {
            userSwitcherState.accounts = loadAccounts().map((account) => ({
                ...account,
                color: account.color || colorFromLogin(account.login),
            }));
        };

        const close = () => {
            userSwitcherState.isOpen = false;
            userSwitcherState.mode = "picker";
            userSwitcherState.loading = false;
            userSwitcherState.passwordAccountId = null;
            userSwitcherState.passwordValue = "";
            userSwitcherState.error = "";
            userSwitcherState.successMessage = "";
            unlockBackground();
            if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
                previouslyFocused.focus({ preventScroll: true });
            }
            previouslyFocused = null;
        };

        const open = () => {
            previouslyFocused = document.activeElement;
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            reloadAccounts();
            userSwitcherState.isOpen = true;
            userSwitcherState.mode = "picker";
            userSwitcherState.selectedIndex = 0;
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

        const currentSession = () => ({
            id: "__current__",
            label: session.name || session.username || _t("Current user"),
            login: session.username,
            db: session.db,
            isCurrent: true,
            color: colorFromLogin(session.username),
        });

        const addAccount = ({ label, login, password, remember }) => {
            const trimmedLogin = (login || "").trim();
            if (!trimmedLogin) {
                throw new Error(_t("Login is required."));
            }
            const accounts = loadAccounts();
            const entry = {
                id: uuid(),
                label: (label || "").trim() || trimmedLogin,
                login: trimmedLogin,
                db: session.db,
                color: colorFromLogin(trimmedLogin),
                rememberPassword: Boolean(remember),
                passwordEnc: remember && password ? encodeSecret(password) : "",
            };
            accounts.push(entry);
            saveAccounts(accounts);
            reloadAccounts();
            userSwitcherState.mode = "picker";
            userSwitcherState.selectedIndex = Math.max(0, userSwitcherState.accounts.length - 1);
            userSwitcherState.error = "";
            showSuccess(_t("Account saved."));
        };

        const removeAccount = (accountId) => {
            const accounts = loadAccounts().filter((a) => a.id !== accountId);
            saveAccounts(accounts);
            reloadAccounts();
            if (userSwitcherState.selectedIndex >= userSwitcherState.accounts.length) {
                userSwitcherState.selectedIndex = Math.max(
                    0,
                    userSwitcherState.accounts.length - 1
                );
            }
            userSwitcherState.error = "";
            showSuccess(_t("Account removed."));
        };

        const resolvePassword = (account, passwordOverride) => {
            if (passwordOverride) {
                return passwordOverride;
            }
            if (account.rememberPassword && account.passwordEnc) {
                return decodeSecret(account.passwordEnc);
            }
            return "";
        };

        const authenticateAs = async (account, password) => {
            userSwitcherState.loading = true;
            userSwitcherState.error = "";
            try {
                await rpc("/web/session/destroy", {});
                const result = await rpc("/web/session/authenticate", {
                    db: account.db || session.db,
                    login: account.login,
                    password,
                });
                if (!result?.uid) {
                    throw new Error(_t("Authentication failed. Check login and password."));
                }
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
                return false;
            } finally {
                userSwitcherState.loading = false;
            }
        };

        const switchToAccount = async (account, passwordOverride) => {
            if (!account || account.isCurrent) {
                close();
                return;
            }
            const password = resolvePassword(account, passwordOverride);
            if (!password) {
                userSwitcherState.mode = "password";
                userSwitcherState.passwordAccountId = account.id;
                userSwitcherState.passwordValue = "";
                userSwitcherState.error = "";
                return;
            }
            await authenticateAs(account, password);
        };

        const confirmPasswordSwitch = async () => {
            const account = userSwitcherState.accounts.find(
                (a) => a.id === userSwitcherState.passwordAccountId
            );
            if (!account) {
                userSwitcherState.mode = "picker";
                return;
            }
            const password = userSwitcherState.passwordValue || "";
            if (!password) {
                userSwitcherState.error = _t("Enter your password.");
                return;
            }
            await authenticateAs(account, password);
        };

        const selectRelative = (delta) => {
            const total = userSwitcherState.accounts.length + 1;
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

        const selectedEntry = () => {
            if (userSwitcherState.selectedIndex === 0) {
                return currentSession();
            }
            return userSwitcherState.accounts[userSwitcherState.selectedIndex - 1] || null;
        };

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
                    userSwitcherState.error = "";
                } else {
                    close();
                }
                return;
            }

            const overlay = getOverlayRoot();

            if (userSwitcherState.mode === "add" || userSwitcherState.mode === "password") {
                if (ev.key === "Tab") {
                    cycleTabInOverlay(ev, overlay);
                    return;
                }
                if (ev.key === "Enter") {
                    const active = document.activeElement;
                    if (overlay?.contains(active)) {
                        stopKey(ev);
                        if (active instanceof HTMLButtonElement) {
                            active.click();
                        } else if (userSwitcherState.mode === "password") {
                            confirmPasswordSwitch();
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
            } else if (ev.key === "n" || ev.key === "N" || ev.key === "+") {
                stopKey(ev);
                userSwitcherState.mode = "add";
                userSwitcherState.error = "";
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
                    userSwitcherState.mode === "password"
                ) {
                    focusFirstInOverlay(currentOverlay);
                } else {
                    getOverlayPanel()?.focus({ preventScroll: true });
                }
            });
        };

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
            reloadAccounts,
            currentSession,
            addAccount,
            removeAccount,
            switchToAccount,
            confirmPasswordSwitch,
            selectRelative,
            selectedEntry,
        };
    },
};

registry.category("services").add("ghori_user_switcher", userSwitcherService);
