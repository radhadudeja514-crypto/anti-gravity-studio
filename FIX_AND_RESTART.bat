@echo off
echo ====================================================
echo  Anti Gravity Studio - Fix Names + Restart Server
echo ====================================================
echo.
echo Step 1: Fixing name typos across all HTML files...
powershell -ExecutionPolicy Bypass -Command "& { $dir = 'C:\Users\bamet\Downloads\insta-main (2)'; Get-ChildItem -Path $dir -Filter '*.html' -Recurse | ForEach-Object { $f = $_.FullName; $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8); $orig = $c; $c = $c.Replace('radhadudega514@gmail.com', 'radhadudeja514@gmail.com'); $c = $c.Replace('radhaadudega514@gmail.com', 'radhadudeja514@gmail.com'); $c = $c.Replace('Radha Dudega', 'Radhaa Dudeja'); $c = $c.Replace('RadhaDudega', 'RadhaDudeja'); $c = $c.Replace('@RadhaDudega', '@RadhaDudeja'); $c = $c.Replace('radhaadudega', 'RadhaDudeja'); $c = $c.Replace('Radhaa Dudega', 'Radhaa Dudeja'); if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8); Write-Host 'Fixed:' $f } } }"
echo.
echo Step 2: Stopping existing Node.js server...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Step 3: Starting server from root directory...
cd /d "C:\Users\bamet\Downloads\insta-main (2)"
start "Anti Gravity Studio" cmd /k "node server-fixed.js"
echo.
echo ====================================================
echo  DONE! Server restarted. Refresh browser to verify.
echo ====================================================
pause
