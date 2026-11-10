@echo off
cd /d "%~dp0"
if not exist "dist-app\index.html" call npm run build:single
set "EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%EXE%" set "EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EXE%" goto noapp
set "URLP=%CD:\=/%"
start "" "%EXE%" --app="file:///%URLP%/dist-app/index.html" --window-size=1440,900 --user-data-dir="%CD%\.app-profile"
exit /b 0
:noapp
echo Chrome/Edge not found. Run: npm run dev
pause