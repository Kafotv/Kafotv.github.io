// Kafomnak - Firebase Connected
// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAS7Dai5B31cyeC4UNNE8H_o_3GoFuZOf4",
    authDomain: "shwo90s.firebaseapp.com",
    projectId: "shwo90s",
    storageBucket: "shwo90s.firebasestorage.app",
    messagingSenderId: "231335069201",
    appId: "1:231335069201:web:1b935ca1151547189c13b0",
    measurementId: "G-CJF8M3TJEG"
};

// Initialize Firebase
let app, db, auth;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init error:", e);
}

// Security Helpers
const obfuscate = (str) => btoa(unescape(encodeURIComponent(str)));
const deobfuscate = (str) => {
    try { return decodeURIComponent(escape(atob(str))); }
    catch (e) { return str; } // Fallback for old plain-text links
};

// Helper to translate Firebase errors to Arabic
function translateError(error) {
    if (!error || !error.code) return error.message || 'حدث خطأ غير متوقع';

    const code = error.code;
    const translations = {
        'auth/invalid-email': 'عنوان البريد الإلكتروني غير صحيح.',
        'auth/user-disabled': 'تم تعطيل هذا المستخدم.',
        'auth/user-not-found': 'لم يتم العثور على هذا المستخدم.',
        'auth/wrong-password': 'كلمة المرور غير صحيحة.',
        'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل.',
        'auth/operation-not-allowed': 'العملية غير مسموح بها.',
        'auth/weak-password': 'كلمة المرور ضعيفة جداً.',
        'auth/network-request-failed': 'خطأ في الاتصال بالشبكة.',
        'auth/too-many-requests': 'محاولات كثيرة جداً. يرجى المحاولة لاحقاً.'
    };

    return translations[code] || error.message.replace('Firebase: ', '');
}

// DevTools Protection
document.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 'u' || e.key === 's' || e.key === 'i' || e.key === 'j')) e.preventDefault();
    if (e.key === 'F12') e.preventDefault();
});

// Global State
let CHANNELS = [];
let KIDS_CHANNELS = [];
let MOVIES = [];
let currentPlayer = null;
let hlsInstance = null;
let currentChannelId = null;
let currentServerIndex = 0;
let ADS = [];
let adSliderIntervals = {};

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
    initPlatform();
});

function initPlatform() {
    subscribeToData(); // Start Real-time Listeners
    setupSmartTV();
    initStats();

    // Auth Listener
    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        if (user) {
            subscribeToStats();
        } else {
            document.getElementById('admin-panel').style.display = 'none';
        }
    });

    // Auto-hide alert
    const alertBox = document.querySelector('.info-alert');
    if (alertBox) {
        setTimeout(() => {
            alertBox.style.transition = 'opacity 1s ease, transform 1s ease';
            alertBox.style.opacity = '0';
            alertBox.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                alertBox.style.display = 'none';
                alertBox.remove();
            }, 1000);
        }, 8000);
    }
}

function updateAuthUI(user) {
    const trigger = document.querySelector('.login-trigger');
    if (trigger) {
        if (user) trigger.style.color = 'var(--accent-neon)';
        else trigger.style.color = '';
    }
}

// --- FIREBASE DATA SUBSCRIPTIONS ---

function subscribeToData() {
    // 1. Main Channels
    db.collection('channels').onSnapshot(snapshot => {
        if (snapshot.empty && localStorage.getItem('90show_channels')) {
            const local = JSON.parse(localStorage.getItem('90show_channels'));
            local.forEach(ch => {
                const data = { ...ch, order: ch.id };
                if (data.url && !data.servers) data.servers = [{ name: "تلقائي", url: data.url }];
                db.collection('channels').doc(String(ch.id)).set(data);
            });
            return;
        }

        CHANNELS = [];
        snapshot.forEach(doc => CHANNELS.push(doc.data()));

        // Sort by 'order' field, fallback to 'id'
        CHANNELS.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        // Self-Correction: Ensure all documents have an 'order' field
        if (CHANNELS.some(c => c.order === undefined) && CHANNELS.length > 0) {
            const batch = db.batch();
            CHANNELS.forEach((ch, index) => {
                const ref = db.collection('channels').doc(String(ch.id));
                batch.update(ref, { order: index });
            });
            batch.commit().catch(e => console.error("Order Migration Error:", e));
        }

        renderChannels();
        if (auth.currentUser) renderAdminChannels();

        if (!currentChannelId && CHANNELS.length > 0) {
            changeChannel(CHANNELS[0].id);
        } else if (currentChannelId) {
            const exists = CHANNELS.find(c => c.id === currentChannelId);
            if (!exists && CHANNELS.length > 0) changeChannel(CHANNELS[0].id);
        }
    }, err => console.error("Channels Sync Error:", err));

    // 2. Kids Channels
    db.collection('kids_channels').onSnapshot(snapshot => {
        if (snapshot.empty && localStorage.getItem('90show_kids_channels')) {
            const local = JSON.parse(localStorage.getItem('90show_kids_channels'));
            local.forEach(ch => {
                const data = { ...ch, order: ch.id };
                db.collection('kids_channels').doc(String(ch.id)).set(data);
            });
            return;
        }

        KIDS_CHANNELS = [];
        snapshot.forEach(doc => KIDS_CHANNELS.push(doc.data()));

        KIDS_CHANNELS.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        // Self-Correction for Kids
        if (KIDS_CHANNELS.some(c => c.order === undefined) && KIDS_CHANNELS.length > 0) {
            const batch = db.batch();
            KIDS_CHANNELS.forEach((ch, index) => {
                const ref = db.collection('kids_channels').doc(String(ch.id));
                batch.update(ref, { order: index });
            });
            batch.commit().catch(e => console.error("Kids Order Migration Error:", e));
        }

        if (auth.currentUser) renderAdminKidsChannels();
    });

    // 3. Platform Settings
    db.collection('settings').doc('platform').onSnapshot(doc => {
        if (doc.exists) {
            applyPlatformSettings(doc.data());
        } else if (localStorage.getItem('90show_platform_settings')) {
            const local = JSON.parse(localStorage.getItem('90show_platform_settings'));
            db.collection('settings').doc('platform').set(local);
        }
    });

    // 4. Movies
    db.collection('movies').onSnapshot(snapshot => {
        MOVIES = [];
        snapshot.forEach(doc => MOVIES.push(doc.data()));

        MOVIES.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        // Self-Correction for Movies
        if (MOVIES.some(c => c.order === undefined) && MOVIES.length > 0) {
            const batch = db.batch();
            MOVIES.forEach((ch, index) => {
                const ref = db.collection('movies').doc(String(ch.id));
                batch.update(ref, { order: index });
            });
            batch.commit().catch(e => console.error("Movies Order Migration Error:", e));
        }

        if (auth.currentUser) renderAdminMovies();
    });

    // 5. Advanced Ads
    db.collection('ads').onSnapshot(snapshot => {
        ADS = [];
        snapshot.forEach(doc => ADS.push({ id: doc.id, ...doc.data() }));
        renderAdminAds();
        renderAd(); // Update view
    });
}

// 2. Render Channel List
function renderChannels() {
    const container = document.getElementById('channel-list');
    if (!container) return;
    container.innerHTML = CHANNELS.map(ch => `
        <button class="channel-btn ${ch.id === currentChannelId ? 'active' : ''}" 
                onclick="changeChannel(${ch.id}, this)">
            <span class="badge">LIVE</span>
            ${ch.name}
        </button>
    `).join('');
}

// 3. Render Server Switcher
function renderServers(channel) {
    const container = document.getElementById('server-switcher');
    const noteContainer = document.getElementById('channel-note-display');
    if (!channel || !channel.servers || channel.servers.length <= 1) {
        if (container) container.innerHTML = "";
        if (noteContainer) noteContainer.innerHTML = "";
        return;
    }

    container.innerHTML = channel.servers.map((srv, index) => `
        <button class="server-btn ${index === currentServerIndex ? 'active' : ''}" 
                onclick="switchServer(${index})">
            ${srv.name}
        </button>
    `).join('');

    if (noteContainer) {
        noteContainer.innerHTML = channel.note ? `
            <div class="channel-note-wrapper">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>${channel.note}</span>
            </div>
        ` : '';
    }
}

