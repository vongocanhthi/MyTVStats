@echo off
REM Setup lần đầu — Windows
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Can cai Python 3.10+ : https://www.python.org/downloads/
  echo Khi cai, tick "Add python.exe to PATH"
  pause
  exit /b 1
)

python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -U pip
pip install -r requirements.txt

if not exist config.json (
  copy /Y config.example.jsonc config.json >nul
  echo Da tao config.json tu config.example.jsonc — mo file va dien credentials.
) else (
  echo config.json da ton tai — giu nguyen.
)

if not exist credentials mkdir credentials

echo.
echo Tiep theo:
echo   1. Copy Service Account JSON vao credentials\service_account.json
echo   2. Sua config.json ^(Gmail + DeepSeek key^)
echo   3. .venv\Scripts\activate.bat
echo   4. python main.py run-once --dry-run
echo   5. python main.py sync-autostart
pause
