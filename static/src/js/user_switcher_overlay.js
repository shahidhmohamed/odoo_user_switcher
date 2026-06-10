/** @odoo-module **/

import { Component, useEffect, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
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
            () => [this.us.isOpen, this.us.selectedIndex, this.us.mode]
        );
    }

    get cards() {
        return [this.switcher.currentSession(), ...this.us.accounts];
    }

    get selectedIndex() {
        return this.us.selectedIndex;
    }

    focusOverlay() {
        if (this.us.mode === "password") {
            this.passwordInputRef.el?.focus({ preventScroll: true });
            return;
        }
        if (this.us.mode === "add") {
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
        this.switcher.state.error = "";
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
        if (entry && !entry.isCurrent) {
            this.switcher.switchToAccount(entry);
        }
    }

    onAddClick() {
        this.switcher.state.mode = "add";
        this.switcher.state.error = "";
        this.state.draftLabel = "";
        this.state.draftLogin = "";
        this.state.draftPassword = "";
        this.state.draftRemember = false;
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

    onRemoveAccount(accountId, ev) {
        ev.stopPropagation();
        this.switcher.removeAccount(accountId);
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

    initials(label, login) {
        const source = (label || login || "?").trim();
        const parts = source.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return source.slice(0, 2).toUpperCase();
    }
}
