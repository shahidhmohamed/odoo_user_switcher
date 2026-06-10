# -*- coding: utf-8 -*-
{
    "name": "Ghori User Switcher",
    "summary": "Fast account switcher overlay (keyboard shortcut, saved logins)",
    "category": "Customizations",
    "version": "18.0.1.0.23",
    "license": "LGPL-3",
    "author": "Ghori",
    "installable": True,
    "application": False,
    "depends": ["web"],
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
