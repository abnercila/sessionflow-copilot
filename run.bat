@echo off
title SessionFlow AI - Meeting Transcriber & Process Copilot
echo ============================================================
echo   Iniciando SessionFlow AI (Transcripcion, OCR y Copiloto)
echo ============================================================
echo.
echo Abriendo servidor en http://localhost:8000 ...
start "" "http://localhost:8000"
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
