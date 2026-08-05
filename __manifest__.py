# -*- coding: utf-8 -*-
{
    "name": "Ghori User Switcher",
    "summary": "Fast account switcher overlay (keyboard shortcut, saved logins)",
    "description": "Fast account switcher for Odoo. Save logins in the browser and switch users via keyboard shortcut or the navbar without leaving the app.",
    "category": "Customizations",
    "version": "18.0.1.4.10",
    "license": "LGPL-3",
    "author": "Ghori",
    "images": ["static/description/icon.png"],
    "installable": True,
    "application": False,
    "depends": ["web", "base", "ghori_base"],
    "data": [
        "security/ghori_user_switcher_groups.xml",
        "security/ir.model.access.csv",
        "security/ghori_user_switcher_rules.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "ghori_user_switcher/static/src/scss/user_switcher.scss",
            "ghori_user_switcher/static/src/xml/user_switcher_overlay.xml",
            "ghori_user_switcher/static/src/js/user_switcher_service.js",
            "ghori_user_switcher/static/src/js/user_switcher_overlay.js",
            "ghori_user_switcher/static/src/js/user_switcher_systray.js",
            "ghori_user_switcher/static/src/js/user_switcher_boot.js",
        ],
    },
}
