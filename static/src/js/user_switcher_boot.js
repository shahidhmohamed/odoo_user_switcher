/** @odoo-module **/

import { onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { WebClient } from "@web/webclient/webclient";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { UserSwitcherOverlay } from "./user_switcher_overlay";

const JUST_SWITCHED_KEY = "ghori_us_just_switched";

registry.category("main_components").add("ghori_user_switcher_overlay", {
    Component: UserSwitcherOverlay,
});

registry.category("user_menuitems").add("ghori.switch_account", (env) => ({
    type: "item",
    id: "ghori_switch_account",
    description: _t("Switch account"),
    callback: () => {
        env.services.ghori_user_switcher.open();
    },
    sequence: 15,
}));

patch(WebClient.prototype, {
    setup() {
        super.setup();
        useService("ghori_user_switcher");
        onMounted(() => {
            if (!browser.sessionStorage.getItem(JUST_SWITCHED_KEY)) {
                return;
            }
            browser.sessionStorage.removeItem(JUST_SWITCHED_KEY);
            const target = document.querySelector(".o_action_manager") || document.querySelector(".o_web_client");
            if (!target) {
                return;
            }
            if (!target.hasAttribute("tabindex")) {
                target.setAttribute("tabindex", "-1");
            }
            target.focus({ preventScroll: true });
        });
    },
});