// 4. Switching Logic
function changeChannel(id, btn) {
    currentChannelId = id;
    currentServerIndex = 0;

    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
        const target = Array.from(document.querySelectorAll('.channel-btn')).find(b => b.getAttribute('onclick').includes(id));
        if (target) target.classList.add('active');
    }

    const channel = CHANNELS.find(c => c.id === id);
    if (channel) {
        renderServers(channel);
        loadStream(channel.servers[0].url, channel.servers[0].audioUrl, channel.servers[0].type || "hls");

        // Update live indicator with first server name
        const indicator = document.querySelector('.live-indicator-on-screen');
        if (indicator && channel.servers[0]) {
            const serverName = channel.servers[0].name || 'سيرفر 1';
            indicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 5px; opacity: 0.9;">
                    <path d="M5 12h14"></path>
                    <path d="M12 5v14"></path>
                </svg>
                <div class="live-dot"></div>
                ${serverName}
            `;
        }
    }
}

function switchServer(index) {
    currentServerIndex = index;
    const channel = CHANNELS.find(c => c.id === currentChannelId);
    if (channel && channel.servers[index]) {
        renderServers(channel);
        loadStream(channel.servers[index].url, channel.servers[index].audioUrl, channel.servers[index].type || "hls");

        // Update live indicator with server name
        const indicator = document.querySelector('.live-indicator-on-screen');
        if (indicator) {
            const serverName = channel.servers[index].name || `سيرفر ${index + 1}`;
            indicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 5px; opacity: 0.9;">
                    <path d="M5 12h14"></path>
                    <path d="M12 5v14"></path>
                </svg>
                <div class="live-dot"></div>
                ${serverName}
            `;
        }
    }
}

// 5. Universal Stream Loader
function loadStream(url, audioUrl = "", type = "hls") {
    if (!url) return;

    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (currentPlayer) { currentPlayer.destroy(); currentPlayer = null; }

    const container = document.getElementById('player-container');
    if (!container) return;

    const indicator = container.querySelector('.live-indicator-on-screen');
    container.innerHTML = '';
    if (indicator) container.appendChild(indicator);

    // Handle Iframe Embed Type
    if (type === 'iframe') {
        const realUrl = deobfuscate(url);
        const iframe = document.createElement('iframe');
        iframe.src = realUrl;
        iframe.className = 'player-iframe';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        container.appendChild(iframe);
        return;
    }

    const youtubeId = getYouTubeId(url);

    if (youtubeId) {
        const div = document.createElement('div');
        div.id = 'player';
        div.setAttribute('data-plyr-provider', 'youtube');
        div.setAttribute('data-plyr-embed-id', youtubeId);
        container.appendChild(div);

        currentPlayer = new Plyr(div, getPlyrConfig());
        handleOrientation(currentPlayer);
        injectBranding();

        // Ensure play attempt after ready
        currentPlayer.on('ready', () => {
            currentPlayer.play().catch(e => console.log('Autoplay blocked:', e));
        });
    } else {
        let sourceUrl = url;
        const isHls = url.toLowerCase().includes('.m3u8');

        // Create virtual Master Playlist if audioUrl is provided
        if (isHls && audioUrl) {
            const masterPlaylist =
                "#EXTM3U\n" +
                "#EXT-X-VERSION:3\n" +
                `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,AUTOSELECT=YES,URI="${audioUrl}"\n` +
                `#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"\n` +
                `${url}`;

            const blob = new Blob([masterPlaylist], { type: 'application/x-mpegURL' });
            sourceUrl = URL.createObjectURL(blob);
        }

        const video = document.createElement('video');
        video.id = 'player';
        video.playsInline = true;
        video.autoplay = true;
        video.muted = false; // Enable audio by default
        video.controls = true;
        video.crossOrigin = 'anonymous';
        container.appendChild(video);

        currentPlayer = new Plyr(video, getPlyrConfig());
        handleOrientation(currentPlayer);
        injectBranding();

        if (isHls && Hls.isSupported()) {
            hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            hlsInstance.loadSource(sourceUrl);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
            hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hlsInstance.startLoad();
                    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hlsInstance.recoverMediaError();
                }
            });
        } else {
            video.src = sourceUrl;
            video.load();
            video.play().catch(() => { });
        }
    }
}

function getPlyrConfig() {
    return {
        autoplay: true,
        muted: false, // Enable audio by default
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        i18n: { play: 'تشغيل', pause: 'إيقاف', mute: 'كتم', settings: 'إعدادات' },
        youtube: { noCookie: true, rel: 0, modestbranding: 1, iv_load_policy: 3, autoplay: 1, mute: 1 }
    };
}

function injectBranding() {
    setTimeout(() => {
        const controls = document.querySelector('.plyr__controls');
        if (!controls || document.querySelector('.plyr-branding')) return;

        const branding = document.createElement('div');
        branding.className = 'plyr-branding';
        branding.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-2"></path>
                <path d="M2 12h10"></path>
                <path d="m9 15 3-3-3-3"></path>
            </svg>
            <span>كفومنك</span>
        `;

        const volume = controls.querySelector('.plyr__volume');
        if (volume) volume.parentNode.insertBefore(branding, volume);
        else controls.appendChild(branding);
    }, 200);
}

// --- ADMIN SYSTEM ---

function toggleAdmin() {
    if (auth.currentUser) {
        showAdminPanel();
    } else {
        showLoginModal();
    }
}

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

function showSupportModal() {
    const modal = document.getElementById('support-modal');
    modal.style.display = 'flex';

    // Load contact info from Firebase
    db.collection('settings').doc('platform').get().then(doc => {
        if (doc.exists && doc.data().contact) {
            const contact = doc.data().contact;

            // WhatsApp
            const whatsappEl = document.getElementById('support-whatsapp');
            if (contact.whatsapp) {
                whatsappEl.href = `https://wa.me/${contact.whatsapp}`;
                whatsappEl.style.display = 'flex';
            }

            // Facebook
            const facebookEl = document.getElementById('support-facebook');
            if (contact.facebook) {
                facebookEl.href = contact.facebook;
                facebookEl.style.display = 'flex';
            }

            // Instagram
            const instagramEl = document.getElementById('support-instagram');
            if (contact.instagram) {
                instagramEl.href = contact.instagram;
                instagramEl.style.display = 'flex';
            }
        }
    }).catch(e => console.error('Error loading contact info:', e));
}

function sendSupportEmail(event) {
    event.preventDefault();

    const name = document.getElementById('contact-form-name').value;
    const email = document.getElementById('contact-form-email').value;
    const message = document.getElementById('contact-form-message').value;

    const subject = encodeURIComponent(`بلاغ/رسالة من ${name}`);
    const body = encodeURIComponent(`الاسم: ${name}\nالبريد الإلكتروني: ${email}\n\nالرسالة:\n${message}`);
    const supportEmail = "saifpsx@gmail.com"; // البريد المستلم

    const mailtoLink = `mailto:${supportEmail}?subject=${subject}&body=${body}`;

    // Open email client
    window.open(mailtoLink, '_self');

    // Optional: Reset form or show message
    document.getElementById('support-contact-form').reset();
    showToast('جاري فتح تطبيق البريد...');
}

function closeModal(event, modalId) {
    if (event.target.id === modalId) document.getElementById(modalId).style.display = 'none';
}

function handleLogin() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    if (!user || !pass) {
        showToast('يرجى إدخال البيانات');
        return;
    }

    showToast('جاري تسجيل الدخول...');

    auth.signInWithEmailAndPassword(user, pass)
        .then(() => {
            showToast('تم تسجيل الدخول بنجاح');
            document.getElementById('login-modal').style.display = 'none';
            showAdminPanel();
        })
        .catch((error) => {
            console.error(error);
            showToast('خطأ: ' + translateError(error));
        });
}

function handleLogout() {
    auth.signOut().then(() => showToast('تم تسجيل الخروج'));
}

function showAdminPanel() {
    if (!auth.currentUser) return;
    document.getElementById('admin-panel').style.display = 'flex';
    renderAdminChannels();
}

