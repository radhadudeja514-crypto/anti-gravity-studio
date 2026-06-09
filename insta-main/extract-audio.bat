@echo off
title 3 Pillars - Audio Extractor
color 0A
echo.
echo  ==========================================
echo   3 PILLARS - YouTube Audio Extractor
echo   Extracts Hindi / Punjabi / English voice
echo  ==========================================
echo.

REM --- Check / install yt-dlp ---
where yt-dlp >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] yt-dlp not found. Installing via pip...
    pip install yt-dlp --quiet
    if %errorlevel% neq 0 (
        echo [!] pip not found. Downloading yt-dlp directly...
        powershell -Command "Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'yt-dlp.exe'"
    )
)

REM --- Check / install ffmpeg ---
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ffmpeg not found. Downloading...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile 'ffmpeg.zip'"
    powershell -Command "Expand-Archive ffmpeg.zip -DestinationPath . -Force"
    copy ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe . >nul
    del ffmpeg.zip >nul
)

REM --- Create output folder ---
set OUTPUT=%~dp03-pillars-audio
if not exist "%OUTPUT%" mkdir "%OUTPUT%"
echo [*] Saving audio to: %OUTPUT%
echo.

REM --- Download all 8 videos as MP3 ---
set URLS=^
    https://youtu.be/YGqdpcUXBpY ^
    https://youtu.be/SupXWnnW414 ^
    https://youtu.be/5_LHEZduqYo ^
    https://youtu.be/UZ9kZyxQYT8 ^
    https://youtu.be/cqRF5XThc50 ^
    https://youtu.be/FCGjyfjQ_VI ^
    https://youtu.be/_FaCT7iPYZ0 ^
    https://youtu.be/7--X_RxyMK8

for %%U in (%URLS%) do (
    echo [>] Downloading: %%U
    yt-dlp -x --audio-format mp3 --audio-quality 0 ^
        --embed-thumbnail ^
        --add-metadata ^
        -o "%OUTPUT%\%%(title)s.%%(ext)s" ^
        "%%U"
    echo.
)

echo.
echo  ==========================================
echo   ALL DONE! Check the 3-pillars-audio folder
echo  ==========================================
echo.
pause
