@echo off
echo ========================================
echo  LinkedIn Recruiter Automation Setup
echo  Messaging Co-Pilot Local Runner
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)
echo.

echo Installing Chromium browser for Playwright...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Playwright browser install failed!
    pause
    exit /b 1
)
echo.

if not exist .env (
    echo Creating .env from template...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env with your settings before running!
) else (
    echo .env already exists, skipping copy.
)
echo.

echo ========================================
echo  Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Edit .env if you haven't already
echo   2. Run start.bat to launch
echo.
pause
