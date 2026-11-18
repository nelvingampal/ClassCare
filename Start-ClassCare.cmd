@echo off
cd /d "%~dp0"
node scripts\start-local.cjs
if errorlevel 1 pause
