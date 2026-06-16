// --- UI Rendering Module (Role-based Views) ---
import {
    loadDatabase,
    saveDatabase,
    getCurrentUser,
    logout,
    getStudentsInClass,
    getHomeworkForStudent,
    isHomeworkAlerted,
    submitHomework,
    getSubmissionsForHomework,
    gradeSubmission,
    toggleMissingAlert,
    getGradesForStudent,
    getStudentCards,
    useLateSubmissionCard,
    teacherGiveCardToStudent,
    isStudentDelegated,
    toggleDelegation,
    addHomework,
    updateSubjectName,
    addSubject,
    deleteSubject,
    createUser,
    resetDatabase,
    addClass,
    deleteClass,
    updateStudentClass,
    deleteUser
} from './state.js';
import { handleChangePassword } from './auth.js';
import { renderCreateQRView, renderScanView } from './qr.js';

// เก็บสถานะการทำงานภายในหน้า UI (UI View State)
let activeSubjectTab = 'คอมพิวเตอร์';
let currentActiveView = 'homework'; // homework, grades, cards, settings, teacherSubmissions, teacherDelegation, classManagement
let teacherSelectedClass = null; // ห้องเรียนที่ครูเลือกอยู่ (null = แสดงทุกห้อง)

// บีบอัดรูปภาพด้วย HTML5 Canvas ให้ขนาดไม่เกิน 100KB (100 * 1024 bytes)
async function compressImage(file, maxSizeBytes = 100 * 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // ปรับขนาดรูปให้เล็กลงหากใหญ่เกินไป
                const maxDim = 1000;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                let quality = 0.9;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                const getByteSize = (url) => {
                    const base64Str = url.substring(url.indexOf(',') + 1);
                    return Math.round(base64Str.length * 3 / 4);
                };

                // วนลูปปรับลดคุณภาพรูปภาพทีละนิดจนขนาดต่ำกว่ากำหนด
                while (getByteSize(dataUrl) > maxSizeBytes && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                
                // หากลดคุณภาพแล้วขนาดก็ยังไม่ต่ำกว่า 100KB ให้ทำการลดขนาด (Downscale) ลงเพิ่มอีก
                if (getByteSize(dataUrl) > maxSizeBytes) {
                    let scale = 0.8;
                    while (scale > 0.1) {
                        const sCanvas = document.createElement('canvas');
                        sCanvas.width = Math.round(width * scale);
                        sCanvas.height = Math.round(height * scale);
                        const sCtx = sCanvas.getContext('2d');
                        sCtx.drawImage(img, 0, 0, sCanvas.width, sCanvas.height);
                        dataUrl = sCanvas.toDataURL('image/jpeg', 0.5);
                        if (getByteSize(dataUrl) <= maxSizeBytes) {
                            break;
                        }
                        scale -= 0.2;
                    }
                }
                
                resolve(dataUrl);
            };
            img.onerror = (e) => reject(e);
        };
        reader.onerror = (e) => reject(e);
    });
}


// ดึงไอคอนนำทางสำหรับเมนูล่างตามบทบาท
function getNavItems(role) {
    if (role === 'teacher') {
        return [
            { id: 'homework', label: 'การบ้าน', icon: 'fa-book-open' },
            { id: 'teacherSubmissions', label: 'ตรวจงาน', icon: 'fa-clipboard-check' },
            { id: 'teacherDelegation', label: 'ผู้ช่วยแอดงาน', icon: 'fa-user-shield' },
            { id: 'classManagement', label: 'จัดการห้องเรียน', icon: 'fa-chalkboard' },
            { id: 'settings', label: 'ตั้งค่า', icon: 'fa-sliders' }
        ];
    } else if (role === 'student') {
        return [
            { id: 'homework', label: 'งานค้าง', icon: 'fa-list-check' },
            { id: 'grades', label: 'คะแนน', icon: 'fa-star' },
            { id: 'cards', label: 'การ์ดของฉัน', icon: 'fa-id-card' },
            { id: 'settings', label: 'ตั้งค่า', icon: 'fa-sliders' }
        ];
    } else if (role === 'parent') {
        return [
            { id: 'homework', label: 'งานของลูก', icon: 'fa-child-reaching' },
            { id: 'grades', label: 'คะแนนลูก', icon: 'fa-chart-line' },
            { id: 'settings', label: 'ตั้งค่า', icon: 'fa-sliders' }
        ];
    }
    return [];
}

// -------------------------------------------------------------
// 1. เรนเดอร์โครงสร้างหลัก (App Shell)
// -------------------------------------------------------------
export function renderAppShell(phoneScreen, user, onLogout) {
    const navItems = getNavItems(user.role);
    
    // ตั้งค่ารูปภาพโปรไฟล์ตามบทบาท
    let avatarIcon = 'fa-user-graduate';
    let avatarClass = 'student-a';
    if (user.role === 'teacher') { avatarIcon = 'fa-chalkboard-user'; avatarClass = 'teacher'; }
    if (user.role === 'parent') { avatarIcon = 'fa-people-roof'; avatarClass = 'parent'; }

    // ตรวจสอบการแจ้งเตือนสีแดงค้างส่ง
    const db = loadDatabase();
    let redAlertHtml = '';
    if (user.role === 'student') {
        const hasRedAlert = db.missingAlerts && db.missingAlerts[user.id] && db.missingAlerts[user.id].length > 0;
        if (hasRedAlert) {
            redAlertHtml = `
                <div class="alert-top-bar">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>มีการบ้านค้างส่งด่วน! กรุณาส่งงานที่ค้าง</span>
                </div>
            `;
        }
    } else if (user.role === 'parent') {
        const linkedStudents = user.linkedStudents || [];
        const alertedStudents = linkedStudents.filter(sid => db.missingAlerts && db.missingAlerts[sid] && db.missingAlerts[sid].length > 0);
        if (alertedStudents.length > 0) {
            const studentNames = alertedStudents.map(sid => db.users[sid] ? db.users[sid].name.split(' ')[0] : sid).join(', ');
            redAlertHtml = `
                <div class="alert-top-bar">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>ลูกของคุณ (${studentNames}) มีการบ้านค้างส่งด่วน!</span>
                </div>
            `;
        }
    }

    phoneScreen.innerHTML = `
        <div class="app-shell">
            ${redAlertHtml}
            <!-- Header -->

            <div class="app-header">
                <div class="user-profile-header">
                    <div class="user-header-avatar ${avatarClass}">
                        <i class="fa-solid ${avatarIcon}"></i>
                    </div>
                    <div class="user-header-info">
                        <span class="user-header-name">${user.name}</span>
                        <span class="user-header-id">ID: ${user.id} ${user.class ? `| ห้อง ${user.class}` : ''}</span>
                    </div>
                </div>
                <button id="logout-btn" style="border: none; background: none; color: var(--danger); cursor: pointer; font-size: 1.1rem;" title="ออกจากระบบ">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>

            <!-- Body Area -->
            <div class="app-body" id="app-body-content">
                <!-- เนื้อหาเมนูย่อยจะมาโหลดที่นี่ -->
            </div>

            <!-- Bottom Navigation Bar -->
            <nav class="app-nav">
                ${navItems.map(item => `
                    <div class="nav-item ${item.id === currentActiveView ? 'active' : ''}" data-view="${item.id}">
                        <i class="fa-solid ${item.icon}"></i>
                        <span>${item.label}</span>
                    </div>
                `).join('')}
            </nav>
        </div>
    `;

    // ผูกปุ่ม Logout
    document.getElementById('logout-btn').onclick = () => {
        logout();
        onLogout();
    };

    // ผูกปุ่มแท็บเนวิเกชันด้านล่าง
    const navButtons = phoneScreen.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
        btn.onclick = () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentActiveView = btn.dataset.view;
            renderActiveView(phoneScreen, user);
        };
    });

    // เริ่มเรนเดอร์หน้าจอเริ่มต้น
    renderActiveView(phoneScreen, user);
}

// โหลดข้อมูลขึ้นหน้าจอตามเมนูที่กด
function renderActiveView(phoneScreen, user) {
    const bodyContent = document.getElementById('app-body-content');
    if (!bodyContent) return;

    // ล้างหน้าจอหลักก่อน
    bodyContent.innerHTML = "";

    // ดึงรหัสนักเรียนจริงในการแสดงผล (หากเป็นผู้ปกครอง จะดึงข้อมูลลูกคนแรกมาแทน)
    const db = loadDatabase();
    let targetStudentId = user.id;
    let targetClass = user.class;

    if (user.role === 'parent') {
        const studentId = user.linkedStudents ? user.linkedStudents[0] : null;
        if (studentId && db.users[studentId]) {
            targetStudentId = studentId;
            targetClass = db.users[studentId].class;
        } else {
            bodyContent.innerHTML = `<p style="color:var(--gray); text-align:center; padding: 20px;">ไม่พบบัญชีลูกที่เชื่อมต่ออยู่ กรุณาติดต่อคุณครู</p>`;
            return;
        }
    }

    switch (currentActiveView) {
        case 'homework':
            renderHomeworkTab(bodyContent, user, targetStudentId, targetClass, phoneScreen);
            break;
        case 'grades':
            renderGradesMenu(bodyContent, targetStudentId);
            break;
        case 'cards':
            renderCardsMenu(bodyContent, user, phoneScreen);
            break;
        case 'settings':
            renderSettingsMenu(bodyContent, user, phoneScreen);
            break;
        case 'teacherSubmissions':
            renderTeacherSubmissions(bodyContent, user, phoneScreen);
            break;
        case 'teacherDelegation':
            renderTeacherDelegation(bodyContent, user);
            break;
        case 'classManagement':
            renderClassManagement(bodyContent, user, phoneScreen);
            break;
    }
}

