// Kafomnak - Kids Section (Firebase Connected)
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

// Security Helpers
const obfuscate = (str) => btoa(unescape(encodeURIComponent(str)));
const deobfuscate = (str) => {
    try { return decodeURIComponent(escape(atob(str))); }
    catch (e) { return str; }
};

// Helper to translate Firebase errors
const translateError = (error) => {
    if (!error || !error.code) return error.message || 'حدث خطأ غير متوقع';
    const translations = {
        'auth/invalid-email': 'عنوان البريد الإلكتروني غير صحيح.',
        'auth/network-request-failed': 'خطأ في الاتصال بالشبكة.'
    };
    return translations[error.code] || error.message.replace('Firebase: ', '');
};

// DevTools Protection
document.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 'u' || e.key === 's' || e.key === 'i' || e.key === 'j')) e.preventDefault();
    if (e.key === 'F12') e.preventDefault();
});

// Initialize Firebase
let app, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized for Kids Section");
} catch (e) {
    console.error("Firebase init error:", e);
}

// Global State
let KIDS_CHANNELS = [];
let currentPlayer = null;
let hlsInstance = null;
let currentChannelId = null;
let currentServerIndex = 0;
let ADS = [];
let adSliderIntervals = {};

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
    initKidsPlatform();
});

function initKidsPlatform() {
    subscribeToKidsData();
    setupSmartTV();
    initStats();

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

// 2. Real-time Subscription
function subscribeToKidsData() {
    db.collection('kids_channels').onSnapshot(snapshot => {
        KIDS_CHANNELS = [];
        snapshot.forEach(doc => KIDS_CHANNELS.push(doc.data()));

        // Sort by order/id
        KIDS_CHANNELS.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        renderChannels();

        if (KIDS_CHANNELS.length > 0) {
            if (!currentChannelId) {
                selectChannel(KIDS_CHANNELS[0].id);
            } else {
                const exists = KIDS_CHANNELS.find(c => c.id === currentChannelId);
                if (!exists) selectChannel(KIDS_CHANNELS[0].id);
                else {
                    // Update server list if current channel changed
                    renderServers(exists);
                }
            }
        }
    }, err => console.error("Kids Channels Sync Error:", err));

    // 2. Advanced Ads
    db.collection('ads').onSnapshot(snapshot => {
        ADS = [];
        snapshot.forEach(doc => ADS.push({ id: doc.id, ...doc.data() }));
        renderAd();
    });

    // 3. Platform Settings (Title/Branding)
    db.collection('settings').doc('platform').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.siteTitle) {
                document.title = 'Kafomnak Kids | ' + data.siteTitle;
                const footerTitle = document.getElementById('footer-site-name');
                if (footerTitle) footerTitle.textContent = data.siteTitle;
            }
            const liveIndicator = document.querySelector('.live-indicator-on-screen');
            if (liveIndicator && data.statusText) {
                liveIndicator.innerHTML = `<div class="live-dot"></div> ${data.statusText}`;
            }
        }
    });

    // Set Dynamic Year
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function renderAd() {
    const container = document.getElementById('ad-container');
    if (!container) return;

    const activeAds = ADS.filter(ad => ad.active && (ad.target === 'all' || ad.target === 'kids'));

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
                    <img src="${firstItem.url}" alt="إعلان للأطفال">
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
        video.src = originalUrl;
    } else {
        fetch(originalUrl)
            .then(res => res.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                video.src = blobUrl;
            })
            .catch(() => { video.src = originalUrl; });
    }
}

// --- PLATFORM STATS & PRESENCE ---
const sessionID = Date.now().toString() + Math.random().toString(36).substring(7);

function initStats() {
    // If the main app is authenticated (shared Firebase instance check)
    // In kids.js, auth might not be initialized, but we can check if firebase.auth().currentUser exists
    const adminUser = firebase.auth().currentUser;
    if (adminUser) {
        console.log("Admin detected in Kids Section - Stats tracking disabled.");
        return;
    }
    trackVisit();
    startHeartbeat();
}

