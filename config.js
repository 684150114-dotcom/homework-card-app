// --- Configuration File (สลับโหมดจำลอง vs ระบบจริง) ---

export const CONFIG = {
    // กำหนดโหมดการทำงานของแอปพลิเคชัน:
    // false = โหมดจำลองข้อมูลในเบราว์เซอร์ปัจจุบัน (LocalStorage) - ใช้งานได้ทันทีโดยไม่มีค่าใช้จ่าย
    // true = เชื่อมต่อคลาวด์ Firebase และระบบสแกนกล้องถ่ายรูปจริง
    useFirebase: false,

    // ข้อมูลเชื่อมต่อ Firebase SDK (คัดลอกจาก Firebase Console)
    firebaseConfig: {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_MESSAGING_ID",
        appId: "YOUR_APP_ID"
    },

    // รหัส Client ID สำหรับใช้งาน Google Drive API ของฝั่งคุณครู
    googleClientId: "YOUR_GOOGLE_CLIENT_ID"
};