// -------------------------------------------------------------
// 2. เรนเดอร์เมนู: รายการการบ้าน (เรียงตามกำหนดส่ง, มีระบบแท็บรายวิชา)
// -------------------------------------------------------------
function renderHomeworkTab(container, user, studentId, classId, phoneScreen) {
    const db = loadDatabase();

    // ---- แถบเลือกห้องเรียนสำหรับครู ----
    if (user.role === 'teacher') {
        const classes = db.classes || [];
        // ตั้งค่า default ห้องเรียนแรก ถ้ายังไม่ได้เลือก
        if (!teacherSelectedClass && classes.length > 0) {
            teacherSelectedClass = classes[0];
        }
        // Override classId ด้วยห้องที่ครูเลือก
        classId = teacherSelectedClass || classId;

        const classSelectorWrapper = document.createElement('div');
        classSelectorWrapper.style.cssText = 'display:flex; gap:8px; padding:8px 12px; overflow-x:auto; flex-shrink:0; background:var(--gray-light); border-radius:10px; margin-bottom:8px;';

        classes.forEach(cls => {
            const btn = document.createElement('button');
            btn.textContent = `ห้อง ${cls}`;
            btn.style.cssText = `white-space:nowrap; padding:6px 14px; border-radius:20px; border:1.5px solid var(--primary); font-family:var(--font-normal); font-size:0.82rem; cursor:pointer; background:${cls === teacherSelectedClass ? 'var(--primary)' : 'white'}; color:${cls === teacherSelectedClass ? 'white' : 'var(--primary)'}; font-weight:600; transition: all 0.2s;`;
            btn.onclick = () => {
                teacherSelectedClass = cls;
                renderHomeworkTab(container, user, studentId, cls, phoneScreen);
            };
            classSelectorWrapper.appendChild(btn);
        });
        container.appendChild(classSelectorWrapper);
    }
    // (db already loaded above)
    
    // 1. สร้างแถบสไลด์แท็บรายวิชา
    const tabsWrapper = document.createElement('div');
    tabsWrapper.className = 'subject-tabs-wrapper';

    // เพิ่มแท็บวิชาปกติ
    db.subjects.forEach(subj => {
        const tab = document.createElement('button');
        tab.className = `subject-tab ${subj === activeSubjectTab ? 'active' : ''}`;
        tab.innerHTML = `
            <span>${subj}</span>
        `;
        
        // ถ้าเป็นคุณครู สามารถแก้ไขชื่อวิชา/ลบวิชาได้
        if (user.role === 'teacher') {
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen edit-tab-btn';
            editIcon.onclick = (e) => {
                e.stopPropagation(); // ไม่ให้ทริกเกอร์เลือกแท็บ
                const newTitle = prompt(`แก้ไขชื่อรายวิชา "${subj}" เป็น:`, subj);
                if (newTitle && newTitle.trim() !== "") {
                    if (updateSubjectName(subj, newTitle.trim())) {
                        activeSubjectTab = newTitle.trim();
                        renderHomeworkTab(container, user, studentId, classId, phoneScreen);
                    }
                }
            };
            tab.appendChild(editIcon);
        }

        tab.onclick = () => {
            tabsWrapper.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeSubjectTab = subj;
            loadHomeworkList(homeworkListDiv, user, studentId, classId, phoneScreen);
        };
        tabsWrapper.appendChild(tab);
    });

    // 2. แท็บ "ส่งแล้ว" (Submitted)
    const submittedTab = document.createElement('button');
    submittedTab.className = `subject-tab ${activeSubjectTab === 'ส่งแล้ว' ? 'active' : ''}`;
    submittedTab.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> ส่งแล้ว`;
    submittedTab.onclick = () => {
        tabsWrapper.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
        submittedTab.classList.add('active');
        activeSubjectTab = 'ส่งแล้ว';
        loadHomeworkList(homeworkListDiv, user, studentId, classId, phoneScreen);
    };
    tabsWrapper.appendChild(submittedTab);

    // 3. ปุ่มเพิ่มวิชาใหม่สำหรับครู
    if (user.role === 'teacher') {
        const addSubjBtn = document.createElement('button');
        addSubjBtn.className = 'subject-tab';
        addSubjBtn.style.color = 'var(--primary)';
        addSubjBtn.innerHTML = `<i class="fa-solid fa-plus"></i> เพิ่มรายวิชา`;
        addSubjBtn.onclick = () => {
            const name = prompt("กรอกชื่อวิชาใหม่:");
            if (name && name.trim() !== "") {
                if (addSubject(name.trim())) {
                    activeSubjectTab = name.trim();
                    renderHomeworkTab(container, user, studentId, classId, phoneScreen);
                }
            }
        };
        tabsWrapper.appendChild(addSubjBtn);
    }

    container.appendChild(tabsWrapper);

    // 4. พื้นที่แสดงรายการการบ้าน
    const homeworkListDiv = document.createElement('div');
    homeworkListDiv.className = 'homework-list';
    container.appendChild(homeworkListDiv);

    // โหลดข้อมูลเข้าสู่รายการการบ้าน
    loadHomeworkList(homeworkListDiv, user, studentId, classId, phoneScreen);

    // 5. ปุ่มบวกสร้างการบ้านลอย (FAB) สำหรับครู หรือนักเรียนที่ได้รับมอบอำนาจ
    const canCreateHw = (user.role === 'teacher') || 
                         (user.role === 'student' && isStudentDelegated(user.id, user.class, activeSubjectTab));
    
    if (canCreateHw && activeSubjectTab !== 'ส่งแล้ว') {
        const fab = document.createElement('button');
        fab.className = 'teacher-fab-btn';
        fab.innerHTML = `<i class="fa-solid fa-plus"></i>`;
        fab.onclick = () => {
            renderAddHomeworkForm(container, user, studentId, classId, phoneScreen);
        };
        container.appendChild(fab);
    }
}

// โหลดรายการการบ้านย่อยในแท็บที่เลือก
function loadHomeworkList(listContainer, user, studentId, classId, phoneScreen) {
    listContainer.innerHTML = "";
    
    let list = [];
    if (activeSubjectTab === 'ส่งแล้ว') {
        list = getHomeworkForStudent(studentId, classId, '', 'submitted');
    } else {
        list = getHomeworkForStudent(studentId, classId, activeSubjectTab, 'pending');
    }

    if (list.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--gray); padding: 40px 20px;">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; opacity: 0.5; margin-bottom: 12px;"></i>
                <p style="font-size: 0.9rem;">ไม่มีงานที่จะแสดงในหน้านี้</p>
            </div>
        `;
        return;
    }

    list.forEach(hw => {
        const card = document.createElement('div');
        card.className = 'homework-card';

        // เช็คเตือนภัยขาดส่งสีแดง (Missing alert)
        const isAlerted = isHomeworkAlerted(hw.id, studentId);
        if (isAlerted && activeSubjectTab !== 'ส่งแล้ว') {
            card.classList.add('missing-alert');
        }

        // คำนวณวันและกำหนดสี
        const now = new Date();
        const due = new Date(hw.dueDate);
        const timeDiff = due.getTime() - now.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        let dueClass = 'due-white';
        let dueText = `อีก ${daysDiff} วัน`;

        if (daysDiff < 0) {
            dueClass = 'due-red';
            dueText = 'เลยกำหนดส่ง';
        } else if (daysDiff <= 3) {
            dueClass = 'due-orange';
            dueText = `อีก ${daysDiff} วัน`;
        } else if (daysDiff <= 5) {
            dueClass = 'due-yellow';
            dueText = `อีก ${daysDiff} วัน`;
        } else {
            dueClass = 'due-white';
            dueText = `อีก ${daysDiff} วัน`;
        }

        // หากเป็นวิชาส่งแล้ว
        if (activeSubjectTab === 'ส่งแล้ว') {
            dueClass = 'due-white';
            dueText = 'ส่งเรียบร้อย';
        }

        // รายละเอียดการ์ดของแถม
        const cardRewardBadge = hw.rewardCard && !hw.firstSubmitter && activeSubjectTab !== 'ส่งแล้ว'
            ? `<span class="homework-reward-icon"><i class="fa-solid fa-id-card"></i> คนแรกแจกการ์ด!</span>`
            : '';

        // ซ้าย: ชื่องาน + รายละเอียดห้อง / ขวา: กำหนดส่ง
        card.innerHTML = `
            <div class="homework-left">
                <span class="homework-title">${hw.title}</span>
                <div class="homework-subinfo">
                    <span>${hw.subject}</span> | 
                    <span>กำหนดส่ง: ${due.toLocaleDateString('th-TH', {day: 'numeric', month: 'short'})}</span>
                    ${cardRewardBadge}
                </div>
            </div>
            <div class="homework-right">
                <span class="due-badge ${dueClass}">${dueText}</span>
            </div>
        `;

        card.onclick = () => {
            renderHomeworkDetails(listContainer.parentElement, hw, user, studentId, classId, phoneScreen);
        };

        listContainer.appendChild(card);
    });
}