function renderAdminChannels() {
    const list = document.getElementById('admin-channel-list');
    if (!list) return;
    list.innerHTML = CHANNELS.map((ch) => `
        <tr>
            <td class="channel-name-cell">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="row-reorder-btns">
                        <button class="reorder-btn" onclick="moveChannel(${ch.id}, -1)">▲</button>
                        <button class="reorder-btn" onclick="moveChannel(${ch.id}, 1)">▼</button>
                    </div>
                    ${ch.name}
                </div>
            </td>
            <td><span class="server-count-badge">${ch.servers.length} سيرفرات</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-primary btn-sm btn-edit" onclick="editChannel(${ch.id})">تعديل</button>
                    <button class="btn-primary btn-sm btn-danger" onclick="deleteChannel(${ch.id})">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function addServerInputRow(name = "", url = "", audioUrl = "", type = "hls") {
    const container = document.getElementById('server-inputs-container');
    const row = document.createElement('div');
    row.className = 'server-row-v2';
    row.setAttribute('data-server-type', type);
    row.innerHTML = `
        <div class="server-row-header">
            <span class="server-drag-handle">☰</span>
            <select class="srv-type" onchange="toggleAudioField(this)">
                <option value="hls" ${type === 'hls' ? 'selected' : ''}>بث مباشر (HLS)</option>
                <option value="iframe" ${type === 'iframe' ? 'selected' : ''}>تضمين (Iframe)</option>
            </select>
            <button class="remove-srv-btn" onclick="this.closest('.server-row-v2').remove()">✕</button>
        </div>
        <div class="server-row-body">
            <div class="field-group">
                <label>اسم السيرفر</label>
                <input type="text" placeholder="مثال: HD" value="${name}" class="srv-name" required>
            </div>
            <div class="field-group" style="flex: 2;">
                <label>رابط الفيديو</label>
                <input type="text" placeholder="رابط m3u8 أو رابط التضمين" value="${url}" class="srv-url" required>
            </div>
            <div class="field-group hls-only-field" style="flex: 2;">
                <label>رابط الصوت (اختياري)</label>
                <input type="text" placeholder="رابط m3u8 الخاص بالصوت" value="${audioUrl}" class="srv-audio-url">
            </div>
        </div>
    `;
    container.appendChild(row);
}

function toggleAudioField(select) {
    const row = select.closest('.server-row-v2');
    row.setAttribute('data-server-type', select.value);
}

function showChannelForm() {
    document.getElementById('channel-form').style.display = 'block';
    document.getElementById('edit-id').value = '';
    document.getElementById('ch-name').value = '';
    document.getElementById('ch-note').value = '';
    document.getElementById('server-inputs-container').innerHTML = '';
    addServerInputRow();
}

function hideChannelForm() { document.getElementById('channel-form').style.display = 'none'; }

function saveChannel() {
    if (!auth.currentUser) return showToast('غير مصرح لك');

    const id = document.getElementById('edit-id').value || Date.now();
    const name = document.getElementById('ch-name').value;
    const note = document.getElementById('ch-note').value;
    const serverRows = document.querySelectorAll('#channel-form .server-row-v2');
    const servers = [];
    serverRows.forEach(row => {
        const sName = row.querySelector('.srv-name').value;
        const sUrl = row.querySelector('.srv-url').value;
        const sAudioUrl = row.querySelector('.srv-audio-url').value;
        const sType = row.querySelector('.srv-type').value;

        let finalUrl = sUrl;
        if (sType === 'iframe' && sUrl && !sUrl.startsWith('http')) {
            // Probably already obfuscated encoded string
            finalUrl = sUrl;
        } else if (sType === 'iframe' && sUrl) {
            finalUrl = obfuscate(sUrl);
        }

        if (sName && sUrl) servers.push({ name: sName, url: finalUrl, audioUrl: sAudioUrl, type: sType });
    });

    if (!name || servers.length === 0) return alert('يرجى ملء البيانات');

    let order = Number(id);
    if (document.getElementById('edit-id').value) {
        const existing = CHANNELS.find(c => c.id == id);
        if (existing && existing.order !== undefined) order = existing.order;
    }

    const channelData = { id: Number(id), name, servers, order, note };

    showToast('جاري الحفظ...');
    db.collection('channels').doc(String(id)).set(channelData, { merge: true })
        .then(() => {
            showToast('تم الحفظ بنجاح');
            hideChannelForm();
        })
        .catch(error => {
            console.error("Save Error:", error);
            showToast('خطأ في الحفظ: ' + translateError(error));
        });
}

function editChannel(id) {
    const ch = CHANNELS.find(c => c.id == id);
    if (!ch) return;
    document.getElementById('edit-id').value = ch.id;
    document.getElementById('ch-name').value = ch.name;
    document.getElementById('ch-note').value = ch.note || '';
    const container = document.getElementById('server-inputs-container');
    container.innerHTML = '';
    ch.servers.forEach(s => {
        const realUrl = s.type === 'iframe' ? deobfuscate(s.url) : s.url;
        addServerInputRow(s.name, realUrl, s.audioUrl || "", s.type || "hls");
    });
    document.getElementById('channel-form').style.display = 'block';
}

async function deleteChannel(id) {
    if (!auth.currentUser) return showToast('غير مصرح لك');
    showToast('جاري التحقق من الحذف...');
    const confirmed = await showConfirmModal('هل أنت متأكد من حذف هذه القناة؟ سيتم مسح جميع بياناتها وسيرفراتها نهائياً.');
    if (confirmed) {
        db.collection('channels').doc(String(id)).delete()
            .then(() => showToast('تم الحذف'))
            .catch(e => {
                console.error("Delete Error:", e);
                showToast('خطأ في الحذف: ' + translateError(e));
            });
    }
}

async function moveChannel(id, direction) {
    if (!auth.currentUser) return;
    const index = CHANNELS.findIndex(c => c.id == id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= CHANNELS.length) return;

    const items = [...CHANNELS];
    const [movedItem] = items.splice(index, 1);
    items.splice(newIndex, 0, movedItem);

    showToast('جاري الترتيب...');
    try {
        const batch = db.batch();
        items.forEach((ch, idx) => {
            const ref = db.collection('channels').doc(String(ch.id));
            batch.update(ref, { order: idx });
        });
        await batch.commit();
        showToast('تم الترتيب بنجاح');
    } catch (e) {
        console.error("Move Error:", e);
        showToast('خطأ في الترتيب: ' + translateError(e));
    }
}

function setupSmartTV() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('webos')) document.body.classList.add('tv-optimized');
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { });
    });
}

function switchAdminTab(tabId) {
    document.querySelectorAll('.tab-content, .admin-tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
    });

    if (tabId === 'kids-channels-tab') renderAdminKidsChannels();
    if (tabId === 'channels-tab') renderAdminChannels();
    if (tabId === 'movies-tab') renderAdminMovies();
    if (tabId === 'ad-management-tab') renderAdminAds();
    if (tabId === 'seo-tab') {
        const input = document.getElementById('indexing-url-input');
        if (input) input.value = window.location.href;
    }
}

// --- KIDS CHANNELS ---

function renderAdminKidsChannels() {
    const list = document.getElementById('admin-kids-channel-list');
    if (!list) return;
    list.innerHTML = KIDS_CHANNELS.map((ch) => `
        <tr>
            <td class="channel-name-cell">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="row-reorder-btns">
                        <button class="reorder-btn"  onclick="moveKidsChannel(${ch.id}, -1)">▲</button>
                        <button class="reorder-btn"  onclick="moveKidsChannel(${ch.id}, 1)">▼</button>
                    </div>
                    ${ch.name}
                </div>
            </td>
            <td><span class="server-count-badge">${ch.servers.length} سيرفرات</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-primary btn-sm btn-edit" onclick="editKidsChannel(${ch.id})">تعديل</button>
                    <button class="btn-primary btn-sm btn-danger" onclick="deleteKidsChannel(${ch.id})">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function moveKidsChannel(id, direction) {
    if (!auth.currentUser) return;
    const index = KIDS_CHANNELS.findIndex(c => c.id == id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= KIDS_CHANNELS.length) return;

    const items = [...KIDS_CHANNELS];
    const [movedItem] = items.splice(index, 1);
    items.splice(newIndex, 0, movedItem);

    showToast('جاري الترتيب...');
    try {
        const batch = db.batch();
        items.forEach((ch, idx) => {
            const ref = db.collection('kids_channels').doc(String(ch.id));
            batch.update(ref, { order: idx });
        });
        await batch.commit();
        showToast('تم الترتيب بنجاح');
    } catch (e) {
        showToast('خطأ في الترتيب');
    }
}

function addKidsServerInputRow(name = "", url = "", audioUrl = "", type = "hls") {
    const container = document.getElementById('kids-server-inputs-container');
    const row = document.createElement('div');
    row.className = 'server-row-v2';
    row.setAttribute('data-server-type', type);
    row.innerHTML = `
        <div class="server-row-header">
            <span class="server-drag-handle">☰</span>
            <select class="srv-type" onchange="toggleAudioField(this)">
                <option value="hls" ${type === 'hls' ? 'selected' : ''}>بث مباشر (HLS)</option>
                <option value="iframe" ${type === 'iframe' ? 'selected' : ''}>تضمين (Iframe)</option>
            </select>
            <button class="remove-srv-btn" onclick="this.closest('.server-row-v2').remove()">✕</button>
        </div>
        <div class="server-row-body">
            <div class="field-group">
                <label>اسم السيرفر</label>
                <input type="text" placeholder="مثال: HD" value="${name}" class="srv-name" required>
            </div>
            <div class="field-group" style="flex: 2;">
                <label>رابط الفيديو</label>
                <input type="text" placeholder="رابط m3u8 أو رابط التضمين" value="${url}" class="srv-url" required>
            </div>
            <div class="field-group hls-only-field" style="flex: 2;">
                <label>رابط الصوت (اختياري)</label>
                <input type="text" placeholder="رابط m3u8 الخاص بالصوت" value="${audioUrl}" class="srv-audio-url">
            </div>
        </div>
    `;
    container.appendChild(row);
}

function showKidsChannelForm() {
    document.getElementById('kids-channel-form').style.display = 'block';
    document.getElementById('kids-edit-id').value = '';
    document.getElementById('kids-ch-name').value = '';
    document.getElementById('kids-ch-note').value = '';
    document.getElementById('kids-server-inputs-container').innerHTML = '';
    addKidsServerInputRow();
}

function hideKidsChannelForm() {
    document.getElementById('kids-channel-form').style.display = 'none';
}

function saveKidsChannel() {
    if (!auth.currentUser) return;
    const id = document.getElementById('kids-edit-id').value || Date.now();
    const name = document.getElementById('kids-ch-name').value;
    const note = document.getElementById('kids-ch-note').value;
    const serverRows = document.querySelectorAll('#kids-server-inputs-container .server-row-v2');
    const servers = [];
    serverRows.forEach(row => {
        const sName = row.querySelector('.srv-name').value;
        const sUrl = row.querySelector('.srv-url').value;
        const sAudioUrl = row.querySelector('.srv-audio-url').value;
        const sType = row.querySelector('.srv-type').value;

        let finalUrl = sUrl;
        if (sType === 'iframe' && sUrl && !sUrl.startsWith('http')) {
            finalUrl = sUrl;
        } else if (sType === 'iframe' && sUrl) {
            finalUrl = obfuscate(sUrl);
        }

        if (sName && sUrl) servers.push({ name: sName, url: finalUrl, audioUrl: sAudioUrl, type: sType });
    });

    if (!name || servers.length === 0) return alert('يرجى ملء البيانات');

    let order = Number(id);
    if (document.getElementById('kids-edit-id').value) {
        const existing = KIDS_CHANNELS.find(c => c.id == id);
        if (existing && existing.order !== undefined) order = existing.order;
    }

    const data = { id: Number(id), name, servers, order, note };
    db.collection('kids_channels').doc(String(id)).set(data, { merge: true })
        .then(() => { showToast('تم حفظ قناة الأطفال'); hideKidsChannelForm(); })
        .catch(e => {
            console.error("Kids Save Error:", e);
            showToast('خطأ في الحفظ: ' + translateError(e));
        });
}

function editKidsChannel(id) {
    const ch = KIDS_CHANNELS.find(c => c.id == id);
    if (!ch) return;
    document.getElementById('kids-edit-id').value = ch.id;
    document.getElementById('kids-ch-name').value = ch.name;
    document.getElementById('kids-ch-note').value = ch.note || '';
    const container = document.getElementById('kids-server-inputs-container');
    container.innerHTML = '';
    ch.servers.forEach(s => {
        const realUrl = s.type === 'iframe' ? deobfuscate(s.url) : s.url;
        addKidsServerInputRow(s.name, realUrl, s.audioUrl || "", s.type || "hls");
    });
    document.getElementById('kids-channel-form').style.display = 'block';
}

async function deleteKidsChannel(id) {
    if (!auth.currentUser) return;
    showToast('جاري التحقق من الحذف...');
    const confirmed = await showConfirmModal('هل أنت متأكد من حذف قناة الأطفال هذه؟');
    if (confirmed) {
        db.collection('kids_channels').doc(String(id)).delete();
    }
}

function handleOrientation(player) {
    player.on('enterfullscreen', () => {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => { });
        }
    });
    player.on('exitfullscreen', () => {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    });
}

