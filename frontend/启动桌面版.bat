@echo off
cd /d "%~dp0"
if not exist "dist-app\index.html" (
  if not exist "node_modules\.bin\vite.cmd" goto noinstall
  echo First run: building the app, please wait...
  call npm.cmd run build:single
  if errorlevel 1 goto nobuild
)
if not exist "dist-app\index.html" goto nobuild
start "" "%CD%\dist-app\index.html"
if errorlevel 1 goto noapp
exit /b 0

:noinstall
echo [ERROR] Vite is not installed in this folder:
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
echo [ERROR] Windows could not open the page with the default HTML app.
echo         Open dist-app\index.html in Chrome or Edge manually.
pause
exit /b 1