// -------------------------------------------------------------
// 3. หน้ารายละเอียดการบ้าน + แนบไฟล์ส่งงานจำลอง
// -------------------------------------------------------------
function renderHomeworkDetails(container, hw, user, studentId, classId, phoneScreen) {
    container.innerHTML = "";
    
    const db = loadDatabase();
    
    // ดึงคะแนนหรือข้อมูลการส่งของนักเรียนคนนี้
    const submission = db.submissions.find(s => s.homeworkId === hw.id && s.studentId === studentId);
    const hasSubmitted = !!submission;

    // คำนวณความต่างวัน
    const now = new Date();
    const due = new Date(hw.dueDate);
    const isOverdue = due.getTime() < now.getTime();

    // รายชื่อการ์ดสะสมของนักเรียน
    const studentCards = getStudentCards(studentId);
    // เช็คว่าใช้อัพการ์ดไปแล้วหรือยัง
    const cardUsedForThisHw = db.cards.find(c => c.ownerId === studentId && c.usedForHomeworkId === hw.id);

    container.innerHTML = `
        <div class="details-page">
            <div class="back-header" id="details-back-btn">
                <i class="fa-solid fa-chevron-left"></i> ย้อนกลับ
            </div>
            
            <h3 class="details-title">${hw.title}</h3>
            
            <div class="details-meta-grid">
                <div class="meta-item">
                    <span class="meta-label">วิชา</span>
                    <span class="meta-val">${hw.subject}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">กำหนดส่ง</span>
                    <span class="meta-val" style="color: ${isOverdue && !hasSubmitted ? 'var(--danger)' : 'var(--dark)'}">
                        ${due.toLocaleDateString('th-TH')} (${due.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.)
                    </span>
                </div>
            </div>
            
            <div class="details-desc">
                <strong>คำอธิบายงาน:</strong><br>
                ${hw.description || 'ไม่มีคำอธิบาย'}
            </div>

            <!-- กล่องข้อมูลการให้คะแนนจากคุณครู -->
            ${hasSubmitted && submission.grade !== null ? `
                <div style="background: var(--primary-light); border: 2px solid var(--primary); padding: 14px; border-radius: 12px; text-align: center;">
                    <h4 style="font-family: var(--font-cute); color: var(--primary-dark); font-size: 1.1rem; margin-bottom: 4px;">
                        <i class="fa-solid fa-award"></i> คะแนนที่คุณครูมอบให้
                    </h4>
                    <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary-dark);">
                        ${submission.grade} <span style="font-size: 0.95rem; font-weight: normal; color: var(--gray);">คะแนน</span>
                    </div>
                    ${submission.gradedAt ? `<span style="font-size: 0.7rem; color: var(--gray);">ตรวจแล้วเมื่อ: ${new Date(submission.gradedAt).toLocaleString('th-TH')}</span>` : ''}
                </div>
            ` : ''}

            <!-- --------------------------------------- -->
            <!-- ส่วนการแสดงผลฝั่งคุณครู (ปุ่มส่งเตือน, ตรวจงาน) -->
            <!-- --------------------------------------- -->
            ${user.role === 'teacher' ? `
                <div style="border-top: 1px solid var(--gray-light); padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                    <h5 style="font-size: 0.9rem;">ส่วนจัดการของคุณครู</h5>
                    
                    <!-- ส่งแจ้งเตือนสีแดงให้ห้องนี้ -->
                    <button class="use-card-btn" id="teacher-alert-btn" style="background: var(--danger-light); color: var(--danger); border-color: var(--danger);">
                        <i class="fa-solid fa-circle-exclamation"></i> ส่งแจ้งเตือนการขาดส่งงาน (สีแดง) ไปยังนักเรียนและผู้ปกครอง
                    </button>
                    
                    <!-- ตรวจงานของนักเรียนห้องเรียนนี้ -->
                    <button class="login-btn" id="teacher-view-subs-btn" style="margin: 0;">
                        <i class="fa-solid fa-list-check"></i> ตรวจคำตอบของนักเรียนคนอื่นๆ
                    </button>
                </div>
            ` : ''}

            <!-- --------------------------------------- -->
            <!-- ส่วนส่งงานของนักเรียน -->
            <!-- --------------------------------------- -->
            ${user.role === 'student' && !hasSubmitted ? `
                <div class="submit-area">
                    <h5>ส่งการบ้านของคุณ</h5>
                    
                    <!-- ฟังก์ชันเสริม การ์ดส่งช้า -->
                    ${cardUsedForThisHw ? `
                        <div style="background: #fff0f6; border: 1px solid #ffa8a8; padding: 10px; border-radius: 8px; font-size: 0.8rem; color: #c01e18; text-align: center;">
                            <i class="fa-solid fa-hourglass-half"></i> คุณใช้การ์ดส่งช้าไปแล้ว ขยายเวลาเรียบร้อย (+1 วัน)
                        </div>
                    ` : `
                        <button class="use-card-btn ${studentCards.length === 0 ? 'used' : ''}" id="use-late-card-btn">
                            <i class="fa-solid fa-hourglass-half"></i> ใช้การ์ดส่งงานช้า 1 วัน (มีการ์ดอยู่: ${studentCards.length} ใบ)
                        </button>
                    `}

                    <!-- เลือกประเภทไฟล์ -->
                    <div class="submit-type-selector">
                        <button class="type-btn active" data-type="image"><i class="fa-solid fa-image"></i> รูปภาพ</button>
                        <button class="type-btn" data-type="video"><i class="fa-solid fa-file-video"></i> วิดีโอ</button>
                        <button class="type-btn" data-type="pdf"><i class="fa-solid fa-file-pdf"></i> ไฟล์ PDF</button>
                        <button class="type-btn" data-type="link"><i class="fa-solid fa-link"></i> ลิงก์เว็บ</button>
                    </div>

                    <!-- ฟอร์มแนบไฟล์จำลอง -->
                    <div class="submit-input-group" id="input-container-box">
                        <!-- กล่องอัปโหลดรูปจำลอง -->
                        <div class="file-upload-box" id="sim-upload-box">
                            <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2rem; color: var(--primary);"></i>
                            <span>กดที่นี่เพื่ออัปโหลดรูปการบ้าน</span>
                            <span style="font-size: 0.7rem; color: var(--gray);">(ระบบจำลองความเรียบร้อย)</span>
                        </div>
                        <input type="file" id="real-file-input" style="display: none;" accept="image/*">
                    </div>

                    <!-- แสดงความก้าวหน้าการส่งงานไป Google Drive -->
                    <div id="drive-progress-container" style="display: none;">
                        <span style="font-size: 0.75rem; color: var(--gray);">
                            <i class="fa-brands fa-google-drive" style="color: #4285f4;"></i> 
                            กำลังอัปโหลดไฟล์ไปเก็บยัง Google Drive ของครู...
                        </span>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="drive-progress-fill"></div>
                        </div>
                    </div>

                    <button class="submit-btn" id="submit-hw-btn">
                        ส่งการบ้าน ${hw.rewardCard ? '🎁 (แถมการ์ดคนแรก!)' : ''}
                    </button>
                </div>
            ` : ''}

            <!-- --------------------------------------- -->
            <!-- สถานะส่งแล้ว (นักเรียน / ผู้ปกครอง) -->
            <!-- --------------------------------------- -->
            ${hasSubmitted ? `
                <div style="border-top: 1px solid var(--gray-light); padding-top: 15px;">
                    <div style="background: #e6fcf5; border: 1px solid #c3fae8; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 1.4rem;"></i>
                        <div>
                            <span style="font-weight: bold; color: #087f5b; font-size: 0.85rem;">ส่งการบ้านชิ้นนี้แล้ว</span><br>
                            <span style="font-size: 0.75rem; color: var(--gray);">
                                ไฟล์: <a href="${submission.fileUrl}" target="_blank" class="submission-file-link">
                                    <i class="fa-solid ${submission.fileType === 'image' ? 'fa-image' : submission.fileType === 'pdf' ? 'fa-file-pdf' : submission.fileType === 'video' ? 'fa-file-video' : 'fa-link'}"></i> ${submission.fileName}
                                </a>
                            </span>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${user.role === 'parent' && !hasSubmitted ? `
                <div style="background: #fff5f5; border: 1px solid #ffe3e3; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 10px; color: var(--danger);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.4rem;"></i>
                    <div style="font-size: 0.85rem;">
                        <strong>นักเรียนยังไม่ส่งการบ้านชิ้นนี้</strong><br>
                        ผู้ปกครองกรุณาเตือนนักเรียนให้ส่งงาน
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    // ย้อนกลับ
    document.getElementById('details-back-btn').onclick = () => {
        renderActiveView(phoneScreen, user);
    };

    // ปุ่มใช้การ์ดส่งช้าฝั่งนักเรียน
    const useCardBtn = document.getElementById('use-late-card-btn');
    if (useCardBtn && studentCards.length > 0) {
        useCardBtn.onclick = () => {
            if (confirm("ต้องการใช้การ์ดส่งงานช้า 1 วันกับการบ้านชิ้นนี้ใช่หรือไม่?")) {
                const res = useLateSubmissionCard(studentId, hw.id);
                alert(res.message);
                if (res.success) {
                    renderHomeworkDetails(container, hw, user, studentId, classId, phoneScreen);
                }
            }
        };
    }

    // สลับประเภทตัวกรอกอัปโหลด
    let selectedFileType = 'image';
    let selectedFileName = 'homework_photo.jpg';
    let selectedFileContent = 'data:image/png;base64,mock...';

    const typeBtns = container.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.onclick = () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFileType = btn.dataset.type;
            
            const box = document.getElementById('sim-upload-box');
            const fileInput = document.getElementById('real-file-input');
            if (selectedFileType === 'image') {
                selectedFileName = 'homework_photo.jpg';
                if (fileInput) fileInput.setAttribute('accept', 'image/*');
                box.innerHTML = `
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2rem; color: var(--primary);"></i>
                    <span>กดอัปโหลดรูปภาพตัวอย่างการบ้าน</span>
                `;
            } else if (selectedFileType === 'pdf') {
                selectedFileName = 'homework_report.pdf';
                if (fileInput) fileInput.setAttribute('accept', 'application/pdf');
                box.innerHTML = `
                    <i class="fa-solid fa-file-pdf" style="font-size: 2rem; color: #f03e3e;"></i>
                    <span>กดอัปโหลดไฟล์รายงาน PDF</span>
                `;
            } else if (selectedFileType === 'video') {
                selectedFileName = 'homework_video.mp4';
                if (fileInput) fileInput.setAttribute('accept', 'video/*');
                box.innerHTML = `
                    <i class="fa-solid fa-file-video" style="font-size: 2rem; color: #1098ad;"></i>
                    <span>กดอัปโหลดไฟล์วิดีโอส่งงาน</span>
                `;
            } else {
                selectedFileName = 'https://link.com/homework-submission';
                box.innerHTML = `
                    <i class="fa-solid fa-link" style="font-size: 2rem; color: #ae3ec9;"></i>
                    <input type="url" id="link-input" placeholder="วางลิงก์หน้าเว็บส่งงานที่นี่" style="width: 90%; padding: 6px; border:1px solid #ccc; border-radius:4px; text-align:center; font-family: var(--font-normal);" onclick="event.stopPropagation()">
                `;
            }
        };
    });

    // แนบรูปจริงหรือสร้างรูปส่งงาน
    const uploadBox = document.getElementById('sim-upload-box');
    const fileInput = document.getElementById('real-file-input');
    if (uploadBox && fileInput) {
        uploadBox.onclick = () => {
            if (selectedFileType === 'link') return;
            fileInput.click();
        };

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const originalSize = file.size;
            selectedFileName = file.name;

            if (selectedFileType === 'image') {
                uploadBox.innerHTML = `
                    <div style="text-align: center; color: var(--gray); padding: 10px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
                        <p style="font-size: 0.75rem; margin-top: 5px;">กำลังบีบอัดรูปภาพให้ไม่เกิน 100KB...</p>
                    </div>
                `;
                try {
                    const compressedDataUrl = await compressImage(file);
                    selectedFileContent = compressedDataUrl;
                    
                    // คำนวณขนาดของ base64
                    const base64Length = compressedDataUrl.length - compressedDataUrl.indexOf(',') - 1;
                    const compressedSize = Math.round(base64Length * 3 / 4);
                    const origSizeKb = (originalSize / 1024).toFixed(1);
                    const compSizeKb = (compressedSize / 1024).toFixed(1);
                    
                    uploadBox.innerHTML = `
                        <div class="file-uploaded-preview" style="width: 100%; text-align: center;">
                            <span style="color: var(--success); font-weight: bold;">
                                <i class="fa-solid fa-circle-check"></i> บีบอัดและแนบสำเร็จ!
                            </span>
                            <div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">
                                ขนาดเดิม: ${origSizeKb}KB → <strong style="color: var(--success);">${compSizeKb}KB</strong>
                            </div>
                            <span style="color:var(--gray); font-size: 0.7rem; text-decoration: underline; display: block; margin-top: 6px;">คลิกเพื่อเปลี่ยนไฟล์</span>
                        </div>
                    `;
                } catch (err) {
                    console.error("Compression error:", err);
                    alert("เกิดข้อผิดพลาดในการบีบอัดรูปภาพ");
                    if (originalSize <= 100 * 1024) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            selectedFileContent = ev.target.result;
                        };
                        reader.readAsDataURL(file);
                    } else {
                        alert("ไฟล์รูปภาพมีขนาดใหญ่เกิน 100KB และบีบอัดไม่สำเร็จ กรุณาเลือกรูปภาพขนาดอื่น");
                    }
                }
            } else if (selectedFileType === 'pdf') {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    selectedFileContent = ev.target.result;
                    uploadBox.innerHTML = `
                        <div class="file-uploaded-preview" style="width: 100%; text-align: center;">
                            <span style="color: var(--success); font-weight: bold;">
                                <i class="fa-solid fa-circle-check"></i> แนบไฟล์ PDF สำเร็จ!
                            </span>
                            <div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">
                                ขนาดไฟล์: ${(originalSize / 1024).toFixed(1)}KB
                            </div>
                            <span style="color:var(--gray); font-size: 0.7rem; text-decoration: underline; display: block; margin-top: 6px;">คลิกเพื่อเปลี่ยนไฟล์</span>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } else if (selectedFileType === 'video') {
                uploadBox.innerHTML = `
                    <div style="text-align: center; color: var(--gray); padding: 10px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
                        <p style="font-size: 0.75rem; margin-top: 5px;">กำลังแยกส่วนและบีบอัดบิตเรตวิดีโอ...</p>
                    </div>
                `;
                
                setTimeout(() => {
                    // บีบอัดจำลองประมวลผลขนาดวิดีโอ (เหลือ ~15%)
                    const compressedSize = Math.round(originalSize * 0.15);
                    const origSizeMb = (originalSize / (1024 * 1024)).toFixed(1);
                    const compSizeMb = (compressedSize / (1024 * 1024)).toFixed(1);
                    
                    selectedFileContent = "data:video/mp4;base64,mock_video_data";
                    
                    uploadBox.innerHTML = `
                        <div class="file-uploaded-preview" style="width: 100%; text-align: center;">
                            <span style="color: var(--success); font-weight: bold;">
                                <i class="fa-solid fa-circle-check"></i> บีบอัดและแนบวิดีโอสำเร็จ!
                            </span>
                            <div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">
                                ขนาดเดิม: ${origSizeMb}MB → <strong style="color: var(--success);">${compSizeMb}MB</strong>
                            </div>
                            <span style="color:var(--gray); font-size: 0.7rem; text-decoration: underline; display: block; margin-top: 6px;">คลิกเพื่อเปลี่ยนไฟล์</span>
                        </div>
                    `;
                }, 1500);
            }
        };
    }



    // ปุ่มกดส่งการบ้าน
    const submitBtn = document.getElementById('submit-hw-btn');
    if (submitBtn) {
        submitBtn.onclick = () => {
            // ถ้าส่งลิงก์ ดึงค่าลิงก์
            if (selectedFileType === 'link') {
                const linkVal = document.getElementById('link-input').value;
                if (!linkVal || linkVal.trim() === "") {
                    alert("กรุณากรอกลิงก์ที่จะส่ง");
                    return;
                }
                selectedFileName = "ลิงก์เว็บการบ้าน";
                selectedFileContent = linkVal.trim();
            }

            // แสดงแอนิเมชันความก้าวหน้าการส่ง Google Drive
            const progressContainer = document.getElementById('drive-progress-container');
            const progressFill = document.getElementById('drive-progress-fill');
            submitBtn.disabled = true;
            progressContainer.style.display = "block";
            
            let width = 0;
            const interval = setInterval(() => {
                width += 10;
                progressFill.style.width = width + '%';
                if (width >= 100) {
                    clearInterval(interval);
                    
                    // บันทึกและส่งการบ้าน
                    const result = submitHomework(hw.id, studentId, selectedFileType, selectedFileName, selectedFileContent);
                    
                    if (result.earnRewardCard) {
                        alert(`ส่งงานเรียบร้อยเป็นคนแรก! ได้รับการ์ดพิเศษ: "${result.cardReceived.name}" (รหัส: ${result.cardReceived.id})`);
                    } else {
                        alert("ส่งการบ้านไปยัง Google Drive ของครูเสร็จสมบูรณ์!");
                    }

                    // รีเฟรชหน้าจำลองไฟล์นอกมือถือเพื่อการทดสอบ
                    updateGoogleDriveMock();
                    updateSystemStats();
                    
                    // กลับสู่หน้าหลักการบ้าน (จะเห็นว่างานนั้นหายไปอยู่แท็บส่งแล้ว)
                    renderActiveView(phoneScreen, user);
                }
            }, 150);
        };
    }

    // ปุ่มครูจัดการ
    if (user.role === 'teacher') {
        // ครูส่งแจ้งเตือนขาดส่ง
        const alertBtn = document.getElementById('teacher-alert-btn');
        alertBtn.onclick = () => {
            // ดึงรายชื่อนักเรียนคนอื่นที่ไม่ใช่การเลือกจำลอง
            const classroomStudents = getStudentsInClass(classId);
            
            let namesList = classroomStudents.map(s => `${s.id}: ${s.name}`).join('\n');
            const targetId = prompt(`เลือก ID นักเรียนที่ต้องการส่งแจ้งเตือนสีแดง (เตือนขาดส่ง):\n\n${namesList}`, studentId);
            
            if (targetId) {
                const alerted = toggleMissingAlert(hw.id, targetId);
                alert(alerted ? `ส่งสัญญาณแจ้งเตือนสีแดงไปยัง ${targetId} สำเร็จ!` : `ยกเลิกการแจ้งเตือนขาดส่งไปยัง ${targetId} สำเร็จ!`);
                renderHomeworkDetails(container, hw, user, studentId, classId, phoneScreen);
            }
        };

        // ครูเข้าสู่หน้าตรวจคำตอบ
        const viewSubsBtn = document.getElementById('teacher-view-subs-btn');
        viewSubsBtn.onclick = () => {
            currentActiveView = 'teacherSubmissions';
            renderActiveView(phoneScreen, user);
        };
    }
}

