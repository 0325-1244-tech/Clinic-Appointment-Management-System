@echo off
REM Builds the project (first time only) and starts the application.
cd /d "%~dp0"
if not exist out\clinic\Main.class call build.bat
start "" javaw -cp out clinic.Main