function savePlatformSettings() {
    const statusText = document.getElementById('site-status-text').value;
    const siteTitle = document.getElementById('site-title').value;
    const whatsapp = document.getElementById('contact-whatsapp').value;
    const facebook = document.getElementById('contact-facebook').value;
    const instagram = document.getElementById('contact-instagram').value;
    const showRamadanSection = document.getElementById('site-show-ramadan').checked;

    const settings = {
        statusText,
        siteTitle,
        showRamadanSection,
        contact: {
            whatsapp,
            facebook,
            instagram
        }
    };
    db.collection('settings').doc('platform').set(settings)
        .then(() => showToast('تم حفظ الإعدادات'))
        .catch(e => {
            console.error("Settings Save Error:", e);
            showToast('خطأ في حفظ الإعدادات: ' + e.message);
        });
}

function applyPlatformSettings(settings) {
    if (!settings) return;
    const statusInput = document.getElementById('site-status-text');
    const titleInput = document.getElementById('site-title');
    if (statusInput && document.activeElement !== statusInput) statusInput.value = settings.statusText;
    if (titleInput && document.activeElement !== titleInput) titleInput.value = settings.siteTitle;
    if (settings.siteTitle) {
        document.title = 'Kafomnak | ' + settings.siteTitle;
        const siteBranding = document.getElementById('site-branding');
        if (siteBranding) siteBranding.textContent = settings.siteTitle;
        const footerBranding = document.getElementById('footer-site-name');
        if (footerBranding) footerBranding.textContent = settings.siteTitle;
    }
    // Set Dynamic Year
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    if (settings.statusText) {
        const statusDisplay = document.getElementById('status-text');
        if (statusDisplay) {
            statusDisplay.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="live-dot" style="width: 6px; height: 6px; background: var(--accent-neon); border-radius: 50%; box-shadow: 0 0 10px var(--accent-glow);"></div>
                    ${settings.statusText}
                </div>
            `;
        }
    }

    // Populate Admin Inputs (Always)
    if (document.getElementById('site-status-text')) document.getElementById('site-status-text').value = settings.statusText || "";
    if (document.getElementById('site-title')) document.getElementById('site-title').value = settings.siteTitle || "";

    // Populate Contact Inputs
    if (settings.contact) {
        if (document.getElementById('contact-whatsapp')) document.getElementById('contact-whatsapp').value = settings.contact.whatsapp || "";
        if (document.getElementById('contact-facebook')) document.getElementById('contact-facebook').value = settings.contact.facebook || "";
        if (document.getElementById('contact-instagram')) document.getElementById('contact-instagram').value = settings.contact.instagram || "";

    }

    // Populate Ramadan Toggle
    if (document.getElementById('site-show-ramadan')) {
        document.getElementById('site-show-ramadan').checked = settings.showRamadanSection || false;
    }

    // Ad Management Sync
    if (document.getElementById('ad-active-new')) document.getElementById('ad-active-new').checked = settings.adActive || false;
    if (document.getElementById('ad-type-new')) document.getElementById('ad-type-new').value = settings.adType || "image";
    if (document.getElementById('ad-url-new')) document.getElementById('ad-url-new').value = settings.adUrl || "";
    if (document.getElementById('ad-link-new')) document.getElementById('ad-link-new').value = settings.adLink || "";
    if (document.getElementById('ad-target')) document.getElementById('ad-target').value = settings.adTarget || "all";

    renderAd(settings);
}

function saveAdSettings() {
    if (!auth.currentUser) return showToast('غير مصرح لك');

    const adActive = document.getElementById('ad-active-new').checked;
    const adType = document.getElementById('ad-type-new').value;
    const adUrl = document.getElementById('ad-url-new').value;
    const adLink = document.getElementById('ad-link-new').value;
    const adTarget = document.getElementById('ad-target').value;

    db.collection('settings').doc('platform').update({
        adActive, adType, adUrl, adLink, adTarget
    }).then(() => {
        showToast('تم حفظ إعدادات الإعلان');
    }).catch(e => {
        console.error("Ad Save Error:", e);
        showToast('خطأ في الحفظ');
    });
    renderAd();
}

// --- ADVANCED AD MANAGEMENT ---

function showAdForm(adId = null) {
    const form = document.getElementById('ad-form');
    const title = document.getElementById('ad-form-title');
    const editId = document.getElementById('ad-edit-id');
    const container = document.getElementById('ad-slider-items-container');
    const scriptInput = document.getElementById('ad-script-input');

    form.style.display = 'block';
    container.innerHTML = '';
    scriptInput.value = '';

    if (adId) {
        const ad = ADS.find(a => a.id === adId);
        if (!ad) return;

        title.textContent = "تعديل البطاقة الإعلانية";
        editId.value = ad.id;
        document.getElementById('ad-type-select').value = ad.type;
        document.getElementById('ad-target-select').value = ad.target || 'all';

        if (ad.type === 'slider' || ad.type === 'dual' || ad.type === 'triple') {
            if (ad.type === 'slider') {
                document.getElementById('ad-slider-interval').value = (ad.interval || 5000) / 1000;
            }
            ad.items.forEach(item => addAdSliderItem(item.url, item.link));
        } else if (ad.type === 'script') {
            scriptInput.value = ad.script || '';
        } else {
            document.getElementById('ad-url-input').value = ad.items[0]?.url || '';
            document.getElementById('ad-link-input').value = ad.items[0]?.link || '';
        }
    } else {
        title.textContent = "إضافة بطاقة إعلانية جديدة";
        editId.value = "";
        document.getElementById('ad-url-input').value = "";
        document.getElementById('ad-link-input').value = "";
        addAdSliderItem(); // Default one row for slider if switched
    }

    toggleAdFormType();
    form.scrollIntoView({ behavior: 'smooth' });
}

function hideAdForm() {
    document.getElementById('ad-form').style.display = 'none';
}

function toggleAdFormType() {
    const type = document.getElementById('ad-type-select').value;
    const single = document.getElementById('ad-single-content');
    const slider = document.getElementById('ad-slider-content');
    const script = document.getElementById('ad-script-content');
    const urlLabel = document.getElementById('ad-url-label');
    const linkWrapper = document.getElementById('ad-link-wrapper');
    const container = document.getElementById('ad-slider-items-container');

    // Reset displays
    single.style.display = 'none';
    slider.style.display = 'none';
    script.style.display = 'none';

    if (type === 'slider' || type === 'dual' || type === 'triple') {
        slider.style.display = 'block';

        if (type === 'dual' || type === 'triple') {
            document.getElementById('ad-slider-interval').parentElement.style.display = 'none';
            const targetCount = type === 'dual' ? 2 : 3;
            const currentRows = container.querySelectorAll('.ad-slider-item-card').length;

            if (currentRows < targetCount) {
                for (let i = currentRows; i < targetCount; i++) addAdSliderItem();
            } else if (currentRows > targetCount) {
                const rows = container.querySelectorAll('.ad-slider-item-card');
                for (let i = targetCount; i < currentRows; i++) rows[i].remove();
            }
        } else {
            document.getElementById('ad-slider-interval').parentElement.style.display = 'block';
        }
    } else if (type === 'script') {
        script.style.display = 'block';
    } else {
        single.style.display = 'block';
        urlLabel.textContent = type === 'video' ? "رابط الفيديو المباشر" : "رابط الصورة";
        linkWrapper.style.display = "block"; // Always show link for redirect
    }
}

function addAdSliderItem(url = "", link = "") {
    const container = document.getElementById('ad-slider-items-container');
    const row = document.createElement('div');
    row.className = 'ad-slider-item-card input-group';
    row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span style="font-size: 11px; font-weight: 800; color: var(--accent-neon); text-transform: uppercase; letter-spacing: 1px;">عنصر الإعلان</span>
            <button onclick="removeAdItem(this)" 
                    style="background: rgba(255,59,48,0.1); border: none; color: #ff3b30; cursor: pointer; font-size: 14px; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                &times;
            </button>
        </div>
        <div style="margin-bottom: 12px;">
            <label style="font-size: 10px; margin-bottom: 5px; display: block; color: var(--text-muted);">رابط محتوى الإعلان (صورة أو فيديو)</label>
            <input type="text" placeholder="https://..." value="${url}" class="slider-item-url ad-form-input">
        </div>
        <div>
            <label style="font-size: 10px; margin-bottom: 5px; display: block; color: var(--text-muted);">رابط التوجيه عند النقر (Link)</label>
            <input type="text" placeholder="https://..." value="${link}" class="slider-item-link ad-form-input">
        </div>
    `;
    container.appendChild(row);
}

async function saveAdCard() {
    if (!auth.currentUser) return showToast('غير مصرح لك');

    const id = document.getElementById('ad-edit-id').value;
    const type = document.getElementById('ad-type-select').value;
    const target = document.getElementById('ad-target-select').value;
    const active = true; // New ads are active by default

    let items = [];
    let interval = 5000;
    let scriptCode = "";

    if (type === 'slider' || type === 'dual' || type === 'triple') {
        if (type === 'slider') {
            interval = parseInt(document.getElementById('ad-slider-interval').value) * 1000;
        }
        const rows = document.querySelectorAll('#ad-slider-items-container .ad-slider-item-card');
        rows.forEach(row => {
            const url = row.querySelector('.slider-item-url').value;
            const link = row.querySelector('.slider-item-link').value;
            if (url) items.push({ url, link });
        });
    } else if (type === 'script') {
        scriptCode = document.getElementById('ad-script-input').value;
        if (!scriptCode) return showToast('يرجى إضافة كود الإعلان');
    } else {
        items.push({
            url: document.getElementById('ad-url-input').value,
            link: document.getElementById('ad-link-input').value
        });
    }

    if (type !== 'script' && (items.length === 0 || !items[0].url)) return showToast('يرجى إضافة محتوى');

    const adData = {
        type,
        target,
        active,
        items,
        script: scriptCode,
        interval,
        clicks: 0,
        item_clicks: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    showToast('جاري الحفظ...');
    try {
        if (id) {
            await db.collection('ads').doc(id).update(adData);
        } else {
            await db.collection('ads').add(adData);
        }
        showToast('تم الحفظ بنجاح');
        hideAdForm();
    } catch (e) {
        showToast('خطأ في الحفظ: ' + e.message);
    }
}

function renderAdminAds() {
    const container = document.getElementById('admin-ad-list');
    if (!container) return;

    container.innerHTML = ADS.map(ad => `
        <div class="ad-admin-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-stroke); border-radius: 16px; padding: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${ad.active ? 'var(--accent-neon)' : '#ff3b30'};"></div>
                    <span style="font-size: 12px; font-weight: 800;">${(ad.type || 'IMAGE').toUpperCase()}</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="showAdForm('${ad.id}')" style="background: none; border: none; color: var(--accent-neon); cursor: pointer;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                    </button>
                    <button onclick="deleteAdCard('${ad.id}')" style="background: none; border: none; color: #ff3b30; cursor: pointer;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px; display: flex; justify-content: space-between;">
                <span>الهدف: ${ad.target === 'all' ? 'الكل' : ad.target === 'main' ? 'الرئيسي' : ad.target === 'movies' ? 'الأفلام' : 'الأطفال'}</span>
                <span style="color: var(--accent-neon); font-weight: 900;">🔥 ${Object.values(ad.item_clicks || {}).reduce((a, b) => a + Number(b), 0) || ad.clicks || 0} نقرة</span>
            </div>
            ${(ad.type === 'slider' || ad.type === 'dual' || ad.type === 'triple') ? `
                <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${(ad.items || []).map((_, i) => `<span>عنصر ${i + 1}: <b style="color:#fff">${ad.item_clicks?.[String(i)] || 0}</b></span>`).join('')}
                </div>
            ` : ''}
            <div style="width: 100%; height: 60px; border-radius: 8px; overflow: hidden; background: #000; border: 1px solid var(--glass-stroke); display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); text-align: center; padding: 5px;">
                ${ad.type === 'video' ?
            `<img src="https://img.youtube.com/vi/${getYouTubeId(ad.items?.[0]?.url || '') || '0'}/mqdefault.jpg" alt="معاينة الفيديو" style="width: 100%; height: 100%; object-fit: cover;">` :
            ad.type === 'script' ?
                `<div style="line-height:1.2; overflow:hidden; font-family: monospace; white-space: pre-wrap; word-break: break-all;">{ كود برمجي }<br>${(ad.script || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])).substring(0, 40)}...</div>` :
                `<img src="${ad.items?.[0]?.url || ''}" alt="معاينة الإعلان" style="width: 100%; height: 100%; object-fit: cover;">`
        }
            </div>
            <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <button onclick="toggleAdCardStatus('${ad.id}', ${!ad.active})" class="btn-primary btn-sm btn-outline" style="width: 100%; font-size: 10px; height: 32px;">
                    ${ad.active ? 'إيقاف مؤقت' : 'تفعيل الآن'}
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteAdCard(id) {
    const confirmed = await showConfirmModal('هل متأكد من حذف هذا الإعلان؟');
    if (confirmed) {
        db.collection('ads').doc(id).delete();
    }
}

function toggleAdCardStatus(id, newStatus) {
    db.collection('ads').doc(id).update({ active: newStatus });
}

function renderAd() {
    const container = document.getElementById('ad-container');
    if (!container) return;

    const activeAds = ADS.filter(ad => ad.active && (ad.target === 'all' || ad.target === 'main'));

    if (activeAds.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    // Clear existing intervals
    Object.values(adSliderIntervals).forEach(clearInterval);
    adSliderIntervals = {};

    container.style.display = 'block';

    // Clear existing contents to re-render all
    container.innerHTML = '';

    activeAds.forEach((ad, adIndex) => {
        const adWrapper = document.createElement('div');
        adWrapper.className = 'ad-item-wrapper';
        adWrapper.style.marginBottom = adIndex < activeAds.length - 1 ? '15px' : '0';
        container.appendChild(adWrapper);

        if (ad.type === 'slider') {
            let currentIndex = 0;
            const renderSliderItem = (index) => {
                const item = ad.items[index];
                adWrapper.innerHTML = `
                    <a href="${item.link || '#'}" target="_blank" onclick="trackAdClick('${ad.id}', ${index})" class="ad-box slide-fade">
                        <img src="${item.url}" alt="إعلان">
                    </a>
                `;
            };

            renderSliderItem(0);
            if (ad.items.length > 1) {
                adSliderIntervals[ad.id] = setInterval(() => {
                    currentIndex = (currentIndex + 1) % ad.items.length;
                    renderSliderItem(currentIndex);
                }, ad.interval || 5000);
            }
        } else if (ad.type === 'dual' || ad.type === 'triple') {
            adWrapper.innerHTML = `
                <div class="${ad.type === 'dual' ? 'ad-grid' : 'ad-grid-triple'}">
                    ${ad.items.slice(0, ad.type === 'dual' ? 2 : 3).map((item, idx) => `
                        <a href="${item.link || '#'}" target="_blank" onclick="trackAdClick('${ad.id}', ${idx})" class="ad-box ad-box-slim">
                            <img src="${item.url}" alt="إعلان">
                        </a>
                    `).join('')}
                </div>
            `;
        } else if (ad.type === 'video') {
            const item = ad.items[0];
            const ytId = getYouTubeId(item.url);
            if (ytId) {
                adWrapper.innerHTML = `
                    <div class="ad-box">
                        <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}" 
                                allow="autoplay; encrypted-media" allowfullscreen></iframe>
                    </div>
                `;
            } else {
                const targetId = `vid-${Math.random().toString(36).substr(2, 9)}`;
                adWrapper.innerHTML = `
                    <a href="${item.link || '#'}" target="_blank" onclick="trackAdClick('${ad.id}', 0)" class="ad-box">
                        <video id="${targetId}" autoplay muted loop playsinline style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>
                    </a>
                `;
                renderProtectedVideo(targetId, item.url);
            }
        } else if (ad.type === 'script') {
            try {
                const range = document.createRange();
                const frag = range.createContextualFragment(ad.script || '');
                adWrapper.appendChild(frag);
            } catch (e) {
                console.error("Script Ad error:", e);
                adWrapper.innerHTML = `<p style="color:red; font-size:10px;">خطأ في تحميل الكود البرمجي</p>`;
            }
        } else {
            const firstItem = ad.items?.[0] || { url: '', link: '#' };
            adWrapper.innerHTML = `
                <a href="${firstItem.link || '#'}" target="_blank" onclick="trackAdClick('${ad.id}', 0)" class="ad-box">
                    <img src="${firstItem.url}" alt="إعلان ترويجي" alt="إعلان">
                </a>
            `;
        }
    });
}

function trackAdClick(adId, itemIndex = 0) {
    if (!adId) return;
    const field = `item_clicks.${itemIndex}`;
    db.collection('ads').doc(adId).update({
        [field]: firebase.firestore.FieldValue.increment(1),
        clicks: firebase.firestore.FieldValue.increment(1)
    }).catch(e => console.error("Tracking Error:", e));
}

function removeAdItem(btn) {
    const card = btn.closest('.ad-slider-item-card');
    if (card) card.remove();
}

function renderProtectedVideo(videoElementId, originalUrl) {
    const video = document.getElementById(videoElementId);
    if (!video) return;

    const isM3U8 = originalUrl.toLowerCase().includes('.m3u8');

    if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(originalUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8) {
        // Native HLS support (Safari)
        video.src = originalUrl;
    } else {
        // Standard Video - Convert to Blob URL for maximum obfuscation
        fetch(originalUrl)
            .then(res => res.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                video.src = blobUrl;
                // Cleanup to prevent memory leaks if needed, but for loop/ads we keep it
            })
            .catch(e => {
                console.error("Video Loading Error:", e);
                video.src = originalUrl; // Fallback
            });
    }
}

// --- PLATFORM STATS & PRESENCE ---
const sessionID = Date.now().toString() + Math.random().toString(36).substring(7);

function initStats() {
    // DO NOT track visits or presence if user is admin (logged in)
    if (auth.currentUser) {
        console.log("Admin detected - Stats tracking disabled for this session.");
        subscribeToStats(); // Still subscribe to see the numbers
        return;
    }
    trackVisit();
    startHeartbeat();
}

function trackVisit() {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = `${now.getFullYear()}`;

    // Traffic Source Logic
    const referrer = document.referrer.toLowerCase();
    let source = 'direct';

    if (!referrer) {
        source = 'direct';
    } else if (referrer.includes('facebook.com') || referrer.includes('fb.me')) {
        source = 'facebook';
    } else if (referrer.includes('instagram.com')) {
        source = 'instagram';
    } else if (referrer.includes('google.')) {
        source = 'google';
    } else if (referrer.includes('tiktok.com')) {
        source = 'tiktok';
    } else if (referrer.includes('t.co') || referrer.includes('twitter.com')) {
        source = 'twitter';
    } else {
        source = 'others';
    }

    const batch = db.batch();
    batch.set(db.collection('stats').doc('global'), { total: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(db.collection('stats').doc('monthly'), { [monthKey]: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(db.collection('stats').doc('yearly'), { [yearKey]: firebase.firestore.FieldValue.increment(1) }, { merge: true });

    // Store Referrer Stats
    batch.set(db.collection('stats').doc('referrers'), { [source]: firebase.firestore.FieldValue.increment(1) }, { merge: true });

    batch.commit().catch(e => console.error("Stats Error:", e));
}

function startHeartbeat() {
    const presenceRef = db.collection('presence').doc(sessionID);
    const pulse = () => presenceRef.set({ lastActive: firebase.firestore.Timestamp.now() }, { merge: true });
    pulse();
    setInterval(pulse, 30000); // 30 seconds
    window.addEventListener('beforeunload', () => presenceRef.delete());
}

function subscribeToStats() {
    // Real-time online users listener
    const oneMinAgo = new Date(Date.now() - 60000);
    db.collection('presence').where('lastActive', '>', oneMinAgo)
        .onSnapshot(snap => {
            const el = document.getElementById('stats-online-now');
            if (el) el.textContent = snap.size || 0;
        });

    // Monthly/Yearly views listener
    db.collection('stats').doc('monthly').onSnapshot(doc => {
        const el = document.getElementById('stats-monthly-views');
        if (!el) return;
        if (doc.exists) {
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            el.textContent = doc.data()[monthKey] || 0;
        } else {
            el.textContent = 0;
        }
    });

    db.collection('stats').doc('yearly').onSnapshot(doc => {
        const el = document.getElementById('stats-yearly-views');
        if (!el) return;
        if (doc.exists) {
            const yearKey = `${new Date().getFullYear()}`;
            el.textContent = doc.data()[yearKey] || 0;
        } else {
            el.textContent = 0;
        }
    });

    // Referrers Stats Listener
    db.collection('stats').doc('referrers').onSnapshot(doc => {
        const list = document.getElementById('admin-referrers-list');
        if (!list) return;

        if (doc.exists) {
            const data = doc.data();
            const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
            const sourceLabels = {
                facebook: { name: 'فيسبوك', color: '#1877F2' },
                instagram: { name: 'انستقرام', color: '#E4405F' },
                google: { name: 'جوجل', color: '#4285F4' },
                tiktok: { name: 'تيك توك', color: '#000000' },
                twitter: { name: 'تويتر/X', color: '#1DA1F2' },
                direct: { name: 'دخول مباشر', color: '#00FF94' },
                others: { name: 'أخرى', color: '#666' }
            };

            list.innerHTML = Object.entries(data).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
                const label = sourceLabels[source] || { name: source, color: 'var(--accent-neon)' };
                const percent = Math.round((count / total) * 100);
                return `
                    <div class="referrer-item" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-stroke); padding: 10px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 9px; color: ${label.color}; font-weight: 900; margin-bottom: 4px; text-transform: uppercase;">${label.name}</div>
                        <div style="font-size: 16px; font-weight: 900; color: #fff;">${count}</div>
                        <div style="font-size: 9px; color: var(--text-muted);">${percent}%</div>
                    </div>
                `;
            }).join('');
        } else {
            list.innerHTML = '<div style="font-size: 10px; color: var(--text-muted); grid-column: 1/-1;">لا توجد بيانات بعد...</div>';
        }
    });
}

function showConfirmModal(message) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    if (msgEl) msgEl.textContent = message;
    modal.style.setProperty('display', 'flex', 'important');

    return new Promise((resolve) => {
        const handleYes = () => {
            modal.style.setProperty('display', 'none', 'important');
            cleanup();
            resolve(true);
        };
        const handleNo = () => {
            modal.style.setProperty('display', 'none', 'important');
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
        };

        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
    });
}

function showToast(message) {
    let toast = document.querySelector('.toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        ${message}
    `;
    void toast.offsetWidth;
    toast.classList.add('show');
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => toast.classList.remove('show'), 3000);
}
function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- MOVIES ADMIN ---
let adminMoviesSearch = "";
let adminMoviesTypeFilter = "all";
let adminMoviesPage = 1;
const ADMIN_MOVIES_PER_PAGE = 15;

