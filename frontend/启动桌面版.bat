@echo off
cd /d "%~dp0"
if not exist "node_modules" goto noinstall
if not exist "dist-app\index.html" (
  echo First run: building the app, please wait...
  call npm run build:single
)
if not exist "dist-app\index.html" goto nobuild
set "EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%EXE%" set "EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EXE%" goto noapp
set "URLP=%CD:\=/%"
start "" "%EXE%" --app="file:///%URLP%/dist-app/index.html" --window-size=1440,900 --user-data-dir="%CD%\.app-profile"
if exist "scripts\activate.ps1" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "scripts\activate.ps1" -ProfileDir "%CD%\.app-profile"
exit /b 0

:noinstall
echo [ERROR] node_modules not found in this folder:
echo         %CD%
echo         Run:  npm install
pause
exit /b 1

:nobuild
echo [ERROR] Build failed, dist-app\index.html was not created.
echo         Run manually:  npm run build:single
pause
exit /b 1

:noapp
echo [ERROR] Chrome or Edge not found.
pause
exit /b 1