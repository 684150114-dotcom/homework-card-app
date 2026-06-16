// --- Data Store & State Management (LocalStorage & Real-time Firebase Firestore Sync) ---
import { CONFIG } from '../config.js';

// นำเข้า Firebase Web SDK จาก CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    deleteDoc, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const DB_KEY = 'homework_app_database';

// ข้อมูลเริ่มต้นของระบบ (Default Seed Data)
const defaultData = {
    users: {
        'M000': { id: 'M000', name: 'คุณครูผู้ดูแลระบบ (Master)', role: 'teacher', pass: '1234' }
    },
    subjects: ["คอมพิวเตอร์"],
    classes: ["1/1"],
    homework: [],
    submissions: [],
    missingAlerts: {},
    cards: [],
    delegations: [],
    activeTrades: {},
    mockGoogleDrive: []
};

// อ้างอิงตัวแปรฐานข้อมูล Cloud
let dbCloud = null;

// โหลดฐานข้อมูลจาก LocalStorage
export function loadDatabase() {
    const data = localStorage.getItem(DB_KEY);
    if (!data) {
        saveDatabase(defaultData);
        return defaultData;
    }
    try {
        const parsed = JSON.parse(data);
        // หากไม่มีบัญชีแอดมิน M000 ใน LocalStorage ให้ทำการล้างค่าเป็นระบบจริง
        if (!parsed.users || !parsed.users['M000']) {
            console.log("Old simulation database detected or missing M000. Resetting to production defaults...");
            saveDatabase(defaultData);
            return defaultData;
        }

        let databaseChanged = false;

        // บังคับให้รหัสผ่านผู้ใช้งานทุกคนเป็น '1234' ทั้งหมด
        for (const userId in parsed.users) {
            if (parsed.users[userId].pass !== '1234') {
                parsed.users[userId].pass = '1234';
                databaseChanged = true;
                // อัปโหลดขึ้นคลาวด์ Firebase ด้วยถ้าเปิดใช้งาน
                writeToCloud("users", userId, parsed.users[userId]);
            }
        }

        // ตรวจสอบและบังคับโครงสร้างคลาสเรียน
        if (!parsed.classes) {
            parsed.classes = ["1/1"];
            databaseChanged = true;
        }

        if (databaseChanged) {
            saveDatabase(parsed);
        }
        return parsed;
    } catch (e) {
        console.error("Error parsing database, resetting to default", e);
        saveDatabase(defaultData);
        return defaultData;
    }
}

// บันทึกฐานข้อมูลลง LocalStorage
export function saveDatabase(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
}

// รีเซ็ตฐานข้อมูล (รองรับรีเซ็ตทั้ง Local และ Cloud)
export function resetDatabase() {
    saveDatabase(defaultData);
    if (CONFIG.useFirebase && dbCloud) {
        // หากเปิดใช้งานคลาวด์ ให้ลบระบุชื่อตัวอย่างแล้วเซ็ตใหม่
        seedCloudDatabase(true);
    } else {
        window.location.reload();
    }
}

// --- ฟังก์ชันบันทึกและลบข้อมูลจาก Firebase (Cloud Helpers) ---

function writeToCloud(collectionName, docId, data) {
    if (!CONFIG.useFirebase || !dbCloud) return;
    setDoc(doc(dbCloud, collectionName, docId), data)
        .catch(e => console.error(`Cloud write failed on ${collectionName}/${docId}`, e));
}

function deleteFromCloud(collectionName, docId) {
    if (!CONFIG.useFirebase || !dbCloud) return;
    deleteDoc(doc(dbCloud, collectionName, docId))
        .catch(e => console.error(`Cloud delete failed on ${collectionName}/${docId}`, e));
}

