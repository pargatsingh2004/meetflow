# MeetFlow — reorganized project

This package reorganizes the existing updated MeetFlow project by responsibility. No theme redesign was made.

## Folders
- `frontend/templates/`: user-facing HTML pages.
- `frontend/static/`: user-facing CSS and JavaScript, including contrast improvements and moderation add-on.
- `backend/`: Django project, REST APIs, accounts, meeting models, LiveKit integration, migrations.
- `admin/frontend/templates/`: custom admin HTML (admin_portal and management).
- `admin/frontend/static/`: admin CSS.
- `admin/backend/admin_portal/`: custom admin URLs and views.
- `admin/backend/management/`: admin dashboard, attendance and monitoring backend.
- `livekit/`: bundled LiveKit executable.

The built-in Django admin app and `apps/*/admin.py` registrations remain in backend, because Django discovers these through installed apps. The custom MeetFlow admin portal is in `admin/`.

## Run (Windows PowerShell)
```powershell
cd meetflow\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Restore your private .env configuration (not included).
python manage.py migrate
python manage.py check
python manage.py runserver
```

Use the LiveKit configuration and environment variables from your existing deployment. Do not publish API secrets.

Django's settings.py adds `admin/backend` to the Python module search path and configures separate template/static roots, so no copying of frontend files into backend is needed.

## URLs
- `/` main site
- `/dashboard/` user dashboard
- `/admin/login/` custom admin login
- `/admin/` custom admin dashboard

## Note
This is a file-layout refactor. Python syntax and ZIP integrity are checked; full Django/LiveKit integration tests were not run.