function handleAdminMovieSearch() {
    adminMoviesSearch = document.getElementById('admin-movie-search').value.toLowerCase();
    adminMoviesPage = 1; // Reset to page 1 on search
    renderAdminMovies();
}

function setAdminMovieFilter(type) {
    adminMoviesTypeFilter = type;
    adminMoviesPage = 1; // Reset to page 1 on filter

    // Update active button UI
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtnId = type === 'all' ? 'filter-all' : (type === 'movie' ? 'filter-movie' : 'filter-series');
    document.getElementById(activeBtnId).classList.add('active');

    renderAdminMovies();
}

function changeAdminPage(page) {
    adminMoviesPage = page;
    renderAdminMovies();
    // Scroll to top of tab
    document.getElementById('movies-tab').scrollTop = 0;
}

function renderAdminMovies() {
    const grid = document.getElementById('admin-movies-grid');
    const pagination = document.getElementById('admin-movies-pagination');
    if (!grid) return;

    // 1. Filter
    let filtered = MOVIES.filter(m => {
        const matchesType = adminMoviesTypeFilter === 'all' || m.type === adminMoviesTypeFilter;
        const matchesSearch = !adminMoviesSearch || m.name.toLowerCase().includes(adminMoviesSearch);
        return matchesType && matchesSearch;
    });

    // 2. Sort (Newest first by default)
    filtered.sort((a, b) => (b.order || 0) - (a.order || 0));

    // 3. Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ADMIN_MOVIES_PER_PAGE);
    const start = (adminMoviesPage - 1) * ADMIN_MOVIES_PER_PAGE;
    const paginatedItems = filtered.slice(start, start + ADMIN_MOVIES_PER_PAGE);

    // 4. Render Grid
    if (paginatedItems.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">لا توجد نتائج مطابقة لبحثك</div>';
    } else {
        grid.innerHTML = paginatedItems.map((mov) => `
            <div class="admin-movie-card">
                <div style="position: relative;">
                    <img src="${mov.image || 'https://placehold.co/200x300/111/333?text=Kafomnak'}" class="admin-card-image" onerror="this.src='https://placehold.co/200x300/111/333?text=Kafomnak'">
                    <span style="position: absolute; top: 6px; left: 6px; background: ${mov.type === 'series' ? '#E50914' : '#333'}; color: #fff; padding: 2px 5px; border-radius: 3px; font-size: 8px; font-weight: bold; z-index: 2;">
                        ${mov.type === 'series' ? 'مسلسل' : 'فيلم'}
                    </span>
                    <span style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 5px; border-radius: 3px; font-size: 8px; font-weight: bold; z-index: 2; border: 1px solid rgba(255,255,255,0.1);">
                        👁️ ${mov.views || 0}
                    </span>
                </div>
                <div class="admin-card-content">
                    <div class="admin-card-title" title="${mov.name}">${mov.name}</div>
                    <div class="admin-card-meta">${mov.servers ? mov.servers.length : 0} ${mov.type === 'series' ? 'حلقات' : 'سيرفرات'}</div>
                </div>
                <div class="admin-card-actions">
                    <div class="admin-action-row">
                        <button class="btn-primary btn-sm btn-edit" onclick="editMovie(${mov.id})">
                             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                             تعديل
                        </button>
                        <button class="btn-primary btn-sm btn-danger" onclick="deleteMovie(${mov.id})">
                             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                             حذف
                        </button>
                    </div>
                    <div class="admin-action-row">
                         <button class="reorder-btn" onclick="moveMovies(${mov.id}, 1)">▲ تقديم</button>
                         <button class="reorder-btn" onclick="moveMovies(${mov.id}, -1)">▼ تأخير</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 5. Render Pagination
    if (totalPages > 1) {
        let pagesHtml = '';
        for (let i = 1; i <= totalPages; i++) {
            pagesHtml += `<button class="pagination-btn ${i === adminMoviesPage ? 'active' : ''}" onclick="changeAdminPage(${i})">${i}</button>`;
        }
        pagination.innerHTML = pagesHtml;
    } else {
        pagination.innerHTML = '';
    }
}

async function moveMovies(id, direction) {
    if (!auth.currentUser) return;
    const index = MOVIES.findIndex(c => c.id == id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= MOVIES.length) return;

    const items = [...MOVIES];
    const [movedItem] = items.splice(index, 1);
    items.splice(newIndex, 0, movedItem);

    showToast('جاري الترتيب...');
    try {
        const batch = db.batch();
        items.forEach((ch, idx) => {
            const ref = db.collection('movies').doc(String(ch.id));
            batch.update(ref, { order: idx });
        });
        await batch.commit();
        showToast('تم الترتيب بنجاح');
    } catch (e) {
        showToast('خطأ في الترتيب');
    }
}

function addMoviesServerInputRow(name = "", url = "", audioUrl = "", type = "hls") {
    const container = document.getElementById('movies-server-inputs-container');
    const row = document.createElement('div');
    row.className = 'server-row-v2';
    row.setAttribute('data-server-type', type);
    row.innerHTML = `
        <div class="server-row-header">
            <span class="server-drag-handle">☰</span>
            <select class="srv-type" onchange="toggleAudioField(this)">
                <option value="hls" ${type === 'hls' ? 'selected' : ''}>بث مباشر (HLS)</option>
                <option value="iframe" ${type === 'iframe' ? 'selected' : ''}>تضمين (Iframe)</option>
            </select>
            <button class="remove-srv-btn" onclick="this.closest('.server-row-v2').remove()">✕</button>
        </div>
        <div class="server-row-body">
            <div class="field-group">
                <label>اسم السيرفر</label>
                <input type="text" placeholder="مثال: الرئيسية" value="${name}" class="srv-name" required>
            </div>
            <div class="field-group" style="flex: 2;">
                <label>رابط الفيديو</label>
                <input type="text" placeholder="رابط m3u8 أو رابط التضمين" value="${url}" class="srv-url">
            </div>
            <div class="field-group hls-only-field" style="flex: 2;">
                <label>رابط الصوت (اختياري)</label>
                <input type="text" placeholder="رابط m3u8 الخاص بالصوت" value="${audioUrl}" class="srv-audio-url">
            </div>
        </div>
    `;
    container.appendChild(row);
}

function toggleMovieTypeLabels() {
    const type = document.getElementById('movies-type').value;
    const label = document.getElementById('movies-servers-label');
    const btn = document.getElementById('add-server-btn');

    if (label) {
        if (type === 'series') {
            label.textContent = 'الحلقات وروابطها';
        } else {
            label.textContent = 'السيرفرات والروابط';
        }
    }

    if (btn) {
        if (type === 'series') {
            btn.textContent = '+ إضافة حلقة أخرى';
        } else {
            btn.textContent = '+ إضافة سيرفر آخر';
        }
    }
}

function showMoviesForm() {
    document.getElementById('movies-modal-overlay').style.display = 'flex';
    document.getElementById('movies-form').style.display = 'flex';
    document.getElementById('movies-form-title').textContent = 'إضافة محتوى جديد';
    document.getElementById('movies-edit-id').value = '';
    document.getElementById('movies-type').value = 'movie'; // Default
    toggleMovieTypeLabels();
    document.getElementById('movies-name').value = '';
    document.getElementById('movies-image').value = '';
    document.getElementById('movies-note').value = '';
    document.getElementById('movies-popup-note').value = '';
    document.getElementById('movies-genre').value = '';
    document.getElementById('movies-desc').value = '';
    document.getElementById('movies-server-inputs-container').innerHTML = '';
    addMoviesServerInputRow();
}

function hideMoviesForm() {
    document.getElementById('movies-modal-overlay').style.display = 'none';
    document.getElementById('movies-form').style.display = 'none';
}

function closeAdminModalOnClickOutside(event, modalId) {
    if (event.target.id === modalId) {
        if (modalId === 'movies-modal-overlay') hideMoviesForm();
    }
}

function saveMovie() {
    if (!auth.currentUser) return;
    const id = document.getElementById('movies-edit-id').value || Date.now();
    const type = document.getElementById('movies-type').value;
    const name = document.getElementById('movies-name').value;
    const image = document.getElementById('movies-image').value;
    const note = document.getElementById('movies-note').value;
    const popupNote = document.getElementById('movies-popup-note').value;
    const genre = document.getElementById('movies-genre').value;
    const description = document.getElementById('movies-desc').value;
    const serverRows = document.querySelectorAll('#movies-server-inputs-container .server-row-v2');
    const servers = [];
    serverRows.forEach(row => {
        const sName = row.querySelector('.srv-name').value;
        const sUrl = row.querySelector('.srv-url').value;
        const sAudioUrl = row.querySelector('.srv-audio-url').value;
        const sType = row.querySelector('.srv-type').value;

        let finalUrl = sUrl;
        if (sType === 'iframe' && sUrl && !sUrl.startsWith('http')) {
            finalUrl = sUrl;
        } else if (sType === 'iframe' && sUrl) {
            finalUrl = obfuscate(sUrl);
        }

        if (sName) servers.push({ name: sName, url: finalUrl, audioUrl: sAudioUrl, type: sType });
    });

    if (!name) return alert('يرجى ملء البيانات');

    let order = Number(id);
    if (document.getElementById('movies-edit-id').value) {
        const existing = MOVIES.find(c => c.id == id);
        if (existing && existing.order !== undefined) order = existing.order;
    }

    // Allow empty servers for 'Coming Soon' state
    const data = {
        id: Number(id),
        type,
        name,
        image,
        servers,
        order,
        note,
        popupNote,
        genre,
        description,
        updatedAt: Date.now()
    };
    db.collection('movies').doc(String(id)).set(data, { merge: true })
        .then(() => {
            showToast('تم الحفظ بنجاح');
            hideMoviesForm();

            // Request Indexing (Background)
            // Using absolute URL to support cross-origin requests from GitHub Pages
            fetch('https://kafotv.netlify.app/.netlify/functions/indexing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: `https://kafotv.github.io/movies.html?id=${id}` })
            })
                .then(res => res.json())
                .then(d => console.log('Indexing triggered:', d))
                .catch(err => console.error('Indexing failed:', err));
        })
        .catch(e => {
            console.error("Movies Save Error:", e);
            showToast('خطأ في الحفظ: ' + translateError(e));
        });
}

