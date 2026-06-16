// --- QR Code & Card Trading Module (รองรับทั้งโหมดจำลองและกล้องจริง) ---
import { createTradeOffer, getTradeOffer, acceptTradeOffer, loadDatabase } from './state.js';
import { CONFIG } from '../config.js';

// ติดตามอ้างอิง html5-qrcode scanner เพื่อให้หยุดกล้องได้ถูกต้อง
let activeCameraScanner = null;

// ===========================================================
// 1. สร้าง QR Code ส่งการ์ด (ใช้ร่วมกันทั้งสองโหมด)
// ===========================================================
export function renderCreateQRView(phoneScreen, cardId, senderId, onBack) {
    const modeNote = CONFIG.useFirebase
        ? 'QR Code นี้สแกนได้จากอุปกรณ์อื่นที่เปิดแอปอยู่ในขณะนี้'
        : 'ลิงก์สแกนนี้ใช้งานได้เฉพาะเบราว์เซอร์หน้านี้ (โหมดจำลอง)';

    phoneScreen.innerHTML = `
        <div class="app-shell">
            <div class="app-header">
                <div class="back-header" id="qr-back-btn">
                    <i class="fa-solid fa-chevron-left"></i> กลับไปคอลเลกชัน
                </div>
            </div>
            <div class="app-body" style="padding-bottom:20px">
                <div class="trade-view">
                    <h3 style="font-family:var(--font-cute);color:#e8590c">ส่งการ์ดแลกเปลี่ยน</h3>
                    <p class="trade-info">ให้ผู้รับการ์ดกด สแกนรับการ์ด แล้วสแกน QR Code นี้</p>
                    <div class="qr-code-box"><div id="qrcode-canvas"></div></div>
                    <div style="background:white;padding:12px;border-radius:12px;width:100%;border:1px dashed #ffd8a8;font-size:0.8rem;text-align:left">
                        <strong>รหัสอ้างอิง:</strong>
                        <div id="trade-id-val" style="font-family:monospace;word-break:break-all;margin-top:4px;font-weight:bold;color:var(--gray)">กำลังสร้าง...</div>
                    </div>
                    <div style="font-size:0.75rem;color:var(--gray);text-align:center;margin-top:10px">
                        <i class="fa-solid fa-clock"></i> ${modeNote}
                    </div>
                </div>
            </div>
        </div>`;

    document.getElementById('qr-back-btn').onclick = onBack;

    const tradeId = createTradeOffer(cardId, senderId);
    if (!tradeId) { alert('ไม่สามารถสร้างข้อเสนอแลกเปลี่ยนได้'); onBack(); return; }
    document.getElementById('trade-id-val').innerText = tradeId;

    setTimeout(() => {
        const el = document.getElementById('qrcode-canvas');
        if (el && typeof QRCode !== 'undefined') {
            el.innerHTML = '';
            new QRCode(el, { text: tradeId, width: 200, height: 200, colorDark: '#212529', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
        }
    }, 100);
}

// ===========================================================
// 2. สแกนรับการ์ด — แยกโหมดจำลองและโหมดกล้องจริง
// ===========================================================
export function renderScanView(phoneScreen, receiverId, onScanSuccess, onBack) {
    if (CONFIG.useFirebase) {
        _renderRealCameraView(phoneScreen, receiverId, onScanSuccess, onBack);
    } else {
        _renderSimView(phoneScreen, receiverId, onScanSuccess, onBack);
    }
}

// --- โหมดจำลอง ---
function _renderSimView(phoneScreen, receiverId, onScanSuccess, onBack) {
    phoneScreen.innerHTML = `
        <div class="app-shell">
            <div class="app-header">
                <div class="back-header" id="scan-back-btn">
                    <i class="fa-solid fa-chevron-left"></i> ย้อนกลับ
                </div>
            </div>
            <div class="app-body" style="padding-bottom:20px">
                <div class="scan-page">
                    <h3 style="font-family:var(--font-cute);color:var(--primary-dark)">สแกนรับการ์ดการบ้าน</h3>
                    <p class="trade-info" style="font-size:0.8rem">สแกน QR Code จากโทรศัพท์ของเพื่อนเพื่อโอนการ์ด</p>
                    <div class="camera-preview-sim">
                        <div class="scan-laser"></div>
                        <div style="z-index:5;text-align:center;padding:20px">
                            <i class="fa-solid fa-camera" style="font-size:2.5rem;opacity:0.8;margin-bottom:10px"></i>
                            <p style="font-size:0.8rem">กล้องจำลองพร้อมใช้งาน</p>
                            <p style="font-size:0.7rem;opacity:0.7">(โหมดจำลอง — ใช้รายการด้านล่างแทน)</p>
                        </div>
                    </div>
                    <div style="width:100%;text-align:left;margin-top:10px">
                        <h4 style="font-size:0.85rem;margin-bottom:8px;color:var(--dark)">
                            <i class="fa-solid fa-tower-broadcast" style="color:var(--success)"></i>
                            สัญญาณเทรดที่พบใกล้เคียง:
                        </h4>
                        <div class="active-trades-list" id="active-trades-list"></div>
                    </div>
                </div>
            </div>
        </div>`;

    document.getElementById('scan-back-btn').onclick = onBack;
    _populateTradesList(receiverId, onScanSuccess);
}

// --- โหมดกล้องจริง (Production) ---
function _renderRealCameraView(phoneScreen, receiverId, onScanSuccess, onBack) {
    phoneScreen.innerHTML = `
        <div class="app-shell">
            <div class="app-header">
                <div class="back-header" id="scan-back-btn">
                    <i class="fa-solid fa-chevron-left"></i> ย้อนกลับ
                </div>
            </div>
            <div class="app-body" style="padding-bottom:20px">
                <div class="scan-page">
                    <h3 style="font-family:var(--font-cute);color:var(--primary-dark)">สแกนรับการ์ดการบ้าน</h3>
                    <p class="trade-info" style="font-size:0.8rem">ส่องกล้องไปที่ QR Code ของเพื่อนเพื่อรับการ์ด</p>
                    <div id="real-camera-reader" style="width:100%;border-radius:12px;overflow:hidden"></div>
                    <div style="display:flex;gap:10px;width:100%">
                        <button class="use-card-btn" id="flip-camera-btn"
                            style="flex:1;margin:0;background:var(--primary-light);color:var(--primary-dark);border-color:var(--primary)">
                            <i class="fa-solid fa-rotate"></i> พลิกกล้อง
                        </button>
                    </div>
                    <p style="font-size:0.75rem;color:var(--gray);text-align:center">
                        <i class="fa-solid fa-shield-halved"></i> ระบบจะขออนุญาตใช้กล้องจากเบราว์เซอร์ก่อน
                    </p>
                </div>
            </div>
        </div>`;

    _stopCamera();
    document.getElementById('scan-back-btn').onclick = () => { _stopCamera(); onBack(); };

    if (typeof Html5QrcodeScanner !== 'undefined') {
        _startCamera('real-camera-reader', receiverId, onScanSuccess, false);
        let front = false;
        document.getElementById('flip-camera-btn').onclick = () => {
            _stopCamera(); front = !front;
            _startCamera('real-camera-reader', receiverId, onScanSuccess, front);
        };
    } else {
        document.getElementById('real-camera-reader').innerHTML =
            '<div style="padding:20px;text-align:center;color:var(--danger);background:var(--danger-light);border-radius:12px">'
            + '<i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:10px"></i>'
            + '<p>ไม่พบไลบรารีสแกนกล้อง กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</p></div>';
    }
}

function _startCamera(elId, receiverId, onScanSuccess, front) {
    activeCameraScanner = new Html5QrcodeScanner(elId, {
        fps: 10, qrbox: { width: 250, height: 250 },
        videoConstraints: { facingMode: front ? 'user' : 'environment' }
    });
    activeCameraScanner.render(
        (text) => { _stopCamera(); _showConfirmModal(text, receiverId, onScanSuccess); },
        () => {}
    );
}

function _stopCamera() {
    if (activeCameraScanner) { activeCameraScanner.clear().catch(() => {}); activeCameraScanner = null; }
}

// ===========================================================
// 3. รายการข้อเสนอแลกเปลี่ยน (โหมดจำลอง)
// ===========================================================
function _populateTradesList(receiverId, onScanSuccess) {
    const db = loadDatabase();
    const el = document.getElementById('active-trades-list');
    if (!el) return;
    el.innerHTML = '';
    const offers = Object.values(db.activeTrades).filter(t => t.senderId !== receiverId);

    if (offers.length === 0) {
        el.innerHTML = '<div style="font-size:0.8rem;color:var(--gray);text-align:center;background:white;padding:15px;border-radius:8px;border:1px dashed var(--gray-light)">'
            + 'ยังไม่พบ QR Code การแลกเปลี่ยนในขณะนี้<br>'
            + '<span style="font-size:0.7rem">(สร้าง QR Code ที่หน้าการ์ดของนักเรียนอีกคน)</span></div>';
        return;
    }

    offers.forEach(trade => {
        const senderName = (db.users[trade.senderId] || { name: 'นักเรียนทั่วไป' }).name;
        const btn = document.createElement('button');
        btn.className = 'trade-item-btn';
        btn.innerHTML = '<div style="text-align:left">'
            + '<div style="font-weight:bold;color:#e8590c">' + trade.cardName + '</div>'
            + '<div style="font-size:0.7rem;color:var(--gray)">ส่งโดย: ' + senderName + '</div>'
            + '</div><span style="background:var(--success);color:white;padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:600">'
            + '<i class="fa-solid fa-qrcode"></i> คลิกสแกนรับ</span>';
        btn.onclick = () => _showConfirmModal(trade.id, receiverId, onScanSuccess);
        el.appendChild(btn);
    });
}

// ===========================================================
// 4. Modal ยืนยันการรับการ์ด (ใช้ร่วมกันทั้งสองโหมด)
// ===========================================================
function _showConfirmModal(tradeId, receiverId, onScanSuccess) {
    const trade = getTradeOffer(tradeId);
    if (!trade) { alert('ข้อเสนอนี้ไม่มีอยู่จริงหรือหมดเวลาแล้ว'); return; }

    const modal = document.getElementById('qr-trade-modal');
    const area  = document.getElementById('modal-trade-area');
    if (!modal || !area) return;

    const db = loadDatabase();
    const senderName = (db.users[trade.senderId] || { name: 'ไม่ระบุผู้ส่ง' }).name;

    area.innerHTML = '<div style="text-align:center;padding:10px">'
        + '<i class="fa-solid fa-handshake-angle" style="font-size:3rem;color:#ff922b;margin-bottom:12px"></i>'
        + '<h3 style="font-family:var(--font-cute);margin-bottom:6px;color:var(--primary-dark)">สแกนสำเร็จแล้ว!</h3>'
        + '<p style="font-size:0.85rem;color:var(--gray);margin-bottom:15px">ยืนยันความประสงค์แลกเปลี่ยนรับการ์ดต่อไปนี้หรือไม่</p>'
        + '<div style="background:white;border:2px solid #fcc419;border-radius:12px;padding:14px;margin-bottom:20px;text-align:left">'
        + '<div style="font-weight:bold;color:#e8590c;font-size:1.05rem">🌟 ' + trade.cardName + '</div>'
        + '<div style="font-size:0.75rem;color:var(--gray);margin-top:4px">ผู้โอน: ' + senderName + ' (ID: ' + trade.senderId + ')</div>'
        + '</div>'
        + '<div style="display:flex;gap:10px">'
        + '<button class="login-btn" id="confirm-trade-btn" style="flex:1;margin:0;background:var(--success)">ยืนยันรับการ์ด</button>'
        + '<button class="reset-btn" id="cancel-trade-btn" style="flex:1;margin:0">ยกเลิก</button>'
        + '</div></div>';

    modal.classList.add('active');

    document.getElementById('confirm-trade-btn').onclick = () => {
        const res = acceptTradeOffer(tradeId, receiverId);
        modal.classList.remove('active');
        alert(res.message);
        if (res.success) onScanSuccess();
    };
    document.getElementById('cancel-trade-btn').onclick   = () => modal.classList.remove('active');
    document.getElementById('close-qr-modal-btn').onclick = () => modal.classList.remove('active');
}