@echo off
title Anti Gravity Studio — Server
cd /d "%~dp0"
echo Installing dependencies...
call npm install
echo.
echo Starting server...
node server-fixed.js
pause