// -------------------------------------------------------------
// 4. หน้าจอเพิ่มการบ้านสำหรับครู (และนักเรียนที่ได้สิทธิ์)
// -------------------------------------------------------------
function renderAddHomeworkForm(container, user, studentId, classId, phoneScreen) {
    container.innerHTML = `
        <div class="add-homework-form">
            <div class="back-header" id="form-back-btn">
                <i class="fa-solid fa-chevron-left"></i> ย้อนกลับ
            </div>
            
            <h3><i class="fa-solid fa-circle-plus"></i> มอบหมายการบ้านใหม่</h3>
            
            <form id="new-homework-form">
                <div class="form-group">
                    <label>วิชา</label>
                    <input type="text" class="form-control" style="padding-left: 12px; background: var(--gray-light);" value="${activeSubjectTab}" disabled>
                </div>
                
                <div class="form-group">
                    <label for="hw-title">หัวข้อการบ้าน / ชื่องาน</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-pen-nib"></i>
                        <input type="text" id="hw-title" class="form-control" placeholder="เช่น แบบฝึกหัดบทที่ 1" required>
                    </div>
                </div>

                <div class="form-group">
                    <label for="hw-desc">รายละเอียดและคำอธิบาย</label>
                    <textarea id="hw-desc" class="form-control" style="padding-left: 12px; min-height: 80px;" placeholder="คำชี้แจงเพิ่มเติม..." required></textarea>
                </div>

                <div class="form-group">
                    <label for="hw-duedate">กำหนดส่ง (วันและเวลา)</label>
                    <div class="form-control-wrapper">
                        <i class="fa-solid fa-calendar-day"></i>
                        <input type="datetime-local" id="hw-duedate" class="form-control" required>
                    </div>
                </div>

                <div class="toggle-switch-container">
                    <span class="toggle-switch-label">
                        <i class="fa-solid fa-id-card" style="color: #ff922b;"></i>
                        แจกการ์ดส่งช้าแก่ผู้ส่งคนแรก
                    </span>
                    <label class="switch">
                        <input type="checkbox" id="hw-reward" checked>
                        <span class="slider"></span>
                    </label>
                </div>

                <button type="submit" class="login-btn" style="margin-top: 15px;">บันทึกและสั่งการบ้าน</button>
            </form>
        </div>
    `;

    document.getElementById('form-back-btn').onclick = () => {
        renderActiveView(phoneScreen, user);
    };

    // ตั้งค่าวันกำหนดส่งล่วงหน้าให้ 3 วันเป็นค่าเริ่มต้น
    const dateInput = document.getElementById('hw-duedate');
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
    dateInput.value = defaultDate.toISOString().slice(0, 16);

    const form = document.getElementById('new-homework-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('hw-title').value.trim();
        const desc = document.getElementById('hw-desc').value.trim();
        const duedateVal = document.getElementById('hw-duedate').value;
        const reward = document.getElementById('hw-reward').checked;

        addHomework(title, desc, duedateVal, activeSubjectTab, classId, reward, user.id);
        alert("มอบหมายการบ้านและอัปเดตเข้าระบบเรียบร้อยแล้ว!");
        
        updateSystemStats();
        renderActiveView(phoneScreen, user);
    };
}

