@echo off
title Anti-Gravity Studio — Setup & Launch
color 0B
echo.
echo  ==============================================
echo   ANTI-GRAVITY STUDIO — ONE-CLICK LAUNCH
echo  ==============================================
echo.

set ROOT=%~dp0
cd /d "%ROOT%"

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [!] Node.js not found.
  echo     Download from https://nodejs.org ^(LTS version^)
  pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NVER=%%v
echo [OK] Node.js %NVER%

:: Create .env if missing
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo [OK] Created .env — edit it to set your password
  ) else (
    echo PORT=3005 > .env
    echo SESSION_SECRET=ag_dev_secret_2026 >> .env
    echo ADMIN_USER_PASSWORD=RD@Admin2026! >> .env
    echo ADMIN_USER_EMAIL=admin@antigravitystudio.in >> .env
  )
)

:: Create upload directories
if not exist "uploads\sangeet"    mkdir "uploads\sangeet"
if not exist "uploads\corporate"  mkdir "uploads\corporate"
if not exist "uploads\tour"       mkdir "uploads\tour"
if not exist "uploads\main"       mkdir "uploads\main"
echo [OK] Upload folders ready

:: Install dependencies
echo.
echo [*] Installing packages ^(first run takes 1-2 min^)...
call npm install --legacy-peer-deps --ignore-scripts 2>nul
if errorlevel 1 (
  echo [!] npm install had issues — trying alternate method...
  call npm install --legacy-peer-deps
)
echo [OK] Packages installed

:: Launch
echo.
echo  ==============================================
echo   Launching on http://localhost:3005
echo   Admin:    http://localhost:3005/admin/
echo   Password: RD@Admin2026!  ^(change in .env^)
echo  ==============================================
echo.
timeout /t 2 /nobreak >nul
start "" "http://localhost:3005"
start "" "http://localhost:3005/admin/login.html"

node server.js
pause
