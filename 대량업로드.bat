@echo off
rem Bulk upload launcher. Double-click, or drag an Excel file onto this icon.
rem Kept ASCII-only on purpose: the Korean prompts live in
rem scripts\bulk-upload-wizard.ts, since non-ASCII text in .bat files breaks
rem depending on the console code page.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing packages for the first run...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

node --import tsx scripts\bulk-upload-wizard.ts %1

echo.
pause