// -------------------------------------------------------------
// 5. หน้าเมนูตรวจงานและให้คะแนน (Teacher Submission View)
// -------------------------------------------------------------
function renderTeacherSubmissions(container, user, phoneScreen) {
    const db = loadDatabase();
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <h3 style="font-family: var(--font-cute); color: var(--primary-dark); font-size: 1.25rem;">
                <i class="fa-solid fa-clipboard-check"></i> ตรวจคำตอบและการบ้าน
            </h3>
            
            <div class="form-group">
                <label>เลือกการบ้านที่ต้องการตรวจ</label>
                <select id="teacher-hw-select" class="form-control" style="padding-left: 12px;">
                    ${db.homework.map(hw => `
                        <option value="${hw.id}" ${hw.subject === activeSubjectTab ? 'selected' : ''}>
                            [${hw.subject}] ${hw.title}
                        </option>
                    `).join('')}
                </select>
            </div>

            <div class="teacher-submissions-list" id="submissions-list-area">
                <!-- รายชื่อนักเรียนที่ส่งการบ้านจะมาโหลดที่นี่ -->
            </div>
        </div>
    `;

    const select = document.getElementById('teacher-hw-select');
    select.onchange = () => {
        loadSubmissionsForTeacher(select.value, container);
    };

    // โหลดครั้งแรก
    if (select.value) {
        loadSubmissionsForTeacher(select.value, container);
    } else {
        document.getElementById('submissions-list-area').innerHTML = `<p style="color:var(--gray); text-align:center; padding: 20px;">ยังไม่มีข้อมูลการมอบหมายการบ้าน</p>`;
    }
}

function loadSubmissionsForTeacher(homeworkId, container) {
    const subArea = document.getElementById('submissions-list-area');
    if (!subArea) return;

    subArea.innerHTML = "";
    const subs = getSubmissionsForHomework(homeworkId);

    if (subs.length === 0) {
        subArea.innerHTML = `
            <div style="text-align: center; color: var(--gray); padding: 30px;">
                <i class="fa-solid fa-hourglass-empty" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 10px;"></i>
                <p>ยังไม่มีนักเรียนส่งการบ้านชิ้นนี้</p>
            </div>
        `;
        return;
    }

    subs.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'submission-card';
        
        const isGraded = sub.grade !== null;

        card.innerHTML = `
            <div class="submission-header">
                <span class="submission-student-name">${sub.studentName}</span>
                <span class="submission-status-badge ${isGraded ? 'graded' : 'pending'}">
                    ${isGraded ? `ตรวจแล้ว (${sub.grade} คะแนน)` : 'รอการตรวจ'}
                </span>
            </div>
            
            <div style="font-size: 0.8rem; margin: 4px 0;">
                ส่งเมื่อ: ${new Date(sub.submittedAt).toLocaleString('th-TH')}<br>
                ลิงก์/ไฟล์: <a href="${sub.fileUrl}" target="_blank" class="submission-file-link">
                    <i class="fa-solid ${sub.fileType === 'image' ? 'fa-image' : sub.fileType === 'pdf' ? 'fa-file-pdf' : sub.fileType === 'video' ? 'fa-file-video' : 'fa-link'}"></i> ${sub.fileName}
                </a>
            </div>

            <div class="grading-group">
                <input type="number" step="0.1" class="grading-input" id="grade-val-${sub.id}" placeholder="กรอกคะแนนเต็ม 10" value="${isGraded ? sub.grade : ''}">
                <button class="grading-btn" id="grade-btn-${sub.id}">บันทึกคะแนน</button>
            </div>
        `;

        subArea.appendChild(card);

        // จัดการให้คะแนน
        document.getElementById(`grade-btn-${sub.id}`).onclick = () => {
            const input = document.getElementById(`grade-val-${sub.id}`);
            const val = input.value;
            if (val === "" || isNaN(val)) {
                alert("กรุณากรอกคะแนนเป็นตัวเลข");
                return;
            }
            if (gradeSubmission(sub.id, val)) {
                alert(`บันทึกคะแนน ${val} คะแนน ให้แก่ ${sub.studentName} เรียบร้อยแล้ว!`);
                loadSubmissionsForTeacher(homeworkId, container);
                updateSystemStats();
            }
        };
    });
}

// -------------------------------------------------------------
// 6. หน้าจอตั้งมอบอำนาจเพิ่มการบ้าน (Teacher Delegation View)
// -------------------------------------------------------------
function renderTeacherDelegation(container, user) {
    const db = loadDatabase();
    const classes = db.classes || ['1/1'];
    let delegationSelectedClass = teacherSelectedClass || classes[0] || '1/1';

    function renderDelegationContent() {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <h3 style="font-family: var(--font-cute); color: var(--primary-dark); font-size: 1.25rem;">
                    <i class="fa-solid fa-user-shield"></i> มอบอำนาจในการสั่งการบ้าน
                </h3>
                <p style="font-size: 0.8rem; color: var(--gray);">ครูสามารถแต่งตั้งนักเรียนหัวหน้าห้องหรือตัวแทนรายวิชาเพื่อทำการเพิ่มเนื้อหาการบ้านในระบบแทนได้</p>
                
                <div style="background: white; padding: 16px; border-radius: 12px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 12px;">
                    <div class="form-group">
                        <label>1. เลือกรายวิชา</label>
                        <select id="delegate-subj-select" class="form-control" style="padding-left:12px;">
                            ${db.subjects.map(subj => `<option value="${subj}">${subj}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>2. เลือกห้องเรียน</label>
                        <select id="delegate-class-select" class="form-control" style="padding-left:12px;">
                            ${classes.map(cls => `<option value="${cls}" ${cls === delegationSelectedClass ? 'selected' : ''}>${cls}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <h4 style="font-size: 0.9rem; margin-top: 10px;" id="delegation-class-title">รายชื่อนักเรียนร่วมชั้นเรียน (ห้อง ${delegationSelectedClass})</h4>
                <div style="display: flex; flex-direction: column; gap: 10px;" id="delegation-list-area">
                </div>
            </div>
        `;

        const subjSelect = document.getElementById('delegate-subj-select');
        const classSelect = document.getElementById('delegate-class-select');

        const reloadList = () => {
            delegationSelectedClass = classSelect.value;
            document.getElementById('delegation-class-title').textContent = `รายชื่อนักเรียนร่วมชั้นเรียน (ห้อง ${delegationSelectedClass})`;
            loadStudentsDelegation(subjSelect.value, delegationSelectedClass);
        };

        subjSelect.onchange = reloadList;
        classSelect.onchange = reloadList;

        loadStudentsDelegation(subjSelect.value, delegationSelectedClass);
    }

    renderDelegationContent();
}

function loadStudentsDelegation(subject, classId) {
    const listArea = document.getElementById('delegation-list-area');
    if (!listArea) return;

    listArea.innerHTML = "";
    const students = getStudentsInClass(classId);

    if (students.length === 0) {
        listArea.innerHTML = `<p style="color:var(--gray); text-align:center; padding:20px;">ไม่พบนักเรียนในห้อง ${classId}</p>`;
        return;
    }

    students.forEach(std => {
        const hasPower = isStudentDelegated(std.id, classId, subject);

        const card = document.createElement('div');
        card.className = 'grade-row';
        card.innerHTML = `
            <div style="text-align: left;">
                <span class="grade-subject">${std.name}</span><br>
                <span style="font-size: 0.75rem; color: var(--gray);">สิทธิ์การสั่งวิชา: ${subject}</span>
            </div>
            
            <button class="grade-val" id="delegate-btn-${std.id}" style="background: ${hasPower ? 'var(--danger-light)' : 'var(--primary-light)'}; border: none; color: ${hasPower ? 'var(--danger)' : 'var(--primary)'}; padding: 6px 12px; border-radius: 8px; font-weight:600; cursor:pointer;">
                ${hasPower ? 'ถอนสิทธิ์' : 'มอบสิทธิ์'}
            </button>
        `;

        listArea.appendChild(card);

        document.getElementById(`delegate-btn-${std.id}`).onclick = () => {
            const delegated = toggleDelegation(std.id, classId, subject);
            alert(delegated ? `แต่งตั้ง ${std.name} เป็นตัวแทนสั่งงานวิชา ${subject} สำเร็จ!` : `ถอนอำนาจการสั่งงานของ ${std.name} เรียบร้อย`);
            loadStudentsDelegation(subject, classId);
        };
    });
}

// -------------------------------------------------------------
// 11. หน้าจัดการห้องเรียน (Class Management View)
//     - Master (M000) สร้าง/ลบห้องเรียนได้
//     - ครูทุกคนเพิ่ม/ลบนักเรียนในห้องได้
// -------------------------------------------------------------
function renderClassManagement(container, user, phoneScreen) {
    const isMaster = user.id === 'M000';
    let managingClass = null;

    function render() {
        const db2 = loadDatabase();
        const cls2 = db2.classes || [];
        if (!managingClass && cls2.length > 0) managingClass = cls2[0];
        const allStudents = Object.values(db2.users).filter(u => u.role === 'student');
        const membersInClass = managingClass ? allStudents.filter(u => u.class === managingClass) : [];
        const nonMembers = managingClass ? allStudents.filter(u => u.class !== managingClass) : allStudents;

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:14px;">
                <h3 style="font-family:var(--font-cute); color:var(--primary-dark); font-size:1.2rem;">
                    <i class="fa-solid fa-chalkboard"></i> จัดการห้องเรียน
                </h3>

                <div style="background:white; border-radius:12px; padding:14px; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-weight:600; font-size:0.9rem;"><i class="fa-solid fa-list-ul"></i> รายการห้องเรียน</span>
                        ${isMaster ? `<button id="add-class-btn" style="background:var(--primary); color:white; border:none; border-radius:8px; padding:5px 12px; font-size:0.8rem; cursor:pointer; font-family:var(--font-normal);"><i class="fa-solid fa-plus"></i> สร้างห้องใหม่</button>` : ''}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${cls2.length === 0 ? `<span style="color:var(--gray); font-size:0.85rem;">ยังไม่มีห้องเรียน</span>` : cls2.map(cls => `
                            <div style="display:inline-flex; align-items:center; gap:6px; background:${cls === managingClass ? 'var(--primary)' : 'var(--primary-light)'}; color:${cls === managingClass ? 'white' : 'var(--primary-dark)'}; border-radius:20px; padding:5px 12px; cursor:pointer; font-size:0.82rem; font-weight:600;" id="class-chip-${cls.replace('/','_')}">
                                <span class="chip-label">ห้อง ${cls}</span>
                                ${isMaster ? `<i class="fa-solid fa-xmark del-class-icon" data-cls="${cls}" style="font-size:0.72rem; opacity:0.75;"></i>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${managingClass ? `
                <div style="background:white; border-radius:12px; padding:14px; box-shadow:var(--shadow-sm);">
                    <span style="font-weight:600; font-size:0.9rem;"><i class="fa-solid fa-users"></i> สมาชิกห้อง ${managingClass} (${membersInClass.length} คน)</span>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                        ${membersInClass.length === 0 ? `<p style="color:var(--gray); font-size:0.85rem; text-align:center; padding:10px;">ยังไม่มีสมาชิกในห้องนี้</p>` : membersInClass.map(st => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--gray-light); border-radius:10px; padding:8px 12px;">
                                <div>
                                    <span style="font-weight:600; font-size:0.85rem;">${st.name}</span>
                                    <span style="font-size:0.72rem; color:var(--gray); margin-left:6px;">${st.id}</span>
                                </div>
                                <button data-remove="${st.id}" class="remove-member-btn" style="background:var(--danger-light); color:var(--danger); border:none; border-radius:8px; padding:4px 10px; font-size:0.75rem; cursor:pointer; font-family:var(--font-normal);"><i class="fa-solid fa-minus"></i> นำออก</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="background:white; border-radius:12px; padding:14px; box-shadow:var(--shadow-sm);">
                    <span style="font-weight:600; font-size:0.9rem;"><i class="fa-solid fa-user-plus"></i> เพิ่มนักเรียนเข้าห้อง ${managingClass}</span>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                        ${nonMembers.length === 0 ? `<p style="color:var(--gray); font-size:0.85rem; text-align:center; padding:10px;">นักเรียนทุกคนอยู่ในห้องนี้แล้ว</p>` : nonMembers.map(st => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--gray-light); border-radius:10px; padding:8px 12px;">
                                <div>
                                    <span style="font-weight:600; font-size:0.85rem;">${st.name}</span>
                                    <span style="font-size:0.72rem; color:var(--gray); margin-left:6px;">${st.id} ${st.class ? `| ห้องเดิม: ${st.class}` : '| ไม่มีห้อง'}</span>
                                </div>
                                <button data-add="${st.id}" class="add-member-btn" style="background:var(--primary-light); color:var(--primary-dark); border:none; border-radius:8px; padding:4px 10px; font-size:0.75rem; cursor:pointer; font-family:var(--font-normal);"><i class="fa-solid fa-plus"></i> เพิ่ม</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : `<p style="color:var(--gray); text-align:center; padding:20px;">กรุณาเลือกห้องเรียนด้านบน</p>`}
            </div>
        `;

        // ผูก event: เลือกห้องเรียน
        cls2.forEach(cls => {
            const chip = document.getElementById(`class-chip-${cls.replace('/', '_')}`);
            if (!chip) return;
            chip.querySelector('.chip-label').onclick = () => {
                managingClass = cls;
                teacherSelectedClass = cls;
                render();
            };
            const delIcon = chip.querySelector('.del-class-icon');
            if (delIcon && isMaster) {
                delIcon.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`ต้องการลบห้องเรียน "${cls}" ใช่หรือไม่? นักเรียนในห้องนี้จะถูกนำออกจากห้อง`)) {
                        deleteClass(cls);
                        const rem = loadDatabase().classes;
                        managingClass = rem.length > 0 ? rem[0] : null;
                        render();
                    }
                };
            }
        });

        // ปุ่มสร้างห้องใหม่ (Master)
        const addClassBtn = document.getElementById('add-class-btn');
        if (addClassBtn) {
            addClassBtn.onclick = () => {
                const name = prompt('กรอกชื่อห้องเรียนใหม่ (เช่น 2/1):');
                if (name && name.trim()) {
                    if (addClass(name.trim())) {
                        managingClass = name.trim();
                        teacherSelectedClass = name.trim();
                        render();
                    } else {
                        alert('ห้องเรียนนี้มีอยู่แล้ว');
                    }
                }
            };
        }

        // ปุ่มนำสมาชิกออก
        container.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.onclick = () => {
                const sid = btn.dataset.remove;
                const st = loadDatabase().users[sid];
                if (confirm(`นำ ${st ? st.name : sid} ออกจากห้อง ${managingClass} ใช่หรือไม่?`)) {
                    updateStudentClass(sid, '');
                    render();
                }
            };
        });

        // ปุ่มเพิ่มนักเรียนเข้าห้อง
        container.querySelectorAll('.add-member-btn').forEach(btn => {
            btn.onclick = () => {
                updateStudentClass(btn.dataset.add, managingClass);
                render();
            };
        });
    }

    render();
}

