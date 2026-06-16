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
                    <label for="username">ชื่อผู้ใช้ (User ID)</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-user"></i>
                        <input type="text" id="username" class="form-control" placeholder="กรอก User ID เช่น student1, teacher1" required autocomplete="username">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="password">รหัสผ่าน</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-lock"></i>
                        <input type="password" id="password" class="form-control" placeholder="กรอกรหัสผ่าน" required autocomplete="current-password">
                    </div>
                </div>
                
                <button type="submit" class="login-btn">เข้าสู่ระบบ</button>
            </form>

            <div class="auth-notice">
                <p><strong>บัญชีสำหรับการทดสอบระบบ:</strong></p>
                <p>ครู: <code>teacher1</code> / รหัสผ่าน: <code>123</code></p>
                <p>นักเรียน 1: <code>student1</code> / รหัสผ่าน: <code>123</code></p>
                <p>นักเรียน 2: <code>student2</code> / รหัสผ่าน: <code>123</code></p>
                <p>ผู้ปกครอง: <code>parent1</code> / รหัสผ่าน: <code>123</code></p>
            </div>
        </div>
    `;

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
