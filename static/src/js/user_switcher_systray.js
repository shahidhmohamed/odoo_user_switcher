/** @odoo-module **/

import { Component, xml, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";

export class UserSwitcherSystray extends Component {
    static template = xml`
        <div t-if="state.allowed">
            <button type="button"
                    class="o_nav_entry"
                    t-att-title="state.impersonating ? 'Return to your account (⌘⇧U)' : 'Switch account (⌘⇧U)'"
                    t-on-click="onClick">
                <i t-att-class="state.impersonating ? 'fa fa-reply ghori-us-systray-icon' : 'fa fa-users ghori-us-systray-icon'"
                   role="img" aria-label="Switch account"/>
            </button>
        </div>`;
    static props = {};

    setup() {
        this.switcher = useService("ghori_user_switcher");
        this.state = useState({ allowed: false, impersonating: false });
        // Show the entry to switcher admins AND to test users currently being
        // impersonated (so they can return). Authority is decided server-side.
        rpc("/ghori_user_switcher/context", {})
            .then((ctx) => {
                this.state.allowed = Boolean(ctx?.can_switch);
                this.state.impersonating = Boolean(ctx?.impersonating);
            })
            .catch(() => {});
    }

    onClick() {
        this.switcher.open();
    }
}

registry.category("systray").add(
    "ghori.user_switcher",
    { Component: UserSwitcherSystray },
    { sequence: 50 }
);
