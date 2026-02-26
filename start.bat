@echo off
echo ========================================
echo  LinkedIn Recruiter Automation
echo  Messaging Co-Pilot Local Runner
echo ========================================
echo.

if not exist node_modules (
    echo ERROR: Dependencies not installed. Run install.bat first.
    pause
    exit /b 1
)

if not exist .env (
    echo ERROR: .env file not found. Copy .env.example to .env and configure it.
    pause
    exit /b 1
)

echo Starting server on port 3847...
echo Press Ctrl+C to stop.
echo.
node server.js
pause
