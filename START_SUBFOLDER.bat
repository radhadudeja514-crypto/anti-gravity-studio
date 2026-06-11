@echo off
echo Stopping any existing Node.js servers...
taskkill /F /IM node.exe /T 2>nul
timeout /t 3 /nobreak >nul
echo Starting Anti Gravity Studio server from insta-main subfolder...
cd /d "C:\Users\bamet\Downloads\insta-main (2)\insta-main"
start "Anti Gravity Studio Server" cmd /k "node server-fixed.js"
echo Done! Server running on port 3005 from insta-main subfolder.
pause
