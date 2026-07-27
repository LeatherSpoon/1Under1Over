@echo off
title Processing Power - asset watcher (.blend -> models/)
cd /d "%~dp0"
node watch-assets.mjs
pause
