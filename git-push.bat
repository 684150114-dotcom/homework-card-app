@echo off
chcp 65001 >nul
title Git Push - Homework Card App

echo ================================================
echo    Git Push ^| Homework Card App
echo ================================================
echo.

:: ไปที่โฟลเดอร์ของ .bat นี้เสมอ
cd /d "%~dp0"

:: ค้นหา git.exe ใน PATH ก่อน ถ้าไม่มีใช้ path ตายตัว
set GIT=git
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT=C:\Program Files\Git\cmd\git.exe"
    ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
        set "GIT=C:\Program Files (x86)\Git\cmd\git.exe"
    ) else (
        echo [ERROR] ไม่พบ Git! กรุณาติดตั้ง Git จาก https://git-scm.com
        pause
        exit /b 1
    )
)

:: ตรวจสอบว่าอยู่ใน git repo
%GIT% rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] โฟลเดอร์นี้ไม่ใช่ Git repository
    pause
    exit /b 1
)

:: แสดงสถานะ
echo [1] ตรวจสอบไฟล์ที่เปลี่ยนแปลง...
echo.
%GIT% status --short
echo.

:: ตรวจว่ามีอะไรใหม่ไหม
%GIT% status --porcelain > "%TEMP%\gitstatus.tmp" 2>&1
for %%A in ("%TEMP%\gitstatus.tmp") do if %%~zA == 0 (
    echo ไม่มีไฟล์ที่เปลี่ยนแปลง ไม่จำเป็นต้อง commit
    echo.
    del "%TEMP%\gitstatus.tmp" >nul 2>&1
    pause
    exit /b 0
)
del "%TEMP%\gitstatus.tmp" >nul 2>&1

:: ถามข้อความ commit
echo [2] กรอกข้อความอธิบายการเปลี่ยนแปลง (Enter เพื่อใช้ "update"):
set "MSG="
set /p MSG="  >> "
if "%MSG%"=="" set "MSG=update"

:: git add
echo.
echo [3] กำลัง add ไฟล์ทั้งหมด...
%GIT% add .

:: git commit
%GIT% commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo.
    echo ไม่สามารถ commit ได้ (อาจไม่มีอะไรใหม่)
    pause
    exit /b 0
)

:: git push
echo.
echo [4] กำลัง push ขึ้น GitHub...
%GIT% push origin main
if %errorlevel% == 0 (
    echo.
    echo ================================================
    echo   สำเร็จ! Push ขึ้น GitHub เรียบร้อยแล้ว
    echo   https://github.com/684150114-dotcom/homework-card-app
    echo ================================================
) else (
    echo.
    echo [ERROR] push ไม่สำเร็จ อาจเกิดจาก:
    echo   - ไม่มีอินเทอร์เน็ต
    echo   - GitHub Token หมดอายุ (ลอง push ผ่าน Git Bash แทน)
)
echo.
pause
