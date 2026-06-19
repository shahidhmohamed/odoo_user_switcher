/** @odoo-module **/

import { Component, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class UserSwitcherSystray extends Component {
    static template = xml`
        <div>
            <button type="button"
                    class="o_nav_entry"
                    title="Switch account (⌘⇧U)"
                    t-on-click="onClick">
                <i class="fa fa-users ghori-us-systray-icon" role="img" aria-label="Switch account"/>
            </button>
        </div>`;
    static props = {};

    setup() {
        this.switcher = useService("ghori_user_switcher");
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
