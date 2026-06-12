# -*- coding: utf-8 -*-

import logging

from odoo import http
from odoo.exceptions import AccessDenied
from odoo.http import request

_logger = logging.getLogger(__name__)


class GhoriUserSwitcherController(http.Controller):
    @http.route(
        "/ghori_user_switcher/validate_credentials",
        type="json",
        auth="user",
    )
    def validate_credentials(self, login, password, db=None):
        """Check login/password without destroying the current HTTP session."""
        if not login or not password:
            return {"ok": False}

        target_db = db or request.db
        if not target_db or target_db != request.db:
            return {"ok": False}

        credential = {"login": login, "password": password, "type": "password"}
        wsgienv = {
            "interactive": True,
            "base_location": request.httprequest.url_root.rstrip("/"),
            "HTTP_HOST": request.httprequest.environ.get("HTTP_HOST", ""),
            "REMOTE_ADDR": request.httprequest.environ.get("REMOTE_ADDR", ""),
        }
        try:
            # Odoo 18: authenticate(db, credential, user_agent_env) — classmethod.
            auth_info = request.env["res.users"].authenticate(
                target_db, credential, wsgienv
            )
            return {"ok": bool(auth_info.get("uid"))}
        except AccessDenied:
            return {"ok": False}
        except Exception:
            _logger.exception("User switcher credential validation failed")
            return {"ok": False}
