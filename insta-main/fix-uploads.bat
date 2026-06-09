@echo off
echo Creating upload directories...
set P=C:\gig-portfolio\How to use Claude
mkdir "%P%\uploads" 2>nul
mkdir "%P%\uploads\sangeet" 2>nul
mkdir "%P%\uploads\corporate" 2>nul
mkdir "%P%\uploads\tour" 2>nul
mkdir "%P%\uploads\main" 2>nul

echo Copying fixed files...
copy /y "%P%\server-fixed.js" "%P%\server.js"
copy /y "%P%\admin-media-fixed.html" "%P%\admin\media.html"

echo Creating .env...
if not exist "%P%\.env" (
echo PORT=3005> "%P%\.env"
echo SESSION_SECRET=antigravity_dev_2026>> "%P%\.env"
echo ADMIN_USER_PASSWORD=RD@Admin2026!>> "%P%\.env"
)

echo.
echo ✅ All fixes applied! Now run SETUP-AND-RUN.bat
pause