// -------------------------------------------------------------
// 🔄 ระบบ Sync ข้อมูลสองทางเรียลไทม์ (Real-time Dual Sync Engine)
// -------------------------------------------------------------
function setupRealtimeSync() {
    if (!dbCloud) return;

    const triggerUIUpdate = () => {
        window.dispatchEvent(new Event('db_updated'));
    };

    // 1. ดึงข้อมูลและฟังความเปลี่ยนแปลง: ผู้ใช้งาน
    onSnapshot(collection(dbCloud, "users"), (snapshot) => {
        const db = loadDatabase();
        snapshot.forEach((doc) => {
            db.users[doc.id] = doc.data();
        });
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 2. ดึงข้อมูลและฟังความเปลี่ยนแปลง: รายวิชา
    onSnapshot(collection(dbCloud, "subjects"), (snapshot) => {
        const db = loadDatabase();
        const subjects = [];
        snapshot.forEach((doc) => {
            subjects.push(doc.data().name);
        });
        if (subjects.length > 0) {
            db.subjects = subjects;
            saveDatabase(db);
            triggerUIUpdate();
        }
    });

    // 3. ดึงข้อมูลและฟังความเปลี่ยนแปลง: รายการการบ้าน
    onSnapshot(collection(dbCloud, "homework"), (snapshot) => {
        const db = loadDatabase();
        const homework = [];
        snapshot.forEach((doc) => {
            homework.push({ id: doc.id, ...doc.data() });
        });
        db.homework = homework;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 4. ดึงข้อมูลและฟังความเปลี่ยนแปลง: บันทึกการส่งงาน
    onSnapshot(collection(dbCloud, "submissions"), (snapshot) => {
        const db = loadDatabase();
        const submissions = [];
        snapshot.forEach((doc) => {
            submissions.push({ id: doc.id, ...doc.data() });
        });
        db.submissions = submissions;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 5. ดึงข้อมูลและฟังความเปลี่ยนแปลง: การแจ้งเตือนสีแดง (Missing Alerts)
    onSnapshot(collection(dbCloud, "missingAlerts"), (snapshot) => {
        const db = loadDatabase();
        const missingAlerts = {};
        snapshot.forEach((doc) => {
            missingAlerts[doc.id] = doc.data().homeworkIds || [];
        });
        db.missingAlerts = missingAlerts;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 6. ดึงข้อมูลและฟังความเปลี่ยนแปลง: การ์ดของนักเรียน
    onSnapshot(collection(dbCloud, "cards"), (snapshot) => {
        const db = loadDatabase();
        const cards = [];
        snapshot.forEach((doc) => {
            cards.push({ id: doc.id, ...doc.data() });
        });
        db.cards = cards;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 7. ดึงข้อมูลและฟังความเปลี่ยนแปลง: การมอบอำนาจตัวแทน
    onSnapshot(collection(dbCloud, "delegations"), (snapshot) => {
        const db = loadDatabase();
        const delegations = [];
        snapshot.forEach((doc) => {
            delegations.push(doc.data());
        });
        db.delegations = delegations;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 8. ดึงข้อมูลและฟังความเปลี่ยนแปลง: QR โอนการ์ด
    onSnapshot(collection(dbCloud, "activeTrades"), (snapshot) => {
        const db = loadDatabase();
        const activeTrades = {};
        snapshot.forEach((doc) => {
            activeTrades[doc.id] = doc.data();
        });
        db.activeTrades = activeTrades;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 9. ดึงข้อมูลและฟังความเปลี่ยนแปลง: Google Drive Logs
    onSnapshot(collection(dbCloud, "mockGoogleDrive"), (snapshot) => {
        const db = loadDatabase();
        const mockGoogleDrive = [];
        snapshot.forEach((doc) => {
            mockGoogleDrive.push(doc.data());
        });
        db.mockGoogleDrive = mockGoogleDrive;
        saveDatabase(db);
        triggerUIUpdate();
    });

    // 10. ดึงข้อมูลและฟังความเปลี่ยนแปลง: คลาสเรียน
    onSnapshot(collection(dbCloud, "classes"), (snapshot) => {
        const db = loadDatabase();
        const classes = [];
        snapshot.forEach((doc) => {
            classes.push(doc.data().name);
        });
        if (classes.length > 0) {
            db.classes = classes;
            saveDatabase(db);
            triggerUIUpdate();
        }
    });
}

// เช็คและอัปโหลดข้อมูลเริ่มต้นขึ้น Firebase (Auto Seed)
async function seedCloudDatabase(force = false) {
    if (!dbCloud) return;
    try {
        const docRef = doc(dbCloud, "users", "M000");
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists() || force) {
            console.log("Seeding default/reset dataset to Cloud Firestore...");
            
            // อัปโหลดข้อมูลรายชื่อนักเรียน/ครู
            for (const [userId, userObj] of Object.entries(defaultData.users)) {
                await setDoc(doc(dbCloud, "users", userId), userObj);
            }
            // อัปโหลดรายวิชา
            for (const subj of defaultData.subjects) {
                await setDoc(doc(dbCloud, "subjects", subj), { name: subj });
            }
            // อัปโหลดคลาสเรียน
            const classesToSeed = defaultData.classes || ["1/1"];
            for (const cls of classesToSeed) {
                await setDoc(doc(dbCloud, "classes", cls.replace('/', '-')), { name: cls });
            }
            // อัปโหลดการบ้าน
            for (const hw of defaultData.homework) {
                await setDoc(doc(dbCloud, "homework", hw.id), hw);
            }
            // อัปโหลดการส่งการบ้าน
            for (const sub of defaultData.submissions) {
                await setDoc(doc(dbCloud, "submissions", sub.id), sub);
            }
            // อัปโหลดการ์ด
            for (const card of defaultData.cards) {
                await setDoc(doc(dbCloud, "cards", card.id), card);
            }
            // อัปโหลดกฎตัวแทนผู้สั่งงาน
            for (const del of defaultData.delegations) {
                const delId = `${del.studentId}_${del.class.replace('/', '-')}_${del.subject}`;
                await setDoc(doc(dbCloud, "delegations", delId), del);
            }
            // อัปโหลดรายงานการแจ้งเตือนแดง
            for (const [studentId, hwIds] of Object.entries(defaultData.missingAlerts)) {
                await setDoc(doc(dbCloud, "missingAlerts", studentId), { homeworkIds: hwIds });
            }
            // อัปโหลดไฟล์ประวัติไดรฟ์ของครู
            for (const driveItem of defaultData.mockGoogleDrive) {
                const logId = `drive_log_${Date.now()}_${Math.floor(Math.random() * 100)}`;
                await setDoc(doc(dbCloud, "mockGoogleDrive", logId), driveItem);
            }
            
            console.log("Cloud Firestore Seeding completed successfully!");
            if (force) window.location.reload();
        }
    } catch (e) {
        console.warn("Seeding cloud database failed (probably using default/unconfigured API key):", e);
    }
}

// เริ่มระบบเชื่อมต่อคลาวด์ตามการเปิดสวิตช์ใน config
if (CONFIG.useFirebase) {
    try {
        const app = initializeApp(CONFIG.firebaseConfig);
        dbCloud = getFirestore(app);
        
        // รันการฟังข้อมูลเรียลไทม์
        setupRealtimeSync();
        // ตรวจสอบและอัปโหลดเมล็ดข้อมูลเริ่มต้น
        seedCloudDatabase();
    } catch (e) {
        console.error("Firebase SDK initialization failed", e);
    }
}

// --- ฟังก์ชันการจัดการผู้ใช้งาน (User & Authentication) ---

// ตรวจสอบล็อกอิน
export function login(username, password) {
    const db = loadDatabase();
    const user = db.users[username];
    if (user && user.pass === password) {
        localStorage.setItem('current_user_id', user.id);
        return user;
    }
    return null;
}

// ล็อกเอาต์
export function logout() {
    localStorage.removeItem('current_user_id');
}

// ดึงข้อมูลผู้ใช้ปัจจุบัน
export function getCurrentUser() {
    const userId = localStorage.getItem('current_user_id');
    if (!userId) return null;
    const db = loadDatabase();
    return db.users[userId] || null;
}

// ดึงรายชื่อนักเรียนในห้อง
export function getStudentsInClass(classId) {
    const db = loadDatabase();
    return Object.values(db.users).filter(u => u.role === 'student' && u.class === classId);
}

// อัปเดตรหัสผ่าน
export function createUser(id, name, role, pass, classId = null) {
    const db = loadDatabase();
    if (db.users[id]) {
        return { success: false, message: 'มี User ID นี้ในระบบอยู่แล้ว' };
    }
    const newUser = { id, name, role, pass: '1234' }; // บังคับให้เป็น 1234
    if (role === 'student') {
        newUser.class = classId || '1/1';
        newUser.parentId = null;
    } else if (role === 'parent') {
        newUser.linkedStudents = [];
    }
    db.users[id] = newUser;
    saveDatabase(db);
    writeToCloud("users", id, newUser);
    return { success: true, message: 'สร้างบัญชีผู้ใช้งานสำเร็จ!' };
}

export function updatePassword(userId, newPassword) {
    const db = loadDatabase();
    if (db.users[userId]) {
        db.users[userId].pass = '1234'; // บังคับเป็น 1234
        saveDatabase(db);
        
        // เขียนขึ้นคลาวด์
        writeToCloud("users", userId, db.users[userId]);
        return true;
    }
    return false;
}

export function addClass(name) {
    const db = loadDatabase();
    if (name && !db.classes.includes(name)) {
        db.classes.push(name);
        saveDatabase(db);
        writeToCloud("classes", name.replace('/', '-'), { name });
        return true;
    }
    return false;
}

export function deleteClass(name) {
    const db = loadDatabase();
    db.classes = db.classes.filter(c => c !== name);
    // เปลี่ยนห้องเรียนของนักเรียนที่เป็นสมาชิกในห้องนี้เป็น ""
    Object.values(db.users).forEach(u => {
        if (u.class === name) {
            u.class = "";
            writeToCloud("users", u.id, u);
        }
    });
    saveDatabase(db);
    deleteFromCloud("classes", name.replace('/', '-'));
}

export function updateStudentClass(studentId, classId) {
    const db = loadDatabase();
    if (db.users[studentId]) {
        db.users[studentId].class = classId;
        saveDatabase(db);
        writeToCloud("users", studentId, db.users[studentId]);
        return true;
    }
    return false;
}

export function deleteUser(userId) {
    const db = loadDatabase();
    if (db.users[userId]) {
        delete db.users[userId];
        saveDatabase(db);
        deleteFromCloud("users", userId);
        return true;
    }
    return false;
}

// --- ฟังก์ชันการจัดการวิชาและแท็บ ---

export function updateSubjectName(oldName, newName) {
    const db = loadDatabase();
    const index = db.subjects.indexOf(oldName);
    if (index !== -1 && newName && !db.subjects.includes(newName)) {
        db.subjects[index] = newName;
        
        // อัปเดตการบ้านในวิชาที่เปลี่ยน
        db.homework.forEach(hw => {
            if (hw.subject === oldName) {
                hw.subject = newName;
                writeToCloud("homework", hw.id, hw);
            }
        });
        // อัปเดตสิทธิ์ตัวแทน
        db.delegations.forEach(del => {
            if (del.subject === oldName) {
                const oldDelId = `${del.studentId}_${del.class.replace('/', '-')}_${oldName}`;
                deleteFromCloud("delegations", oldDelId);

                del.subject = newName;
                const newDelId = `${del.studentId}_${del.class.replace('/', '-')}_${newName}`;
                writeToCloud("delegations", newDelId, del);
            }
        });

        // ลบวิชาเดิมจากคลาวด์ และแทนที่ด้วยตัวใหม่
        deleteFromCloud("subjects", oldName);
        writeToCloud("subjects", newName, { name: newName });

        saveDatabase(db);
        return true;
    }
    return false;
}

export function addSubject(name) {
    const db = loadDatabase();
    if (name && !db.subjects.includes(name)) {
        db.subjects.push(name);
        saveDatabase(db);
        
        writeToCloud("subjects", name, { name });
        return true;
    }
    return false;
}

export function deleteSubject(name) {
    const db = loadDatabase();
    db.subjects = db.subjects.filter(s => s !== name);
    saveDatabase(db);
    
    deleteFromCloud("subjects", name);
}

// --- ฟังก์ชันการจัดการการบ้าน (Homework) ---

export function addHomework(title, description, dueDate, subject, classId, rewardCard, creatorId) {
    const db = loadDatabase();
    const newHw = {
        id: 'hw_' + Date.now(),
        title,
        description,
        dueDate: new Date(dueDate).toISOString(),
        class: classId,
        subject,
        rewardCard: !!rewardCard,
        creator: creatorId,
        firstSubmitter: null
    };
    db.homework.push(newHw);
    saveDatabase(db);

    writeToCloud("homework", newHw.id, newHw);
    return newHw;
}

export function getHomeworkForStudent(studentId, classId, subject, status = 'pending') {
    const db = loadDatabase();
    const student = db.users[studentId];
    if (!student) return [];

    const submittedHwIds = db.submissions
        .filter(sub => sub.studentId === studentId)
        .map(sub => sub.homeworkId);

    let filteredHw = db.homework.filter(hw => hw.class === classId && hw.subject === subject);

    if (status === 'pending') {
        filteredHw = filteredHw.filter(hw => !submittedHwIds.includes(hw.id));
    } else {
        filteredHw = filteredHw.filter(hw => submittedHwIds.includes(hw.id));
    }

    return sortHomeworkList(filteredHw, studentId, db);
}

export function getSubmittedHomeworkForStudent(studentId) {
    const db = loadDatabase();
    const submittedHwIds = db.submissions
        .filter(sub => sub.studentId === studentId)
        .map(sub => sub.homeworkId);

    return db.homework.filter(hw => submittedHwIds.includes(hw.id));
}

function sortHomeworkList(homeworks, studentId, db) {
    const studentAlerts = db.missingAlerts[studentId] || [];

    return [...homeworks].sort((a, b) => {
        const aAlert = studentAlerts.includes(a.id);
        const bAlert = studentAlerts.includes(b.id);

        if (aAlert && !bAlert) return -1;
        if (!aAlert && bAlert) return 1;

        return new Date(a.dueDate) - new Date(b.dueDate);
    });
}

export function isHomeworkAlerted(homeworkId, studentId) {
    const db = loadDatabase();
    const alerts = db.missingAlerts[studentId] || [];
    return alerts.includes(homeworkId);
}

// --- ฟังก์ชันการส่งงานและการตรวจงาน (Submission & Grading) ---

export function submitHomework(homeworkId, studentId, fileType, fileName, fileContent) {
    const db = loadDatabase();
    const student = db.users[studentId];
    if (!student) return null;

    const homework = db.homework.find(h => h.id === homeworkId);
    let earnRewardCard = false;
    let cardReceived = null;

    if (homework && !homework.firstSubmitter) {
        homework.firstSubmitter = studentId;
        
        // ถ้าแจกการ์ดให้คนแรก
        if (homework.rewardCard) {
            earnRewardCard = true;
            const newCardId = 'CARD-' + Math.floor(1000 + Math.random() * 9000);
            cardReceived = {
                id: newCardId,
                type: 'LATE_SUBMIT_1D',
                name: 'การ์ดส่งงานช้า 1 วัน',
                ownerId: studentId,
                usedForHomeworkId: null
            };
            db.cards.push(cardReceived);
            writeToCloud("cards", cardReceived.id, cardReceived);
        }
        writeToCloud("homework", homework.id, homework);
    }

    // ลบการแจ้งเตือนแดงเมื่อส่ง
    if (db.missingAlerts[studentId]) {
        db.missingAlerts[studentId] = db.missingAlerts[studentId].filter(id => id !== homeworkId);
        writeToCloud("missingAlerts", studentId, { homeworkIds: db.missingAlerts[studentId] });
    }

    // สร้างข้อมูลส่งงาน
    const newSubmission = {
        id: 'sub_' + Date.now(),
        homeworkId,
        studentId,
        studentName: student.name,
        fileName,
        fileType,
        fileUrl: fileType === 'link' ? fileContent : `https://drive.google.com/mock/${studentId}_${Date.now()}_${fileName}`,
        submittedAt: new Date().toISOString(),
        grade: null,
        gradedAt: null
    };
    db.submissions.push(newSubmission);
    writeToCloud("submissions", newSubmission.id, newSubmission);

    // ล็อกอัพโหลดลง Google Drive ของครู
    const driveLog = {
        name: fileName,
        student: student.name,
        date: new Date().toLocaleDateString('th-TH') + ' ' + new Date().toLocaleTimeString('th-TH')
    };
    db.mockGoogleDrive.unshift(driveLog);
    
    const logId = `drive_log_${Date.now()}`;
    writeToCloud("mockGoogleDrive", logId, driveLog);

    saveDatabase(db);
    return { submission: newSubmission, earnRewardCard, cardReceived };
}

export function getSubmissionsForHomework(homeworkId) {
    const db = loadDatabase();
    return db.submissions.filter(sub => sub.homeworkId === homeworkId);
}

export function gradeSubmission(submissionId, gradeValue) {
    const db = loadDatabase();
    const submission = db.submissions.find(sub => sub.id === submissionId);
    if (submission) {
        submission.grade = parseFloat(gradeValue);
        submission.gradedAt = new Date().toISOString();
        saveDatabase(db);

        writeToCloud("submissions", submission.id, submission);
        return true;
    }
    return false;
}

export function toggleMissingAlert(homeworkId, studentId) {
    const db = loadDatabase();
    if (!db.missingAlerts[studentId]) {
        db.missingAlerts[studentId] = [];
    }

    const index = db.missingAlerts[studentId].indexOf(homeworkId);
    let alerted = false;
    
    if (index === -1) {
        db.missingAlerts[studentId].push(homeworkId);
        alerted = true;
    } else {
        db.missingAlerts[studentId].splice(index, 1);
    }

    saveDatabase(db);
    writeToCloud("missingAlerts", studentId, { homeworkIds: db.missingAlerts[studentId] });
    return alerted;
}

// --- ฟังก์ชันเมนูคะแนน (#Grades) ---

export function getGradesForStudent(studentId) {
    const db = loadDatabase();
    const studentSubmissions = db.submissions.filter(sub => sub.studentId === studentId && sub.grade !== null);
    
    const subjectGrades = {};
    db.subjects.forEach(sub => {
        subjectGrades[sub] = [];
    });

    studentSubmissions.forEach(sub => {
        const hw = db.homework.find(h => h.id === sub.homeworkId);
        if (hw && subjectGrades[hw.subject]) {
            subjectGrades[hw.subject].push({
                homeworkTitle: hw.title,
                grade: sub.grade,
                gradedAt: sub.gradedAt
            });
        }
    });

    return subjectGrades;
}

// --- ฟังก์ชันการ์ดและระบบแลกเปลี่ยนการ์ด ---

export function getStudentCards(studentId) {
    const db = loadDatabase();
    return db.cards.filter(card => card.ownerId === studentId && card.usedForHomeworkId === null);
}

export function useLateSubmissionCard(studentId, homeworkId) {
    const db = loadDatabase();
    
    const card = db.cards.find(c => c.ownerId === studentId && c.usedForHomeworkId === null);
    if (!card) return { success: false, message: 'คุณไม่มีการ์ดส่งงานช้าเหลืออยู่' };

    const alreadyUsed = db.cards.some(c => c.ownerId === studentId && c.usedForHomeworkId === homeworkId);
    if (alreadyUsed) return { success: false, message: 'คุณเคยใช้การ์ดส่งงานช้ากับงานชิ้นนี้ไปแล้ว (จำกัด 1 ใบต่องาน)' };

    card.usedForHomeworkId = homeworkId;
    writeToCloud("cards", card.id, card);

    const homework = db.homework.find(h => h.id === homeworkId);
    if (homework) {
        const currentDue = new Date(homework.dueDate);
        homework.dueDate = new Date(currentDue.getTime() + 24 * 60 * 60 * 1000).toISOString();
        writeToCloud("homework", homework.id, homework);
    }

    saveDatabase(db);
    return { success: true, message: 'ใช้การ์ดสำเร็จ! ขยายเวลากำหนดส่งออกไป 1 วัน' };
}

export function teacherGiveCardToStudent(studentId) {
    const db = loadDatabase();
    const newCardId = 'CARD-' + Math.floor(1000 + Math.random() * 9000);
    const newCard = {
        id: newCardId,
        type: 'LATE_SUBMIT_1D',
        name: 'การ์ดส่งงานช้า 1 วัน',
        ownerId: studentId,
        usedForHomeworkId: null
    };
    db.cards.push(newCard);
    saveDatabase(db);

    writeToCloud("cards", newCard.id, newCard);
    return newCard;
}

// --- ระบบสแกนและโอนการ์ดด้วย QR Code ---

export function createTradeOffer(cardId, senderId) {
    const db = loadDatabase();
    const card = db.cards.find(c => c.id === cardId && c.ownerId === senderId);
    if (!card) return null;

    const tradeId = 'TRADE_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    db.activeTrades[tradeId] = {
        id: tradeId,
        cardId: cardId,
        cardName: card.name,
        senderId: senderId,
        createdAt: Date.now()
    };
    saveDatabase(db);

    writeToCloud("activeTrades", tradeId, db.activeTrades[tradeId]);
    return tradeId;
}

export function getTradeOffer(tradeId) {
    const db = loadDatabase();
    return db.activeTrades[tradeId] || null;
}

export function acceptTradeOffer(tradeId, receiverId) {
    const db = loadDatabase();
    const trade = db.activeTrades[tradeId];
    if (!trade) return { success: false, message: 'ไม่พบรายการแลกเปลี่ยน หรือหมดอายุการเชื่อมต่อ' };

    const card = db.cards.find(c => c.id === trade.cardId);
    if (!card) return { success: false, message: 'ไม่พบการ์ดใบนี้ในระบบ' };
    if (card.ownerId !== trade.senderId) return { success: false, message: 'การ์ดถูกย้ายเจ้าของไปแล้ว' };
    if (trade.senderId === receiverId) return { success: false, message: 'คุณไม่สามารถแลกการ์ดกับตัวเองได้' };

    card.ownerId = receiverId;
    writeToCloud("cards", card.id, card);

    delete db.activeTrades[tradeId];
    deleteFromCloud("activeTrades", tradeId);
    
    saveDatabase(db);
    return { success: true, message: `แลกเปลี่ยนการ์ดสำเร็จ! ได้รับ "${card.name}" แล้ว` };
}

// --- ระบบมอบอำนาจ (Delegation) ---

export function isStudentDelegated(studentId, classId, subject) {
    const db = loadDatabase();
    return db.delegations.some(del => del.studentId === studentId && del.class === classId && del.subject === subject);
}

export function toggleDelegation(studentId, classId, subject) {
    const db = loadDatabase();
    const index = db.delegations.findIndex(del => del.studentId === studentId && del.class === classId && del.subject === subject);
    let delegated = false;
    const delId = `${studentId}_${classId.replace('/', '-')}_${subject}`;

    if (index === -1) {
        const newDel = { studentId, class: classId, subject };
        db.delegations.push(newDel);
        delegated = true;
        writeToCloud("delegations", delId, newDel);
    } else {
        db.delegations.splice(index, 1);
        deleteFromCloud("delegations", delId);
    }
    saveDatabase(db);
    return delegated;
}