// -------------------------------------------------------------
// 7. หน้าเมนูคะแนน (#Grades Menu)
// -------------------------------------------------------------
function renderGradesMenu(container, studentId) {
    const grades = getGradesForStudent(studentId);
    const db = loadDatabase();

    // คำนวณคะแนนเฉลี่ย
    let totalScore = 0;
    let totalAssignments = 0;
    Object.values(grades).forEach(list => {
        list.forEach(g => {
            totalScore += g.grade;
            totalAssignments++;
        });
    });

    const averageScore = totalAssignments > 0 ? (totalScore / totalAssignments).toFixed(2) : '0.00';

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <div class="grades-summary-card">
                <h3 style="font-family: var(--font-cute); font-size: 1.2rem; margin-bottom: 4px;">สรุปคะแนนรวมทั้งหมด</h3>
                <div class="grades-total">${averageScore} <span>/ 10</span></div>
                <span style="font-size: 0.75rem; opacity: 0.9;">คำนวณจากการตรวจการบ้านสำเร็จ ${totalAssignments} งาน</span>
            </div>

            <h3 style="font-family: var(--font-cute); color: var(--primary-dark); font-size: 1.1rem;">คะแนนแยกรายวิชา</h3>
            
            <div class="grades-list">
                ${db.subjects.map(subj => {
                    const subjGrades = grades[subj] || [];
                    let scoreSum = 0;
                    subjGrades.forEach(g => scoreSum += g.grade);
                    const avg = subjGrades.length > 0 ? (scoreSum / subjGrades.length).toFixed(2) : '-';

                    return `
                        <div class="grade-row" style="cursor: pointer;" id="grade-row-${subj}">
                            <div>
                                <span class="grade-subject">${subj}</span>
                                <span style="font-size: 0.75rem; color: var(--gray); display: block;">ตรวจแล้ว: ${subjGrades.length} ชิ้น</span>
                            </div>
                            <span class="grade-val">${avg} / 10</span>
                        </div>
                        <div id="grade-detail-${subj}" style="display: none; background: white; margin-top: -8px; border-top: 1px dashed var(--gray-light); padding: 10px 16px; border-radius: 0 0 10px 10px; font-size: 0.8rem; box-shadow: var(--shadow-sm);">
                            ${subjGrades.length === 0 ? '<p style="color:var(--gray);">ยังไม่มีประวัติงานที่ได้คะแนน</p>' : subjGrades.map(g => `
                                <div style="display:flex; justify-content:space-between; padding:4px 0;">
                                    <span style="color:var(--dark); max-width:75%; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">- ${g.homeworkTitle}</span>
                                    <span style="color:var(--success); font-weight:bold;">${g.grade} คะแนน</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // จัดการ Event กดกางแถบคะแนนละเอียด
    db.subjects.forEach(subj => {
        const row = document.getElementById(`grade-row-${subj}`);
        const detail = document.getElementById(`grade-detail-${subj}`);
        if (row && detail) {
            row.onclick = () => {
                const isOpen = detail.style.display === "block";
                detail.style.display = isOpen ? "none" : "block";
                row.style.borderRadius = isOpen ? "10px" : "10px 10px 0 0";
            };
        }
    });
}

// -------------------------------------------------------------
// 8. หน้าเมนูจัดการการ์ด (#Cards Menu)
// -------------------------------------------------------------
function renderCardsMenu(container, user, phoneScreen) {
    const cards = getStudentCards(user.id);

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <div class="cards-menu-header">
                <h3><i class="fa-solid fa-wallet" style="color: var(--primary);"></i> การ์ดสะสมของฉัน</h3>
                <span class="cards-count-badge">${cards.length} ใบ</span>
            </div>
            
            <button class="use-card-btn" id="student-scan-trade-btn" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none;">
                <i class="fa-solid fa-qrcode"></i> สแกนรับการ์ดการบ้านจากเพื่อน
            </button>

            <div class="cards-grid">
                ${cards.length === 0 ? `
                    <div style="text-align: center; color: var(--gray); padding: 40px 20px; background: white; border-radius: 12px; border: 1px dashed var(--gray-light);">
                        <i class="fa-regular fa-clone" style="font-size: 3rem; opacity: 0.5; margin-bottom: 12px;"></i>
                        <p style="font-size: 0.95rem;">ยังไม่มีการ์ดในคอลเลกชัน</p>
                        <p style="font-size: 0.75rem; margin-top: 4px;">คุณจะได้รับการ์ดพิเศษเมื่อส่งการบ้านเป็นคนแรกของห้อง หรือได้รับจากคุณครู / แลกกับเพื่อน</p>
                    </div>
                ` : cards.map(card => `
                    <div class="card-item">
                        <div class="card-top">
                            <div class="card-title-box">
                                <span class="card-name">${card.name}</span>
                                <span class="card-id-code">${card.id}</span>
                            </div>
                            <span class="card-emoji">⏳</span>
                        </div>
                        <p class="card-desc">สามารถใช้ขยายเวลากำหนดส่งการบ้านได้ 1 วัน (จำกัดการใช้การ์ด 1 ใบ ต่องาน 1 ชิ้น)</p>
                        
                        <div class="card-action-bar">
                            <button class="card-action-btn card-btn-trade" id="trade-btn-${card.id}">
                                <i class="fa-solid fa-share-nodes"></i> สร้าง QR โอนการ์ด
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // ผูกปุ่มสร้าง QR Code ส่งการ์ด
    cards.forEach(card => {
        const btn = document.getElementById(`trade-btn-${card.id}`);
        if (btn) {
            btn.onclick = () => {
                renderCreateQRView(phoneScreen, card.id, user.id, () => {
                    renderActiveView(phoneScreen, user);
                });
            };
        }
    });

    // ผูกปุ่มสแกนรับการ์ด
    const scanBtn = document.getElementById('student-scan-trade-btn');
    if (scanBtn) {
        scanBtn.onclick = () => {
            renderScanView(phoneScreen, user.id, () => {
                updateSystemStats();
                renderActiveView(phoneScreen, user);
            }, () => {
                renderActiveView(phoneScreen, user);
            });
        };
    }
}

// -------------------------------------------------------------
// 9. หน้าเมนูตั้งค่าและเปลี่ยนรหัสผ่าน (Settings Menu)
// -------------------------------------------------------------
function renderSettingsMenu(container, user, phoneScreen) {
    const db = loadDatabase();
    
    // คำนวณจำนวนการเชื่อมต่อสำหรับผู้ปกครอง
    let connectionInfo = "";
    if (user.role === 'parent') {
        const studentNames = (user.linkedStudents || [])
            .map(id => db.users[id] ? db.users[id].name : 'ไม่ทราบชื่อ')
            .join(', ');
        connectionInfo = `
            <div class="settings-section">
                <h4><i class="fa-solid fa-link"></i> การเชื่อมต่อนักเรียน</h4>
                <p style="font-size: 0.85rem;">ลูกที่กำลังเชื่อมต่อ: <strong>${studentNames || 'ไม่มี'}</strong></p>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="settings-menu">
            <h3><i class="fa-solid fa-gears"></i> ตั้งค่าข้อมูลทั่วไป</h3>
            
            <div class="settings-section">
                <h4><i class="fa-solid fa-id-card"></i> ข้อมูลผู้ใช้งาน</h4>
                <p style="font-size: 0.85rem;">ชื่อ: <strong>${user.name}</strong></p>
                <p style="font-size: 0.85rem;">สถานะผู้ใช้: <strong>${user.role === 'teacher' ? 'คุณครู' : user.role === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'}</strong></p>
            </div>

            ${connectionInfo}

            <!-- ครูสามารถผูกบัญชีผู้ปกครองเพิ่มได้ -->
            ${user.role === 'teacher' ? `
                <div class="settings-section">
                    <h4><i class="fa-solid fa-user-plus"></i> เพิ่มบัญชีผู้ใช้ใหม่</h4>
                    <div class="change-password-box">
                        <div class="form-group" style="margin-bottom: 8px;">
                            <select id="create-user-role" class="form-control" style="padding-left:12px; height: 38px;">
                                <option value="student">นักเรียน (Student)</option>
                                <option value="parent">ผู้ปกครอง (Parent)</option>
                                <option value="teacher">ครู (Teacher)</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 4px;">
                            <input type="text" id="create-user-id" class="form-control" style="padding-left:12px;" placeholder="รหัสประจำตัว (ระบุเฉพาะตัวเลข)" required pattern="[0-9]*" inputmode="numeric">
                        </div>
                        <div style="font-size:0.75rem; color: var(--gray); margin-bottom: 8px; font-weight: 500; padding-left: 4px;" id="generated-user-id-preview">
                            User ID ที่จะถูกสร้าง: S
                        </div>
                        <div class="form-group" style="margin-bottom: 8px;">
                            <input type="text" id="create-user-name" class="form-control" style="padding-left:12px;" placeholder="ชื่อ-นามสกุลจริง" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 8px; position: relative; display: flex; align-items: center;">
                            <input type="password" id="create-user-pass" class="form-control" style="padding-left:12px; padding-right: 40px;" placeholder="รหัสผ่านเข้าใช้งาน" required>
                            <i class="fa-solid fa-eye-slash" id="toggle-create-user-pass" style="position: absolute; right: 14px; cursor: pointer; color: var(--gray);"></i>
                        </div>
                        <div class="form-group" style="margin-bottom: 8px;" id="create-user-class-group">
                            <input type="text" id="create-user-class" class="form-control" style="padding-left:12px;" placeholder="ห้องเรียน (เช่น 1/1)" value="1/1">
                        </div>
                        <button class="login-btn" id="submit-create-user-btn" style="margin: 0; padding: 8px; background: #2c2c2e; border-color: #2c2c2e;">
                            <i class="fa-solid fa-plus"></i> สร้างผู้ใช้ใหม่
                        </button>
                    </div>
                </div>

                <div class="settings-section">
                    <h4><i class="fa-solid fa-file-import"></i> นำเข้าข้อมูลผู้ใช้หลายคน (CSV)</h4>
                    <div class="change-password-box">
                        <p style="font-size: 0.72rem; color: var(--gray); margin-bottom: 8px; line-height: 1.4;">
                            โครงสร้างไฟล์ CSV: <code>บทบาท, รหัสตัวเลข, ชื่อ-นามสกุล, รหัสผ่าน, ห้องเรียน(ถ้ามี)</code><br>
                            - บทบาท: <code>student</code> (หรือ S), <code>parent</code> (หรือ P), <code>teacher</code> (หรือ T)<br>
                            - รหัสตัวเลข: ระบบจะเติมตัวอักษรนำหน้า S/P/T อัตโนมัติ<br>
                            ตัวอย่างเช่น: <code>student,0001,ด.ช. สมเกียรติ,1234,1/1</code>
                        </p>
                        <div class="form-group" style="margin-bottom: 8px;">
                            <input type="file" id="import-users-csv" accept=".csv" class="form-control" style="padding-top: 6px; padding-left: 12px; height: 38px;">
                        </div>
                        <button class="login-btn" id="submit-import-users-btn" style="margin: 0; padding: 8px; background: var(--primary); border-color: var(--primary);">
                            <i class="fa-solid fa-file-excel"></i> นำเข้าข้อมูลผู้ใช้
                        </button>
                    </div>
                </div>

                <div class="settings-section">
                    <h4><i class="fa-solid fa-people-roof"></i> เชื่อมต่อผู้ปกครอง - นักเรียน</h4>
                    <button class="use-card-btn" id="teacher-link-parent-btn" style="width: 100%; margin: 0; background: var(--primary-light); color: var(--primary-dark); border-color: var(--primary);">
                        <i class="fa-solid fa-link"></i> ผูกผู้ปกครองเข้ากับนักเรียน
                    </button>
                </div>
                
                <div class="settings-section">
                    <h4><i class="fa-solid fa-gift"></i> มอบของขวัญ / แจกการ์ดตรง</h4>
                    <button class="use-card-btn" id="teacher-gift-card-btn" style="width: 100%; margin: 0; background: #fff9db; color: #f59f00; border-color: #ffe066;">
                        <i class="fa-solid fa-gift"></i> มอบการ์ดส่งช้า 1 วันให้แก่นักเรียน
                    </button>
                </div>

                <div class="settings-section">
                    <h4><i class="fa-solid fa-rotate-left"></i> รีเซ็ตระบบ (อันตราย)</h4>
                    <button class="use-card-btn" id="settings-reset-db-btn" style="width: 100%; margin: 0; background: #fff5f5; color: var(--danger); border-color: #ffe3e3;">
                        <i class="fa-solid fa-rotate-left"></i> รีเซ็ตฐานข้อมูลทั้งหมด
                    </button>
                </div>
            ` : ''}

            <!-- หน้าต่างเปลี่ยนรหัสผ่าน -->
            <div class="settings-section">
                <h4><i class="fa-solid fa-shield-halved"></i> แก้ไขรหัสผ่าน</h4>
                
                <div class="change-password-box">
                    <div class="form-group" style="margin-bottom: 8px; position: relative; display: flex; align-items: center;">
                        <input type="password" id="old-pass" class="form-control" style="padding-left:12px; padding-right: 40px;" placeholder="รหัสผ่านปัจจุบัน" required autocomplete="current-password">
                        <i class="fa-solid fa-eye-slash" id="toggle-old-pass" style="position: absolute; right: 14px; cursor: pointer; color: var(--gray);"></i>
                    </div>
                    <div class="form-group" style="margin-bottom: 8px; position: relative; display: flex; align-items: center;">
                        <input type="password" id="new-pass" class="form-control" style="padding-left:12px; padding-right: 40px;" placeholder="รหัสผ่านใหม่" required autocomplete="new-password">
                        <i class="fa-solid fa-eye-slash" id="toggle-new-pass" style="position: absolute; right: 14px; cursor: pointer; color: var(--gray);"></i>
                    </div>
                    <button class="login-btn" id="submit-change-pass-btn" style="margin: 0; padding: 8px;">ยืนยันการเปลี่ยนรหัสผ่าน</button>
                </div>
            </div>
        </div>
    `;

    // ผูกการแสดง/ซ่อนรหัสผ่านสำหรับการสร้างผู้ใช้ใหม่
    const toggleCreatePass = document.getElementById('toggle-create-user-pass');
    const createPassInput = document.getElementById('create-user-pass');
    if (toggleCreatePass && createPassInput) {
        toggleCreatePass.onclick = () => {
            if (createPassInput.type === 'password') {
                createPassInput.type = 'text';
                toggleCreatePass.classList.remove('fa-eye-slash');
                toggleCreatePass.classList.add('fa-eye');
            } else {
                createPassInput.type = 'password';
                toggleCreatePass.classList.remove('fa-eye');
                toggleCreatePass.classList.add('fa-eye-slash');
            }
        };
    }

    // ผูกการแสดง/ซ่อนรหัสผ่านเดิม
    const toggleOldPass = document.getElementById('toggle-old-pass');
    const oldPassInput = document.getElementById('old-pass');
    if (toggleOldPass && oldPassInput) {
        toggleOldPass.onclick = () => {
            if (oldPassInput.type === 'password') {
                oldPassInput.type = 'text';
                toggleOldPass.classList.remove('fa-eye-slash');
                toggleOldPass.classList.add('fa-eye');
            } else {
                oldPassInput.type = 'password';
                toggleOldPass.classList.remove('fa-eye');
                toggleOldPass.classList.add('fa-eye-slash');
            }
        };
    }

    // ผูกการแสดง/ซ่อนรหัสผ่านใหม่
    const toggleNewPass = document.getElementById('toggle-new-pass');
    const newPassInput = document.getElementById('new-pass');
    if (toggleNewPass && newPassInput) {
        toggleNewPass.onclick = () => {
            if (newPassInput.type === 'password') {
                newPassInput.type = 'text';
                toggleNewPass.classList.remove('fa-eye-slash');
                toggleNewPass.classList.add('fa-eye');
            } else {
                newPassInput.type = 'password';
                toggleNewPass.classList.remove('fa-eye');
                toggleNewPass.classList.add('fa-eye-slash');
            }
        };
    }

    // การเปลี่ยนรหัสผ่าน
    document.getElementById('submit-change-pass-btn').onclick = () => {
        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;
        const res = handleChangePassword(newPass, oldPass, user.id, () => {
            document.getElementById('old-pass').value = "";
            document.getElementById('new-pass').value = "";
        });
        alert(res.message);
    };

    // จัดการเปลี่ยนบทบาทในการสร้างผู้ใช้และอัปเดต ID พรีวิว
    const createUserRole = document.getElementById('create-user-role');
    const createUserClassGroup = document.getElementById('create-user-class-group');
    const createUserIdInput = document.getElementById('create-user-id');
    const previewDiv = document.getElementById('generated-user-id-preview');

    const updateGeneratedIdPreview = () => {
        if (createUserIdInput && previewDiv) {
            const role = createUserRole ? createUserRole.value : 'student';
            const digits = createUserIdInput.value.trim();
            let prefix = 'S';
            if (role === 'parent') prefix = 'P';
            else if (role === 'teacher') prefix = 'T';
            previewDiv.innerText = `User ID ที่จะถูกสร้าง: ${prefix}${digits}`;
        }
    };

    if (createUserRole && createUserClassGroup) {
        createUserRole.onchange = () => {
            if (createUserRole.value === 'student') {
                createUserClassGroup.style.display = 'block';
            } else {
                createUserClassGroup.style.display = 'none';
            }
            updateGeneratedIdPreview();
        };
    }

    // จำกัดให้กรอกเฉพาะตัวเลขเท่านั้นและอัปเดตพรีวิว
    if (createUserIdInput) {
        createUserIdInput.oninput = () => {
            createUserIdInput.value = createUserIdInput.value.replace(/[^0-9]/g, '');
            updateGeneratedIdPreview();
        };
    }

    // กดสร้างผู้ใช้ใหม่
    const submitCreateUserBtn = document.getElementById('submit-create-user-btn');
    if (submitCreateUserBtn) {
        submitCreateUserBtn.onclick = () => {
            const role = document.getElementById('create-user-role').value;
            const numericId = document.getElementById('create-user-id').value.trim();
            const name = document.getElementById('create-user-name').value.trim();
            const pass = document.getElementById('create-user-pass').value.trim();
            const classId = document.getElementById('create-user-class') ? document.getElementById('create-user-class').value.trim() : null;

            if (!numericId || !name || !pass) {
                alert('กรุณากรอกข้อมูลให้ครบถ้วน');
                return;
            }

            let prefix = 'S';
            if (role === 'parent') prefix = 'P';
            else if (role === 'teacher') prefix = 'T';

            const finalId = prefix + numericId;

            const res = createUser(finalId, name, role, pass, classId);
            alert(res.message);
            if (res.success) {
                document.getElementById('create-user-id').value = '';
                document.getElementById('create-user-name').value = '';
                document.getElementById('create-user-pass').value = '';
                updateGeneratedIdPreview();
            }
        };
    }

    // จัดการการนำเข้าบัญชีจากไฟล์ CSV
    const submitImportUsersBtn = document.getElementById('submit-import-users-btn');
    const importCsvInput = document.getElementById('import-users-csv');
    if (submitImportUsersBtn && importCsvInput) {
        submitImportUsersBtn.onclick = () => {
            const file = importCsvInput.files[0];
            if (!file) {
                alert('กรุณาเลือกไฟล์ CSV ก่อน');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                let successCount = 0;
                let failCount = 0;
                let messages = [];

                lines.forEach((line, index) => {
                    // ข้ามหัวข้อหลัก (Header) หากมี
                    if (index === 0 && (line.toLowerCase().includes('role') || line.includes('บทบาท'))) {
                        return;
                    }
                    if (!line.trim()) return;

                    // แยกคอลัมน์ด้วยคอมมา (Comma)
                    const cols = line.split(',').map(c => c.trim());
                    if (cols.length < 4) {
                        failCount++;
                        return;
                    }

                    let role = cols[0].toLowerCase();
                    let numericId = cols[1].replace(/[^0-9]/g, '');
                    let name = cols[2];
                    let pass = cols[3];
                    let classId = cols[4] || null;

                    if (!role || !numericId || !name || !pass) {
                        failCount++;
                        return;
                    }

                    // แปลงชื่อบทบาทให้ตรงมาตรฐาน
                    if (role === 's' || role === 'student') {
                        role = 'student';
                    } else if (role === 'p' || role === 'parent') {
                        role = 'parent';
                    } else if (role === 't' || role === 'teacher') {
                        role = 'teacher';
                    } else {
                        failCount++;
                        return;
                    }

                    let prefix = 'S';
                    if (role === 'parent') prefix = 'P';
                    else if (role === 'teacher') prefix = 'T';

                    const finalId = prefix + numericId;

                    const res = createUser(finalId, name, role, pass, classId);
                    if (res.success) {
                        successCount++;
                    } else {
                        failCount++;
                        messages.push(`${finalId}: ${res.message}`);
                    }
                });

                let resultMsg = `นำเข้าสำเร็จ ${successCount} รายการ`;
                if (failCount > 0) {
                    resultMsg += `, ล้มเหลว ${failCount} รายการ`;
                }
                if (messages.length > 0) {
                    resultMsg += `\n\nตัวอย่างข้อผิดพลาด:\n` + messages.slice(0, 5).join('\n');
                }
                alert(resultMsg);
                importCsvInput.value = '';
                // รีเฟรชสถิติในระบบจำลองจำลอง
                updateSystemStats();
            };
            reader.readAsText(file, 'UTF-8');
        };
    }

    // ปุ่มของครู: ผูกผู้ปกครองเข้ากับนักเรียน
    const linkBtn = document.getElementById('teacher-link-parent-btn');
    if (linkBtn) {
        linkBtn.onclick = () => {
            const students = getStudentsInClass('1/1');
            const studentChoices = students.map(s => `${s.id}: ${s.name}`).join('\n');
            const targetStudentId = prompt(`กรอก ID นักเรียนที่ต้องการผูก:\n\n${studentChoices}`, '');
            
            if (targetStudentId && db.users[targetStudentId]) {
                const parents = Object.values(db.users).filter(u => u.role === 'parent');
                const parentChoices = parents.map(p => `${p.id}: ${p.name}`).join('\n');
                const targetParentId = prompt(`กรอก ID ผู้ปกครองที่จะผูกกับนักเรียนคนดังกล่าว:\n\n${parentChoices}`, '');
                
                if (targetParentId && db.users[targetParentId]) {
                    const pUser = db.users[targetParentId];
                    if (!pUser.linkedStudents) pUser.linkedStudents = [];
                    if (!pUser.linkedStudents.includes(targetStudentId)) {
                        pUser.linkedStudents.push(targetStudentId);
                    }
                    
                    db.users[targetStudentId].parentId = targetParentId;
                    saveDatabase(db);
                    alert(`ทำการผูก ${pUser.name} เข้ากับนักเรียน ${db.users[targetStudentId].name} สำเร็จแล้ว!`);
                }
            }
        };
    }

    // ปุ่มของครู: แจกการ์ดให้นักเรียน
    const giftBtn = document.getElementById('teacher-gift-card-btn');
    if (giftBtn) {
        giftBtn.onclick = () => {
            const students = getStudentsInClass('1/1');
            const studentChoices = students.map(s => `${s.id}: ${s.name}`).join('\n');
            const targetStudentId = prompt(`เลือก ID นักเรียนที่ต้องการแจกการ์ดส่งงานช้าให้:\n\n${studentChoices}`, '');

            if (targetStudentId && db.users[targetStudentId]) {
                const card = teacherGiveCardToStudent(targetStudentId);
                alert(`แจกการ์ดสำเร็จ! มอบ "${card.name}" แก่ ${db.users[targetStudentId].name} เรียบร้อย (รหัสการ์ด: ${card.id})`);
                updateSystemStats();
            }
        };
    }

    // ปุ่มของครู: รีเซ็ตฐานข้อมูลทั้งหมด
    const resetDbBtn = document.getElementById('settings-reset-db-btn');
    if (resetDbBtn) {
        resetDbBtn.onclick = () => {
            if (confirm("ต้องการรีเซ็ตข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้นใช่หรือไม่? บัญชีผู้ใช้ที่สร้างใหม่และการบ้านทั้งหมดจะถูกลบ")) {
                resetDatabase();
            }
        };
    }
}

// -------------------------------------------------------------
// 10. ฟังก์ชันสนับสนุนแผงจำลองการทดสอบรอบกรอบโทรศัพท์ (Shared Simulation View Helpers)
// -------------------------------------------------------------

// อัปเดตตาราง Google Drive จำลองภายนอกกรอบโทรศัพท์
export function updateGoogleDriveMock() {
    const db = loadDatabase();
    const driveList = document.getElementById('drive-file-list');
    const emptyMsg = document.getElementById('drive-empty-msg');
    if (!driveList || !emptyMsg) return;

    driveList.innerHTML = "";
    
    if (db.mockGoogleDrive.length === 0) {
        emptyMsg.style.display = "block";
        return;
    }

    emptyMsg.style.display = "none";
    db.mockGoogleDrive.forEach(file => {
        const li = document.createElement('li');
        li.className = 'drive-file-item';
        li.innerHTML = `
            <div class="drive-file-info">
                <i class="fa-regular fa-file-pdf"></i>
                <div class="drive-file-name" title="${file.name}">${file.name}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span class="drive-file-meta">${file.student}</span>
                <span class="drive-file-meta" style="font-size:0.65rem;">${file.date}</span>
            </div>
        `;
        driveList.appendChild(li);
    });
}

// อัปเดตสถิติระบบบนแผงควบคุมจำลอง
export function updateSystemStats() {
    const db = loadDatabase();
    
    const statPending = document.getElementById('stat-pending-tasks');
    const statC1 = document.getElementById('stat-cards-s1');
    const statC2 = document.getElementById('stat-cards-s2');

    if (statPending) {
        // นับการบ้านทั้งหมดที่ค้างส่ง (ยังไม่ส่ง) ของ student1
        const student1Subs = db.submissions.filter(s => s.studentId === 'student1').map(s => s.homeworkId);
        const pendingCount = db.homework.filter(hw => hw.class === '1/1' && !student1Subs.includes(hw.id)).length;
        statPending.innerText = pendingCount;
    }

    if (statC1) {
        const s1Cards = db.cards.filter(c => c.ownerId === 'student1' && c.usedForHomeworkId === null).length;
        statC1.innerText = s1Cards;
    }

    if (statC2) {
        const s2Cards = db.cards.filter(c => c.ownerId === 'student2' && c.usedForHomeworkId === null).length;
        statC2.innerText = s2Cards;
    }
}
