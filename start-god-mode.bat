@echo off
echo ====================================================
echo    ANTI GRAVITY STUDIO - GOD MODE INITIALIZATION
echo ====================================================
echo.

echo [1/3] Starting Express Server...
start "AG Server" /B node server.js

echo [2/3] Starting Media God (Compression ^& Backup Daemon)...
start "AG Media God" /B node media-god.js

echo [3/3] Starting AI Broadcaster (Social Posting Daemon)...
start "AG Broadcaster" /B node broadcaster.js

echo.
echo ====================================================
echo ALL SYSTEMS ONLINE.
echo Server:      http://localhost:3005
echo Admin Panel: http://localhost:3005/admin/login.html
echo ====================================================
echo Press any key to stop all processes...
pause >nul

taskkill /F /IM node.exe
echo All processes terminated.
