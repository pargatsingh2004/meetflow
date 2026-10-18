MEETFLOW — SEPARATED SOURCE + ORIGINAL THEME

Structure:
  frontend/templates       user HTML pages
  frontend/static          original CSS, JS and images + feature scripts
  backend                  Django apps, settings, migrations, LiveKit APIs
  admin/frontend           admin templates and CSS
  admin/backend            admin views and routes
  livekit                  local server executable and configuration

Fixes:
- Removed erroneous frontend/static/static nesting that caused CSS/JS 404s.
- Restored CSS/theme scripts from original meetflowfinal.zip.
- Preserved meeting scheduling and moderation files from separated project.
- Set STATIC_URL to /static/.

Run (PowerShell from meetflow/backend):
  python -m venv ..\.venv
  ..\.venv\Scripts\Activate.ps1
  python -m pip install -r requirements.txt
  python -m pip install livekit-api
  python manage.py check
  python manage.py migrate
  python manage.py findstatic css/style.css
  python manage.py runserver

Restore your existing backend/.env and backend/db.sqlite3 from a secure backup
if upgrading an existing installation. Never publish secrets.

JWT 401 errors are separate from CSS 404s. Log in again and confirm
token persistence, refresh and Authorization headers. This archive
does not claim to resolve authentication failures.

No complete runtime/LiveKit integration test has been performed.
