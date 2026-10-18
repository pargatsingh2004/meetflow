@echo off
setlocal
cd /d "%~dp0backend"
where py >nul 2>nul
if errorlevel 1 (
 echo Python launcher not found. Install Python 3.11 or 3.12 and enable PATH.
 pause
 exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
 echo Creating Python virtual environment...
 py -3.12 -m venv .venv 2>nul
 if errorlevel 1 py -m venv .venv
 if errorlevel 1 goto failed
)
if not exist ".dependencies_installed" (
 echo Installing Python packages, please wait...
 ".venv\Scripts\python.exe" -m pip install --upgrade pip
 ".venv\Scripts\python.exe" -m pip install -r requirements.txt
 if errorlevel 1 goto failed
 echo installed> .dependencies_installed
)
if not exist ".env" (
 copy /y ".env.example" ".env" >nul
 echo Created backend\.env from example. Configure LiveKit and SMTP before using these features.
)
echo Applying database migrations...
".venv\Scripts\python.exe" manage.py migrate
if errorlevel 1 goto failed
start "" "http://127.0.0.1:8000/"
echo.
echo MeetFlow running at http://127.0.0.1:8000/
echo Admin: http://127.0.0.1:8000/control-panel/
echo Real video calls require a running LiveKit server.
".venv\Scripts\python.exe" manage.py runserver 127.0.0.1:8000
pause
exit /b 0
:failed
echo Setup failed. Read RUN_ON_WINDOWS.md for help.
pause
exit /b 1
