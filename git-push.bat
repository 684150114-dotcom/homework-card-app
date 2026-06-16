@echo off
chcp 65001 >nul
echo ================================================
echo   Git Push - Homework Card App
echo ================================================
echo.

:: ไปที่โฟลเดอร์โปรเจกต์
cd /d "%~dp0"

:: ดูสถานะ
echo [1/4] กำลังตรวจสอบไฟล์ที่เปลี่ยนแปลง...
echo.
"C:\Program Files\Git\cmd\git.exe" status
echo.

:: ถามว่ามีอะไรจะ commit ไหม
"C:\Program Files\Git\cmd\git.exe" diff --quiet
if %errorlevel% == 0 (
    "C:\Program Files\Git\cmd\git.exe" status --porcelain | findstr /r "." >nul 2>&1
    if %errorlevel% neq 0 (
        echo ไม่มีไฟล์ที่เปลี่ยนแปลง - ไม่จำเป็นต้อง commit
        echo.
        pause
        exit /b 0
    )
)

:: ถามข้อความ commit
echo [2/4] กรอกข้อความอธิบายการเปลี่ยนแปลง:
set /p MSG="  >> "
if "%MSG%"=="" set MSG=update

:: git add ทั้งหมด
echo.
echo [3/4] กำลัง add ไฟล์ทั้งหมด...
"C:\Program Files\Git\cmd\git.exe" add .

:: git commit
"C:\Program Files\Git\cmd\git.exe" commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo.
    echo ไม่มีอะไรใหม่ที่จะ commit
    pause
    exit /b 0
)

:: git push
echo.
echo [4/4] กำลัง push ขึ้น GitHub...
"C:\Program Files\Git\cmd\git.exe" push origin main
if %errorlevel% == 0 (
    echo.
    echo ================================================
    echo   Push สำเร็จ! โค้ดขึ้น GitHub แล้ว
    echo   https://github.com/684150114-dotcom/homework-card-app
    echo ================================================
) else (
    echo.
    echo เกิดข้อผิดพลาดในการ push กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
    echo และ token ของ GitHub
)
echo.
pause