function trackVisit() {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = `${now.getFullYear()}`;

    const batch = db.batch();
    batch.set(db.collection('stats').doc('global'), { total: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(db.collection('stats').doc('monthly'), { [monthKey]: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(db.collection('stats').doc('yearly'), { [yearKey]: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.commit().catch(e => console.error("Stats Error:", e));
}

function startHeartbeat() {
    const presenceRef = db.collection('presence').doc(sessionID);
    const pulse = () => presenceRef.set({ lastActive: firebase.firestore.Timestamp.now() }, { merge: true });
    pulse();
    setInterval(pulse, 30000);
    window.addEventListener('beforeunload', () => presenceRef.delete());
}

// 3. Render Channels
function renderChannels() {
    const list = document.getElementById('channel-list');
    if (!list) return;
    list.innerHTML = KIDS_CHANNELS.map(ch => `
        <button class="channel-btn ${ch.id === currentChannelId ? 'active' : ''}" 
                onclick="selectChannel(${ch.id}, this)">
            ${ch.name}
        </button>
    `).join('');
}

// 4. Select Channel
function selectChannel(id, btn) {
    currentChannelId = id;
    currentServerIndex = 0;

    // UI Feedback
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
        const target = Array.from(document.querySelectorAll('.channel-btn')).find(b => b.getAttribute('onclick').includes(id));
        if (target) target.classList.add('active');
    }

    const channel = KIDS_CHANNELS.find(c => c.id === id);
    if (channel) {
        renderServers(channel);
        loadStream(channel.servers[0].url, channel.servers[0].audioUrl || "", channel.servers[0].type || "hls");

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

// 5. Render Servers
function renderServers(channel) {
    const container = document.getElementById('server-switcher');
    const noteContainer = document.getElementById('channel-note-display');
    if (!container || !channel || !channel.servers || channel.servers.length <= 1) {
        if (container) container.innerHTML = '';
        if (noteContainer) noteContainer.innerHTML = '';
        return;
    }

    container.innerHTML = channel.servers.map((srv, idx) => `
        <button class="server-btn ${idx === currentServerIndex ? 'active' : ''}" 
                onclick="switchServer(${idx})">
            ${srv.name || `سيرفر ${idx + 1}`}
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

// 6. Switch Server
function switchServer(index) {
    currentServerIndex = index;
    const channel = KIDS_CHANNELS.find(c => c.id === currentChannelId);
    if (channel && channel.servers[index]) {
        renderServers(channel);
        loadStream(channel.servers[index].url, channel.servers[index].audioUrl || "", channel.servers[index].type || "hls");

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

// 7. Universal Stream Loader
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

        currentPlayer.on('ready', () => {
            currentPlayer.play().catch(() => { });
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
        video.muted = true;
        video.controls = true;
        video.crossOrigin = 'anonymous';
        container.appendChild(video);

        currentPlayer = new Plyr(video, getPlyrConfig());
        handleOrientation(currentPlayer);
        injectBranding();

        if (isHls && Hls.isSupported()) {
            hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
            hlsInstance.loadSource(sourceUrl);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
        } else {
            video.src = sourceUrl;
            video.load();
            video.play().catch(() => { });
        }
    }
}

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function getPlyrConfig() {
    return {
        autoplay: true,
        muted: true,
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
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
            <span>كفومنك</span>
        `;

        const volume = controls.querySelector('.plyr__volume');
        if (volume) volume.parentNode.insertBefore(branding, volume);
        else controls.appendChild(branding);
    }, 500);
}

function setupSmartTV() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('webos')) document.body.classList.add('tv-optimized');
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

// Support Modal Functions
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

    const subject = encodeURIComponent(`رسالة من ${name} - قسم الأطفال`);
    const body = encodeURIComponent(`الاسم: ${name}\nالبريد: ${email}\n\nالرسالة:\n${message}`);
    const supportEmail = "saifpsx@gmail.com";

    // Open email client in new window/tab
    const mailtoLink = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
    window.open(mailtoLink, '_self');

    // Reset form
    setTimeout(() => {
        document.getElementById('support-contact-form').reset();
    }, 100);
}

function closeModal(event, modalId) {
    if (event.target.id === modalId) document.getElementById(modalId).style.display = 'none';
}

function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
