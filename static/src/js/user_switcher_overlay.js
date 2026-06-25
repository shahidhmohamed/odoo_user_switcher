/** @odoo-module **/

import { Component, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { imageUrl } from "@web/core/utils/urls";
import { rpc } from "@web/core/network/rpc";
import { userSwitcherState } from "./user_switcher_service";

export class UserSwitcherOverlay extends Component {
    static template = "ghori_user_switcher.UserSwitcherOverlay";
    static props = {};

    setup() {
        this.switcher = useService("ghori_user_switcher");
        this.us = useState(userSwitcherState);
        this.overlayRef = useRef("overlay");
        this.panelRef = useRef("panel");
        this.carouselRef = useRef("carousel");
        this.passwordInputRef = useRef("passwordInput");
        this.state = useState({
            draftLabel: "",
            draftLogin: "",
            draftPassword: "",
            draftRemember: false,
            userSearchTerm: "",
            userSearchResults: [],
            userSearchLoading: false,
            userSearchOpen: false,
            userSearchSelectedIndex: 0,
        });
        this._userSearchTimer = null;

        onWillUnmount(() => {
            if (this._userSearchTimer) {
                browser.clearTimeout(this._userSearchTimer);
            }
        });

        useEffect(
            () => {
                if (!this.us.isOpen) {
                    return;
                }
                browser.requestAnimationFrame(() => {
                    const overlay = this.overlayRef.el;
                    const active = document.activeElement;
                    const focusedInsideForm =
                        active instanceof HTMLElement &&
                        overlay?.contains(active) &&
                        active !== this.panelRef.el;
                    if (!focusedInsideForm) {
                        this.focusOverlay();
                    }
                    this.scrollSelectedIntoView();
                });
            },
            () => [this.us.isOpen, this.us.selectedIndex, this.us.mode, this.us.editAccountId]
        );

        useEffect(
            () => {
                if (this.us.mode === "add") {
                    this.resetAddForm();
                }
            },
            () => [this.us.mode]
        );

        useEffect(
            () => {
                if (this.us.mode === "add" || this.us.mode === "edit") {
                    this.searchUsers(this.state.userSearchTerm);
                } else {
                    this.state.userSearchResults = [];
                    this.state.userSearchOpen = false;
                }
            },
            () => [this.us.mode]
        );

        useEffect(
            () => {
                this.state.userSearchSelectedIndex = 0;
                this.scrollUserSearchIntoView();
            },
            () => [this.state.userSearchResults.length, this.state.userSearchTerm]
        );

        useEffect(
            () => {
                if (this.us.mode !== "edit" || !this.us.editAccountId) {
                    return;
                }
                const account = this.us.accounts.find((a) => a.id === this.us.editAccountId);
                if (!account) {
                    return;
                }
                this.state.draftLabel = account.label || "";
                this.state.draftLogin = account.login || "";
                this.state.draftPassword = "";
                this.state.draftRemember = Boolean(account.rememberPassword);
                this.state.userSearchTerm = account.label || account.login || "";
            },
            () => [this.us.mode, this.us.editAccountId]
        );
    }

    get cards() {
        return this.us.displayAccounts;
    }

    get selectedIndex() {
        return this.us.selectedIndex;
    }

    focusOverlay() {
        if (this.us.mode === "password") {
            this.passwordInputRef.el?.focus({ preventScroll: true });
            return;
        }
        if (this.us.mode === "add" || this.us.mode === "edit") {
            const input = this.panelRef.el?.querySelector("input.o_input");
            input?.focus({ preventScroll: true });
            return;
        }
        this.panelRef.el?.focus({ preventScroll: true });
    }

    scrollSelectedIntoView() {
        if (this.us.mode !== "picker") {
            return;
        }
        const selected = this.carouselRef.el?.querySelector(".ghori-us-card.is-selected");
        selected?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }

    cardClass(index) {
        const classes = ["ghori-us-card"];
        if (index === this.selectedIndex) {
            classes.push("is-selected");
        }
        const offset = index - this.selectedIndex;
        if (offset < 0) {
            classes.push("is-left");
        } else if (offset > 0) {
            classes.push("is-right");
        }
        return classes.join(" ");
    }

    onCancelForm() {
        this.switcher.state.mode = "picker";
        this.switcher.state.editAccountId = null;
        this.switcher.state.error = "";
        this.resetUserSearch();
    }

    onBackdropClick(ev) {
        if (ev.target.classList.contains("ghori-us-overlay")) {
            this.switcher.close();
        }
    }

    onCardClick(index) {
        this.switcher.state.selectedIndex = index;
        this.scrollSelectedIntoView();
        const entry = this.cards[index];
        if (entry && !this.switcher.isSessionAccount(entry)) {
            this.switcher.switchToAccount(entry);
        }
    }

    resetAddForm() {
        this.state.draftLabel = "";
        this.state.draftLogin = "";
        this.state.draftPassword = "";
        this.state.draftRemember = false;
        this.resetUserSearch();
    }

    resetUserSearch() {
        this.state.userSearchTerm = "";
        this.state.userSearchResults = [];
        this.state.userSearchLoading = false;
        this.state.userSearchOpen = false;
        this.state.userSearchSelectedIndex = 0;
    }

    async searchUsers(term) {
        this.state.userSearchLoading = true;
        try {
            const results = await rpc("/ghori_user_switcher/search_users", {
                term: term || "",
                limit: 20,
            });
            this.state.userSearchResults = Array.isArray(results) ? results : [];
            this.state.userSearchOpen = true;
            this.state.userSearchSelectedIndex = 0;
        } catch {
            this.state.userSearchResults = [];
            this.state.userSearchOpen = false;
        } finally {
            this.state.userSearchLoading = false;
        }
    }

    onUserSearchInput(ev) {
        const term = ev.target.value || "";
        this.state.userSearchTerm = term;
        if (this._userSearchTimer) {
            browser.clearTimeout(this._userSearchTimer);
        }
        this._userSearchTimer = browser.setTimeout(() => {
            this.searchUsers(term);
        }, 250);
    }

    onUserSearchFocus() {
        if (!this.state.userSearchResults.length) {
            this.searchUsers(this.state.userSearchTerm);
        } else {
            this.state.userSearchOpen = true;
        }
    }

    userSearchResultClass(index) {
        return index === this.state.userSearchSelectedIndex ? "is-selected" : "";
    }

    scrollUserSearchIntoView() {
        if (!this.state.userSearchOpen || !this.state.userSearchResults.length) {
            return;
        }
        browser.requestAnimationFrame(() => {
            const selected = this.overlayRef.el?.querySelector(
                ".ghori-us-user-results li.is-selected"
            );
            selected?.scrollIntoView({ block: "nearest" });
        });
    }

    onUserSearchHover(index) {
        this.state.userSearchSelectedIndex = index;
    }

    onUserSearchKeydown(ev) {
        const results = this.state.userSearchResults;
        const dropdownOpen = this.state.userSearchOpen && results.length > 0;

        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            ev.stopPropagation();
            if (!dropdownOpen) {
                if (results.length) {
                    this.state.userSearchOpen = true;
                    this.state.userSearchSelectedIndex = 0;
                }
                return;
            }
            const next =
                this.state.userSearchSelectedIndex < results.length - 1
                    ? this.state.userSearchSelectedIndex + 1
                    : 0;
            this.state.userSearchSelectedIndex = next;
            this.scrollUserSearchIntoView();
            return;
        }

        if (ev.key === "ArrowUp") {
            if (!dropdownOpen) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            const prev =
                this.state.userSearchSelectedIndex > 0
                    ? this.state.userSearchSelectedIndex - 1
                    : results.length - 1;
            this.state.userSearchSelectedIndex = prev;
            this.scrollUserSearchIntoView();
            return;
        }

        if (ev.key === "Enter" && dropdownOpen) {
            const user = results[this.state.userSearchSelectedIndex];
            if (user) {
                ev.preventDefault();
                ev.stopPropagation();
                this.onSelectUser(user, ev);
            }
        }
    }

    onSelectUser(user, ev) {
        ev?.stopPropagation?.();
        this.state.draftLogin = user.login || "";
        this.state.draftLabel = user.name || user.login || "";
        this.state.userSearchTerm = user.name || user.login || "";
        this.state.userSearchOpen = false;
        this.state.userSearchSelectedIndex = 0;
        this.switcher.state.error = "";
    }

    onAddClick() {
        this.switcher.state.mode = "add";
        this.switcher.state.editAccountId = null;
        this.switcher.state.error = "";
    }

    onEditClick(accountId, ev) {
        ev.stopPropagation();
        this.switcher.state.mode = "edit";
        this.switcher.state.editAccountId = accountId;
        this.switcher.state.error = "";
    }

    onFormKeydown(ev) {
        if (ev.key !== "Enter") {
            return;
        }
        const inUserSearch = ev.target instanceof HTMLElement && ev.target.closest(".ghori-us-user-search");
        if (inUserSearch && this.state.userSearchOpen && this.state.userSearchResults.length) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        if (this.us.mode === "add") {
            this.onSaveAccount();
        } else if (this.us.mode === "edit") {
            this.onUpdateAccount();
        }
    }

    onSaveAccount() {
        try {
            this.switcher.addAccount({
                label: this.state.draftLabel,
                login: this.state.draftLogin,
                password: this.state.draftPassword,
                remember: this.state.draftRemember,
            });
        } catch (error) {
            this.switcher.state.error = error.message;
        }
    }

    onUpdateAccount() {
        try {
            this.switcher.updateAccount(this.us.editAccountId, {
                label: this.state.draftLabel,
                login: this.state.draftLogin,
                password: this.state.draftPassword,
                remember: this.state.draftRemember,
            });
        } catch (error) {
            this.switcher.state.error = error.message;
        }
    }

    onRemoveAccount(accountId, ev) {
        ev.stopPropagation();
        this.switcher.removeAccount(accountId);
    }

    onReturnClick() {
        this.switcher.returnToSelf();
    }

    onPasswordInput(ev) {
        this.switcher.state.passwordValue = ev.target.value;
    }

    onPasswordConfirm() {
        this.switcher.confirmPasswordSwitch();
    }

    onPasswordKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.onPasswordConfirm();
        }
    }

    avatarUrl(card) {
        if (!card?.partnerId) {
            return "";
        }
        return imageUrl("res.partner", card.partnerId, "avatar_128", {
            unique: card.partnerWriteDate,
            width: 128,
            height: 128,
        });
    }

    avatarStyle(card) {
        if (card?.isReturn) {
            return `background-color:${card.color || "#7c3aed"};`;
        }
        const url = this.avatarUrl(card);
        if (url) {
            const safeUrl = url.replace(/"/g, '\\"');
            return `background-image:url("${safeUrl}");background-size:cover;background-position:center center;background-color:#e2e8f0;`;
        }
        return `background-color:${card.color || "#94a3b8"};`;
    }

    initials(label, login) {
        const source = (label || login || "?").trim();
        const parts = source.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return source.slice(0, 2).toUpperCase();
    }
}
