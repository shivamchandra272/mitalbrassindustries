@echo off
setlocal
set "PHP_EXE=C:\xampp\php\php.exe"
set "PROJECT_DIR=%~dp0."
set "ADMIN_URL=http://127.0.0.1:8082/admin.html"
set "HEALTH_URL=http://127.0.0.1:8082/index.php?action=health"

if not exist "%PHP_EXE%" (
    echo XAMPP PHP was not found at %PHP_EXE%.
    echo Update PHP_EXE in Admin.bat to match your XAMPP installation.
    pause
    exit /b 1
)

netstat -ano -p tcp | findstr /C:"127.0.0.1:8082" | findstr /C:"LISTENING" >nul
if errorlevel 1 (
    start "Mital Brass PHP Server" /min "%PHP_EXE%" -S 127.0.0.1:8082 -t "%PROJECT_DIR%"
)

set "ATTEMPTS=0"
:wait_for_backend
powershell.exe -NoProfile -Command "try { $health = Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($health.ok) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto backend_ready
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 goto backend_unavailable
timeout /t 1 /nobreak >nul
goto wait_for_backend

:backend_unavailable
echo Could not connect to the admin PHP API and MySQL database.
echo Start MySQL in the XAMPP Control Panel, then check config.php if it still fails.
pause
exit /b 1

:backend_ready
start "" "%ADMIN_URL%"
endlocal
