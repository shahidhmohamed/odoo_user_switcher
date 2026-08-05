# Ghori User Switcher

Fast account switcher for Odoo 18 — save logins in the browser and switch users without leaving the app.

## Open the switcher

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| **Primary shortcut** | `⌘` + `Shift` + `U` | `Ctrl` + `Shift` + `U` |
| **Alternate shortcut** | `Ctrl` + `⌘` + `U` | `Ctrl` + `Alt` + `U` |
| **Extra (Windows)** | — | `Ctrl` + `Shift` + `.` (when Ctrl+Shift+U is blocked by OS/extension) |
| **Navbar button** | Click the **users** icon (👥) in the top bar | Same |
| **User menu** | Profile avatar → **Switch account** | Same |

Press the same shortcut again to **close** the switcher.

### Mac notes

- Use **Command** (`⌘`), not **Control**, for the primary shortcut.
- **Ctrl + Shift + U** on Mac opens Odoo’s **company switcher** — not this tool.
- **Ctrl + Option + U** does **not** open this tool (Odoo ignores Option in hotkeys). Use **Ctrl + ⌘ + U** instead.
- **⌘ + Tab** switches macOS apps; that cannot be blocked from the browser.

### Windows notes

- Prefer **Ctrl + Shift + U**. If nothing happens, try **Ctrl + Alt + U** or **Ctrl + Shift + .**
- Some browsers/extensions or IME tools steal **Ctrl + Shift + U** before the page receives it — the extras above work around that.
- Hard-refresh after an upgrade: **Ctrl + Shift + R**.

---

## Account picker (main screen)

| Key | Action |
|-----|--------|
| `←` `→` or `↑` `↓` | Move between accounts |
| `Tab` / `Shift` + `Tab` | Next / previous account |
| `Enter` | Sign in to selected account |
| `N` or `+` | Open **Add account** form |
| `Esc` | Close switcher |

Click a card to select it. Click a saved account again to switch.

---

## Add account form

| Key | Action |
|-----|--------|
| `Tab` / `Shift` + `Tab` | Move between fields (stays inside the form) |
| `Enter` on **Save** | Save account |
| `Enter` on **Cancel** | Go back |
| `Esc` | Back to account picker |

Fields: Display name, Login (required), Password (optional), Remember password.

---

## Password form

Shown when switching to a saved account without a stored password.

| Key | Action |
|-----|--------|
| `Tab` | Move between fields |
| `Enter` | Confirm and switch |
| `Esc` | Back to account picker |

---

## Saved accounts

- **×** on a card removes that saved login from this browser.
- Passwords are only stored locally if **Remember password** was checked.
- Switching signs out the current session and reloads Odoo as the chosen user.

---

## Install / upgrade

From the `ghori_customizations` repo root:

```bash
./scripts/ghori-odoo-upgrade.sh ghori_user_switcher
```

Or install once:

```bash
docker exec odoo-web-ghori-dev-1 odoo -c /etc/odoo/odoo.conf -d main -i ghori_user_switcher --stop-after-init --no-http
```

After code changes, hard-refresh the browser: **⌘ + Shift + R** (Mac) or **Ctrl + Shift + R** (Windows).
