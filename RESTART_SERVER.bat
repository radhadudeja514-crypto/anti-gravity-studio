@echo off
echo Stopping existing Node.js server...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul
echo Starting Anti Gravity Studio server from correct directory...
cd /d "C:\Users\bamet\Downloads\insta-main (2)"
start "Anti Gravity Studio" cmd /k "node server-fixed.js"
echo Done! Server restarted from correct folder.
