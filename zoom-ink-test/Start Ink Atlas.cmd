@echo off
cd /d "%~dp0"
echo The Ink Atlas: http://127.0.0.1:8001
echo Keep this window open while using the atlas.
node tools\serve.mjs 8001
pause