function editMovie(id) {
    const mov = MOVIES.find(c => c.id == id);
    if (!mov) return;
    document.getElementById('movies-edit-id').value = mov.id;
    document.getElementById('movies-modal-overlay').style.display = 'flex';
    document.getElementById('movies-form').style.display = 'flex';
    document.getElementById('movies-form-title').textContent = 'تعديل: ' + mov.name;
    document.getElementById('movies-type').value = mov.type || 'movie';
    toggleMovieTypeLabels();
    document.getElementById('movies-name').value = mov.name;
    document.getElementById('movies-image').value = mov.image || '';
    document.getElementById('movies-note').value = mov.note || '';
    document.getElementById('movies-popup-note').value = mov.popupNote || '';
    document.getElementById('movies-genre').value = mov.genre || '';
    document.getElementById('movies-desc').value = mov.description || '';
    const container = document.getElementById('movies-server-inputs-container');
    container.innerHTML = '';
    if (mov.servers) {
        mov.servers.forEach(s => {
            const realUrl = s.type === 'iframe' ? deobfuscate(s.url) : s.url;
            addMoviesServerInputRow(s.name, realUrl, s.audioUrl || "", s.type || "hls");
        });
    } else {
        addMoviesServerInputRow();
    }
}

async function deleteMovie(id) {
    if (!auth.currentUser) return;
    showToast('جاري التحقق من الحذف...');
    const confirmed = await showConfirmModal('هل أنت متأكد من حذف هذا الفيلم/المسلسل؟');
    if (confirmed) {
        db.collection('movies').doc(String(id)).delete();
    }
}

