@echo off
title Anti-Gravity Studio — Voice Processor
color 0A
echo.
echo  ================================================
echo   VOICE PROCESSOR — Transcribe + Translate
echo   Uses OpenAI Whisper (free, runs locally)
echo   Converts your video voice to text in
echo   English, Hindi, and Punjabi
echo  ================================================
echo.

REM ── Install Python dependencies ─────────────────
echo [*] Installing Whisper (first run only)...
pip install openai-whisper --quiet
pip install pydub --quiet

REM ── Check for input video ────────────────────────
set /p VIDFILE="[?] Drag & drop your video/audio file here, then press Enter: "
if not exist "%VIDFILE%" (
  echo [!] File not found: %VIDFILE%
  pause & exit /b 1
)

set OUTPUT=%~dp0voice-output
if not exist "%OUTPUT%" mkdir "%OUTPUT%"

echo.
echo [*] Transcribing voice with Whisper (medium model)...
echo     This takes 1-3 minutes depending on video length.
echo.

python3 << 'PYEOF'
import sys, os, json
try:
    import whisper
    model = whisper.load_model("medium")
    
    video = r"%VIDFILE%"
    output_dir = r"%OUTPUT%"
    base = os.path.splitext(os.path.basename(video))[0]
    
    print(f"[>] Transcribing: {base}")
    
    # Transcribe with auto language detection
    result = model.transcribe(video, verbose=False)
    lang = result.get('language', 'unknown')
    print(f"[✓] Detected language: {lang}")
    
    # Save original transcript
    with open(f"{output_dir}/{base}_original.txt", "w", encoding="utf-8") as f:
        f.write(result["text"])
    print(f"[✓] Original transcript saved")
    
    # Translate to English
    en = model.transcribe(video, task="translate", verbose=False)
    with open(f"{output_dir}/{base}_english.txt", "w", encoding="utf-8") as f:
        f.write(en["text"])
    print(f"[✓] English translation saved")
    
    # Save timestamped segments as SRT subtitles
    with open(f"{output_dir}/{base}.srt", "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"], 1):
            s = seg["start"]; e = seg["end"]
            f.write(f"{i}\n")
            f.write(f"{int(s//3600):02}:{int((s%3600)//60):02}:{s%60:06.3f} --> {int(e//3600):02}:{int((e%3600)//60):02}:{e%60:06.3f}\n".replace(".",","))
            f.write(f"{seg['text'].strip()}\n\n")
    print(f"[✓] SRT subtitles saved")
    
    print(f"\n[✓] ALL DONE — check: {output_dir}")
    print(f"    For Hindi/Punjabi translation, paste the English text")
    print(f"    into Google Translate or DeepL.")
    
except ImportError:
    print("[!] Whisper not installed properly. Try: pip install openai-whisper")
except Exception as e:
    print(f"[!] Error: {e}")
PYEOF

echo.
pause
