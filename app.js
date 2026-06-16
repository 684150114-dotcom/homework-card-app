// --- Main Entry Point (Application Orchestrator) ---
import { loadDatabase, getCurrentUser, login, resetDatabase } from './modules/state.js';
import { renderLoginScreen } from './modules/auth.js';
import { renderAppShell, updateGoogleDriveMock, updateSystemStats } from './modules/ui.js';
import { CONFIG } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. เริ่มต้นข้อมูลฐานข้อมูลในระบบ
    loadDatabase();

    // แสดง Mode Badge ในแผงจำลอง (Firebase vs LocalStorage)
    const modeBadge = document.getElementById('mode-badge');
    const modeBadgeText = document.getElementById('mode-badge-text');
    const configVal = document.getElementById('config-firebase-val');

    if (CONFIG.useFirebase) {
        if (modeBadge) modeBadge.style.cssText = 'margin-top:8px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;background:#e7f5ff;color:#1864ab;border:1px solid #a5d8ff';
        if (modeBadgeText) modeBadgeText.innerText = 'โหมดจริง: Firebase Cloud';
        if (configVal) { configVal.innerText = 'true'; configVal.style.color = '#1864ab'; }
    } else {
        if (modeBadgeText) modeBadgeText.innerText = 'โหมดจำลอง: LocalStorage';
        if (configVal) configVal.innerText = 'false';
    }

    const phoneScreen = document.getElementById('phone-screen');


    // 2. จัดการจำลองเวลาในแถบสถานะโทรศัพท์มือถือ (Simulated StatusBar Time)
    const timeSpan = document.querySelector('.phone-time');
    if (timeSpan) {
        const updateTime = () => {
            const now = new Date();
            timeSpan.innerText = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
        };
        updateTime();
        setInterval(updateTime, 1000 * 30);
    }

    // 3. ฟังก์ชันควบคุมการล็อกอินหลัก
    const checkSessionAndRender = () => {
        const user = getCurrentUser();
        if (user) {
            renderAppShell(phoneScreen, user, () => {
                // Callback เมื่อออกจากระบบ
                checkSessionAndRender();
            });
            syncSimulatorActiveButton(user.id);
        } else {
            renderLoginScreen(phoneScreen, (loggedInUser) => {
                // Callback เมื่อเข้าสู่ระบบสำเร็จ
                checkSessionAndRender();
            });
            clearSimulatorActiveButtons();
        }
    };

    // 4. ตั้งค่าปุ่มในแผงจำลองการทดสอบด้านข้าง (Simulator Panel Controls)
    const simUserBtns = document.querySelectorAll('.sim-user-btn');
    simUserBtns.forEach(btn => {
        btn.onclick = () => {
            const username = btn.dataset.username;
            const password = btn.dataset.password;
            
            // เข้าสู่ระบบแบบจำลองด่วน
            const user = login(username, password);
            if (user) {
                checkSessionAndRender();
            }
        };
    });

    const syncSimulatorActiveButton = (userId) => {
        simUserBtns.forEach(btn => {
            if (btn.dataset.username === userId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    const clearSimulatorActiveButtons = () => {
        simUserBtns.forEach(btn => btn.classList.remove('active'));
    };

    // 5. ปุ่มรีเซ็ตฐานข้อมูล
    const resetBtn = document.getElementById('reset-db-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm("ต้องการรีเซ็ตข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้นใช่หรือไม่? (ประวัติการทำการบ้านและการ์ดจะถูกรีเซ็ต)")) {
                resetDatabase();
            }
        };
    }

    // 6. อัปเดตส่วนควบคุมจำลองข้างเคียง
    updateGoogleDriveMock();
    updateSystemStats();

    // 7. ดักฟังการอัปเดตข้อมูลจากคลาวด์/ระบบเพื่อรีเฟรชหน้าจออัตโนมัติ (Real-time Synced UI)
    window.addEventListener('db_updated', () => {
        const user = getCurrentUser();
        if (user) {
            const appBody = document.getElementById('app-body-content');
            const hasDetailsOpen = appBody && appBody.querySelector('.details-page');
            const hasAddFormOpen = appBody && appBody.querySelector('.add-homework-form');
            // หากเปิดหน้ากรอกข้อมูลค้างไว้จะไม่ล้างฟอร์ม แต่จะอัปเดตแผงนอกจอแทน
            if (!hasDetailsOpen && !hasAddFormOpen) {
                renderAppShell(phoneScreen, user, () => {
                    checkSessionAndRender();
                });
            }
        }
        updateGoogleDriveMock();
        updateSystemStats();
    });

    // 8. รันแอปพลิเคชัน
    checkSessionAndRender();
});