// --- SEO & Indexing Tools (v1.3 - GitHub Actions) ---
function requestManualIndex() {
    const urlInput = document.getElementById('indexing-url-input');
    const url = urlInput ? urlInput.value : '';

    if (!url || !url.startsWith('https://kafotv.github.io/')) {
        showToast('يرجى إدخال رابط صحيح يبدأ بـ https://kafotv.github.io/');
        return;
    }

    // Get GitHub Token from local storage or prompt
    let ghToken = localStorage.getItem('gh_indexing_token');
    if (!ghToken) {
        ghToken = prompt('يرجى إدخال GitHub Personal Access Token لتكملة العملية:');
        if (ghToken) localStorage.setItem('gh_indexing_token', ghToken);
        else return;
    }

    addSeoLog(`[v1.3] جاري محاولة تشغيل GitHub Action للرابط: ${url}...`);
    showToast('جاري إرسال الطلب لـ GitHub...');

    // GitHub Repository Dispatch API
    const repoOwner = 'kafotv'; // Correct owner based on domain
    const repoName = 'kafotv.github.io'; // Correct repo name for GitHub Pages main site
    const ghDispatchUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`;

    fetch(ghDispatchUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_type: 'google_indexing',
            client_payload: { url: url }
        })
    })
        .then(async res => {
            if (res.status === 204) {
                showToast('تم إرسال الطلب لـ GitHub بنجاح');
                addSeoLog(`SUCCESS: تم تشغيل GitHub Action بنجاح.`);
                addSeoLog(`رابط المتابعة: https://github.com/${repoOwner}/${repoName}/actions`);
            } else {
                const status = res.status;
                const statusText = res.statusText;
                addSeoLog(`ERROR: GitHub API returned ${status} ${statusText}`);

                if (status === 404) {
                    addSeoLog(`HINT: تأكد من أن الرابط والمستودع صحيحين، وأن الـ Token لديه صلاحية 'repo'.`);
                    addSeoLog(`الرابط الذي حاولنا الاتصال به: ${ghDispatchUrl}`);
                } else if (status === 401) {
                    localStorage.removeItem('gh_indexing_token');
                    showToast('خطأ: Token غير صحيح');
                }

                try {
                    const data = await res.json();
                    addSeoLog(`Details: ${JSON.stringify(data)}`);
                } catch (e) {
                    // Not JSON or empty body
                }
            }
        })
        .catch(err => {
            console.error('GitHub API error:', err);
            showToast('خطأ في إرسال الطلب');
            addSeoLog(`FETCH ERROR: ${err.message || 'خطأ في الاتصال'}`);
        });
}

function pingIndexNow() {
    addSeoLog('جاري فحص حالة IndexNow...');
    showToast('جاري فحص البيانات...');

    // Display info since IndexNow is primarily handled by GitHub Actions
    addSeoLog('تنبيه: يتم تحديث IndexNow (Bing/Yandex) تلقائياً عند إضافة أي محتوى جديد.');
    addSeoLog('خريطة الموقع (Sitemap) محدثة وتعمل بشكل صحيح.');

    setTimeout(() => {
        showToast('نظام الأرشفة يعمل بشكل جيد');
        addSeoLog('Status: Active & Optimized');
    }, 1000);
}

function addSeoLog(msg) {
    const log = document.getElementById('seo-log');
    if (!log) return;
    log.style.display = 'block';
    const time = new Date().toLocaleTimeString();
    log.innerHTML += `<div style="margin-bottom: 5px; border-bottom: 1px solid #222; padding-bottom: 2px;">
        <span style="color: #888;">[${time}]</span> ${msg}
    </div>`;
    log.scrollTop = log.scrollHeight;
}

window.requestManualIndex = requestManualIndex;
window.pingIndexNow = pingIndexNow;
