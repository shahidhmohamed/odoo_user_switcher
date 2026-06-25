# -*- coding: utf-8 -*-

from odoo import api, fields, models


class GhoriUserSwitcherAccount(models.Model):
    """A saved switch target belonging to one owner user.

    No password is stored. Switching is done server-side via permission-based
    impersonation (see controllers/main.py). ``last_switched_on`` drives the
    most-recently-used ordering that previously lived in browser localStorage.
    """

    _name = "ghori.user.switcher.account"
    _description = "Ghori User Switcher Saved Account"
    _order = "last_switched_on desc, label, id"

    owner_user_id = fields.Many2one(
        "res.users",
        string="Owner",
        required=True,
        ondelete="cascade",
        index=True,
        default=lambda self: self.env.user.id,
    )
    target_login = fields.Char(string="Login", required=True)
    label = fields.Char(string="Label")
    color = fields.Char(string="Color")
    last_switched_on = fields.Datetime(string="Last Switched On")

    _sql_constraints = [
        (
            "owner_login_uniq",
            "unique(owner_user_id, target_login)",
            "This account is already saved in your switcher.",
        ),
    ]

    @api.model
    def _ghori_us_account_to_dict(self, record):
        return {
            "id": record.id,
            "login": record.target_login or "",
            "label": record.label or record.target_login or "",
            "color": record.color or "",
            "lastSwitchedOn": (
                fields.Datetime.to_string(record.last_switched_on)
                if record.last_switched_on
                else False
            ),
        }

    @api.model
    def ghori_us_load(self):
        """Return the current user's saved accounts ordered MRU-first."""
        records = self.search([("owner_user_id", "=", self.env.user.id)])
        return {
            "accounts": [self._ghori_us_account_to_dict(rec) for rec in records],
        }

    @api.model
    def ghori_us_save(self, accounts):
        """Replace the current user's saved accounts with ``accounts``.

        ``accounts`` is a list of dicts: {login, label, color}. Owner is always
        forced to the current user, so a user can only manage their own rows.
        """
        owner = self.env.user
        existing = self.search([("owner_user_id", "=", owner.id)])
        kept_logins = set()
        existing_by_login = {
            (rec.target_login or "").strip().lower(): rec for rec in existing
        }
        for account in accounts or []:
            login = (account.get("login") or "").strip()
            if not login:
                continue
            key = login.lower()
            kept_logins.add(key)
            vals = {
                "target_login": login,
                "label": (account.get("label") or "").strip() or login,
                "color": account.get("color") or "",
            }
            record = existing_by_login.get(key)
            if record:
                record.write(vals)
            else:
                vals["owner_user_id"] = owner.id
                self.create(vals)
        # Drop rows the client no longer has.
        to_remove = existing.filtered(
            lambda rec: (rec.target_login or "").strip().lower() not in kept_logins
        )
        if to_remove:
            to_remove.unlink()
        return self.ghori_us_load()

    @api.model
    def ghori_us_mark_switched(self, login):
        """Stamp the MRU time for ``login`` (used for carousel ordering)."""
        login = (login or "").strip()
        if not login:
            return False
        record = self.search(
            [
                ("owner_user_id", "=", self.env.user.id),
                ("target_login", "=ilike", login),
            ],
            limit=1,
        )
        if record:
            record.last_switched_on = fields.Datetime.now()
        return True
