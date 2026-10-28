@echo off
title Agenda Directiva + Acceso Remoto
cd /d "%~dp0"

echo =============================================================
echo          INICIANDO AGENDA DIRECTIVA CON ACCESO REMOTO
echo =============================================================
echo.

:: Liberar el puerto 8080 si quedo alguna ventana o proceso colgado previo
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do (
    taskkill /f /pid %%a >nul 2>&1
)

node tunnel.js
pause
