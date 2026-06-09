@echo off
title Anti Gravity Studio — Full Setup
color 0A
cd /d "%~dp0"

echo.
echo  ============================================
echo   ANTI GRAVITY STUDIO — FULL SETUP
echo  ============================================
echo.

:: Step 1 - Seed media into database
echo [1/3] Seeding media into database...
node inject-media.js
if errorlevel 1 (
  echo [!] Media seeding had issues but continuing...
)
echo.

:: Step 2 - Push fixes to GitHub
echo [2/3] Pushing fixes to GitHub...
git add -A
git commit -m "Fix: CORS open for Render, static gallery fallback, media seeded, 15 bugs fixed"
git push origin main
if errorlevel 1 (
  echo [!] Git push failed - you may need to set up git remote.
  echo     Try: git remote set-url origin https://github.com/radhadudeja514-crypto/insta.git
)
echo.

:: Step 3 - Restart server
echo [3/3] Restarting server with fixes...
echo Stopping any running node processes...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting server...
start "Anti-Gravity Studio" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3005/pillar-radha.html"
start "" "http://localhost:3005/pillar-veronica.html"
start "" "http://localhost:3005/pillar-tour.html"

echo.
echo  ============================================
echo   DONE! All 3 pillars should now show photos.
echo
echo   Radha:    http://localhost:3005/pillar-radha.html
echo   Veronica: http://localhost:3005/pillar-veronica.html
echo   Tour:     http://localhost:3005/pillar-tour.html
echo   Admin:    http://localhost:3005/admin/login.html
echo   Password: AGAdmin2026!
echo  ============================================
echo.
pause
