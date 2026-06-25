# -*- coding: utf-8 -*-

import logging

import odoo
from odoo import api
from odoo.exceptions import AccessError
from odoo.http import request, route, Controller

_logger = logging.getLogger(__name__)

SWITCHER_GROUP = "ghori_user_switcher.group_ghori_user_switcher"
# Session key holding the uid of the original switcher admin while impersonating.
IMPERSONATOR_KEY = "ghori_us_impersonator_uid"


class GhoriUserSwitcherController(Controller):
    def _switch_session_to(self, target_db, target_uid):
        """Point the current session at ``target_uid`` (no password).

        Sets the session fields directly (mirroring Session.finalize) because
        finalize() expects pre_login/pre_uid from a password authenticate(),
        which we intentionally skip for permission-based "login as".
        """
        session = request.session
        registry = odoo.registry(target_db)
        with registry.cursor() as cr:
            env = api.Environment(cr, target_uid, {})
            target_user = env["res.users"].browse(target_uid)
            user_context = dict(env["res.users"].context_get())
            session.uid = target_uid
            session.login = target_user.login
            session.db = target_db
            session.context = user_context
            session.session_token = target_user._compute_session_token(session.sid)
            session.should_rotate = True
            cr.commit()
        return session.uid

    def _impersonator_uid(self):
        """Uid of the real switcher admin who started the current impersonation."""
        value = request.session.get(IMPERSONATOR_KEY)
        try:
            return int(value) if value else False
        except (TypeError, ValueError):
            return False

    def _actor_may_switch(self):
        """True when the *effective* actor is allowed to switch accounts.

        The right comes from the original switcher admin: a regular test user
        that an admin impersonated may still switch (e.g. to go back), because
        the session remembers that a switcher admin initiated the chain.
        """
        # Currently impersonating: authority comes from the original admin.
        impersonator_uid = self._impersonator_uid()
        if impersonator_uid:
            admin = (
                request.env["res.users"]
                .sudo()
                .browse(impersonator_uid)
                .exists()
            )
            return bool(admin and admin.has_group(SWITCHER_GROUP))
        # Not impersonating: the current user must be a switcher admin.
        return request.env.user.has_group(SWITCHER_GROUP)

    @route(
        "/ghori_user_switcher/search_users",
        type="json",
        auth="user",
    )
    def search_users(self, term="", limit=20):
        """Search active users for the add-account picker."""
        if not self._actor_may_switch():
            raise AccessError("You are not allowed to switch accounts.")
        term = (term or "").strip()
        domain = [("active", "=", True), ("share", "=", False)]
        if term:
            domain += ["|", ("login", "ilike", term), ("name", "ilike", term)]
        try:
            limit = max(1, min(int(limit or 20), 50))
        except (TypeError, ValueError):
            limit = 20
        users = (
            request.env["res.users"]
            .sudo()
            .search(domain, limit=limit, order="name, login")
        )
        return [
            {"id": user.id, "name": user.name or "", "login": user.login or ""}
            for user in users
        ]

    @route(
        "/ghori_user_switcher/context",
        type="json",
        auth="user",
    )
    def context(self):
        """Tell the client whether this session may switch and/or return."""
        impersonator_uid = self._impersonator_uid()
        impersonator_login = False
        if impersonator_uid:
            admin = request.env["res.users"].sudo().browse(impersonator_uid).exists()
            impersonator_login = admin.login if admin else False
        is_impersonating = bool(impersonator_uid)
        return {
            "can_switch": self._actor_may_switch(),
            "impersonating": is_impersonating,
            "impersonator_login": impersonator_login,
            # Only the real switcher admin may add/edit saved accounts — not a
            # low-privilege user while an admin is impersonating them.
            "can_manage_accounts": (
                not is_impersonating
                and request.env.user.has_group(SWITCHER_GROUP)
            ),
        }

    @route(
        "/ghori_user_switcher/impersonate",
        type="json",
        auth="user",
    )
    def impersonate(self, login, db=None):
        """Log the current session in as ``login`` WITHOUT a password.

        Allowed when the effective actor may switch (see _actor_may_switch):
        either the current user is a switcher admin, or an impersonation chain
        started by a switcher admin is in progress.
        """
        if not self._actor_may_switch():
            raise AccessError("You are not allowed to switch accounts.")

        impersonator_uid = self._impersonator_uid()
        if impersonator_uid and request.session.uid != impersonator_uid:
            admin = request.env["res.users"].sudo().browse(impersonator_uid).exists()
            target_login = (login or "").strip().lower()
            admin_login = (admin.login or "").strip().lower() if admin else ""
            if not admin or target_login != admin_login:
                return {
                    "ok": False,
                    "error": "Return to your admin account first, then switch to another user.",
                }

        target_db = db or request.db
        if not target_db or target_db != request.db:
            return {"ok": False, "error": "Invalid database."}

        target = (
            request.env["res.users"]
            .sudo()
            .search([("login", "=ilike", login), ("active", "=", True)], limit=1)
        )
        if not target:
            return {"ok": False, "error": "User not found."}

        current_uid = request.session.uid

        # Remember the original admin the first time we leave the admin account,
        # so the test user can always come back. Keep the existing value if a
        # chain is already in progress (always points to the real admin).
        if not self._impersonator_uid():
            request.session[IMPERSONATOR_KEY] = current_uid
        # If we are switching back to the original admin, end the impersonation.
        if target.id == self._impersonator_uid():
            request.session.pop(IMPERSONATOR_KEY, None)

        # Stamp MRU ordering against the original admin's saved-account list.
        try:
            request.env["ghori.user.switcher.account"].sudo().with_user(
                self._impersonator_uid() or current_uid
            ).ghori_us_mark_switched(target.login)
        except Exception:
            _logger.exception("User switcher: failed to stamp MRU for %s", target.login)

        _logger.info(
            "User switcher: uid=%s switching to %s (uid=%s); impersonator=%s",
            current_uid,
            target.login,
            target.id,
            request.session.get(IMPERSONATOR_KEY),
        )

        uid = self._switch_session_to(target_db, target.id)
        return {"ok": True, "uid": uid}

    @route(
        "/ghori_user_switcher/return",
        type="json",
        auth="user",
    )
    def return_to_self(self):
        """Return to the original switcher admin that started impersonation."""
        impersonator_uid = self._impersonator_uid()
        if not impersonator_uid:
            return {"ok": False, "error": "Not impersonating."}
        admin = request.env["res.users"].sudo().browse(impersonator_uid).exists()
        if not admin or not admin.has_group(SWITCHER_GROUP):
            request.session.pop(IMPERSONATOR_KEY, None)
            return {"ok": False, "error": "Original account is no longer allowed."}

        target_db = request.db
        request.session.pop(IMPERSONATOR_KEY, None)
        _logger.info("User switcher: returning to original admin uid=%s", admin.id)
        uid = self._switch_session_to(target_db, admin.id)
        return {"ok": True, "uid": uid}
