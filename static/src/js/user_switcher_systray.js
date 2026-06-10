/** @odoo-module **/

import { Component, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class UserSwitcherSystray extends Component {
    static template = xml`
        <button type="button"
                class="o_switch_user_menu btn btn-link lh-1 px-2"
                title="Switch account (⌘⇧U)"
                t-on-click="onClick">
            <i class="fa fa-users"/>
        </button>`;
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
