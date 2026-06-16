// --- Authentication Module ---
import { login, logout, getCurrentUser, updatePassword } from './state.js';

export function renderLoginScreen(phoneScreen, onLoginSuccess) {
    phoneScreen.innerHTML = `
        <div class="login-screen">
            <div class="login-header">
                <div class="login-logo">
                    <i class="fa-solid fa-graduation-cap"></i>
                </div>
                <h2>สมุดการบ้านดิจิทัล</h2>
                <p>ระบบติดตามงานและการ์ดพิเศษ</p>
            </div>
            
            <div id="login-error-container"></div>
            
            <form id="login-form">
                <div class="form-group">
                    <label for="username">User ID</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-user"></i>
                        <input type="text" id="username" class="form-control" placeholder="กรอก User ID (เช่น M000)" required autocomplete="username">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="password">รหัสผ่าน</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-lock"></i>
                        <input type="password" id="password" class="form-control" placeholder="กรอกรหัสผ่าน" required autocomplete="current-password" style="padding-right: 40px;">
                        <i class="fa-solid fa-eye-slash toggle-password" id="toggle-login-pass" style="position: absolute; right: 14px; cursor: pointer; color: var(--gray);"></i>
                    </div>
                </div>
                
                <button type="submit" class="login-btn">เข้าสู่ระบบ</button>
            </form>
        </div>
    `;

    // ผูกการแสดง/ซ่อนรหัสผ่าน
    const togglePass = document.getElementById('toggle-login-pass');
    const passInput = document.getElementById('password');
    if (togglePass && passInput) {
        togglePass.onclick = () => {
            if (passInput.type === 'password') {
                passInput.type = 'text';
                togglePass.classList.remove('fa-eye-slash');
                togglePass.classList.add('fa-eye');
            } else {
                passInput.type = 'password';
                togglePass.classList.remove('fa-eye');
                togglePass.classList.add('fa-eye-slash');
            }
        };
    }

    const form = document.getElementById('login-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const usernameVal = document.getElementById('username').value.trim();
        const passwordVal = document.getElementById('password').value;
        const errContainer = document.getElementById('login-error-container');

        const user = login(usernameVal, passwordVal);
        if (user) {
            onLoginSuccess(user);
        } else {
            errContainer.innerHTML = `<div class="login-error">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>`;
        }
    });
}

// จัดการหน้าเปลี่ยนรหัสผ่าน
export function handleChangePassword(newPassVal, oldPassVal, currentUserId, callback) {
    const user = getCurrentUser();
    if (!user) {
        return { success: false, message: 'กรุณาเข้าสู่ระบบก่อน' };
    }

    if (user.pass !== oldPassVal) {
        return { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
    }

    if (newPassVal.length < 3) {
        return { success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 3 ตัวอักษร' };
    }

    const updated = updatePassword(currentUserId, newPassVal);
    if (updated) {
        if (callback) callback();
        return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ!' };
    }

    return { success: false, message: 'ไม่สามารถเปลี่ยนรหัสผ่านได้ในขณะนี้' };
}
