// movies.js - Cinematic Library Logic

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
let app, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized for Movies");
} catch (e) {
    console.error("Firebase init error:", e);
}

// Security Helper
const deobfuscate = (str) => {
    try {
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        return str;
    }
};

let MOVIES = [];
let hlsInstance = null;
let currentPlayer = null;

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    subscribeToMoviesData();
    setupSmartTV();

    // Auto-update footer year
    const footerYear = document.getElementById('footer-year');
    if (footerYear) {
        footerYear.textContent = new Date().getFullYear();
    }

    // Auto-hide alert
    const alertBox = document.querySelector('.info-alert');
    if (alertBox) {
        setTimeout(() => {
            alertBox.style.opacity = '0';
            setTimeout(() => alertBox.remove(), 1000);
        }, 5000);
    }
});

// 2. Real-time Subscription
function subscribeToMoviesData() {
    db.collection('movies').onSnapshot(snapshot => {
        MOVIES = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = data.id || doc.id; // Use existing id or document id
            MOVIES.push(data);
        });

        // Sort by order/id
        MOVIES.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        renderMoviesList();
        updateGenreDropdown();

        if (MOVIES.length > 0) {
            // Data loaded
        }
    }, err => console.error("Movies Sync Error:", err));

    // Platform Settings (for Title)
    db.collection('settings').doc('platform').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.siteTitle) {
                document.title = 'أفلام ومسلسلات | ' + data.siteTitle;
            }
        }
    });
}

// 3. Render Movies & Series (Sliders) + Search
function renderMoviesList(listToRender = null) {
    // If listToRender is provided (Search Mode), show Grid
    // If listToRender is provided (Search Mode / See More Mode), show Grid
    if (listToRender) {
        document.getElementById('main-browsing-container').style.display = 'none';

        // Show generic grid container
        const gridContainer = document.getElementById('grid-view-container');
        if (gridContainer) gridContainer.style.display = 'block';

        const grid = document.getElementById('grid-view-content');
        if (grid) grid.innerHTML = listToRender.map(mov => createMovieCardHTML(mov)).join('');

        return;
    }

    // Default: Show Sliders
    document.getElementById('main-browsing-container').style.display = 'block';

    // Hide grid container
    const gridContainer = document.getElementById('grid-view-container');
    if (gridContainer) gridContainer.style.display = 'none';

    const movies = MOVIES.filter(m => m.type === 'movie');
    const series = MOVIES.filter(m => m.type === 'series');

    const activeSort = (a, b) => {
        const timeA = a.updatedAt || 0;
        const timeB = b.updatedAt || 0;
        return timeB - timeA;
    };

    // Latest Additions (Hero Slider - Top 7 movies+series)
    const latestAdditions = [...MOVIES].sort(activeSort).slice(0, 7);

    // Latest Episodes (Top 10 newest series by update time)
    const latestEpisodes = [...series].sort(activeSort).slice(0, 10);

    // Sorted Series and Movies for sliders
    const sortedSeries = [...series].sort(activeSort);
    const sortedMovies = [...movies].sort(activeSort);

    // Render Hero Slider
    const heroSlider = document.getElementById('hero-slider');
    if (heroSlider) {
        if (latestAdditions.length === 0) heroSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد إضافات حالياً</div>';
        else heroSlider.innerHTML = latestAdditions.map(mov => createHeroCardHTML(mov)).join('');
    }

    // Render Latest Episodes Slider
    const latestSlider = document.getElementById('latest-episodes-slider');
    if (latestSlider) {
        if (latestEpisodes.length === 0) latestSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">قريباً...</div>';
        else latestSlider.innerHTML = latestEpisodes.map(mov => createMovieCardHTML(mov)).join('');
    }

    // Render Series Slider
    const seriesSlider = document.getElementById('series-slider');
    if (seriesSlider) {
        if (sortedSeries.length === 0) seriesSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد مسلسلات حالياً</div>';
        else seriesSlider.innerHTML = sortedSeries.map(mov => createMovieCardHTML(mov)).join('');
    }

    // Render Movies Slider
    const moviesSlider = document.getElementById('movies-slider');
    if (moviesSlider) {
        if (sortedMovies.length === 0) moviesSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد أفلام حالياً</div>';
        else moviesSlider.innerHTML = sortedMovies.map(mov => createMovieCardHTML(mov)).join('');
    }

    // Start auto-sliders
    initAutoSliders();
}

function createMovieCardHTML(mov) {
    return `
        <div class="movie-card" onclick="openMovieModal(${mov.id})">
            ${mov.type === 'series' ? '<span class="movie-type-badge series">مسلسل</span>' : ''}
            <img src="${mov.image || 'assets/placeholder.jpg'}" class="movie-poster" alt="${mov.name}" loading="lazy" onerror="this.src='https://placehold.co/200x300/111/333?text=Kafomnak'">
            <div class="movie-info-overlay">
                <div class="movie-title">${mov.name}</div>
                <div class="movie-meta">${mov.note || ''}</div>
            </div>
        </div>
    `;
}

function createHeroCardHTML(mov) {
    const desc = mov.description ? mov.description.substring(0, 100) + '...' : 'لا يوجد وصف متاح لهذا العمل حالياً.';
    return `
        <div class="movie-card hero-card" onclick="openMovieModal(${mov.id})">
            ${mov.type === 'series' ? '<span class="movie-type-badge series">مسلسل</span>' : ''}
            <img src="${mov.image || 'assets/placeholder.jpg'}" class="movie-poster" alt="${mov.name}" loading="lazy" onerror="this.src='https://placehold.co/200x300/111/333?text=Kafomnak'">
            <div class="movie-info-overlay hero-overlay">
                <div class="movie-title hero-title-text">${mov.name}</div>
                <div class="movie-meta hero-description">${desc}</div>
                <div class="hero-play-tag">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    شاهد الآن
                </div>
            </div>
        </div>
    `;
}

function filterMovies() {
    const query = document.getElementById('movies-search').value.toLowerCase();
    const genre = document.getElementById('genre-filter').value;
    const type = document.getElementById('type-filter').value;

    if (!query && genre === 'all' && type === 'all') {
        closeGridView(); // Go back to main
        return;
    }

    // Update title for search results
    const gridTitle = document.getElementById('grid-view-title');
    if (gridTitle) gridTitle.textContent = 'نتائج البحث';

    const filtered = MOVIES.filter(m => {
        // Map type to Arabic for search
        const typeInArabic = m.type === 'movie' ? 'فيلم' : m.type === 'series' ? 'مسلسل' : '';

        const matchesQuery = !query ||
            m.name.toLowerCase().includes(query) ||
            (m.note && m.note.toLowerCase().includes(query)) ||
            (m.genre && m.genre.toLowerCase().includes(query)) ||
            typeInArabic.includes(query); // Search in type as well

        const matchesGenre = genre === 'all' || (m.genre && m.genre.includes(genre));
        const matchesType = type === 'all' || m.type === type;

        return matchesQuery && matchesGenre && matchesType;
    });

    renderMoviesList(filtered);
}

function updateGenreDropdown() {
    const select = document.getElementById('genre-filter');
    if (!select) return;

    const existingOptions = Array.from(select.options).map(opt => opt.value);
    const genres = new Set();

    MOVIES.forEach(m => {
        if (m.genre) {
            m.genre.split(/[،, ]+/).forEach(g => {
                if (g.trim()) genres.add(g.trim());
            });
        }
    });

    genres.forEach(g => {
        if (!existingOptions.includes(g)) {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            select.appendChild(opt);
        }
    });
}

// 4. Modal Logic
function openMovieModal(id) {
    console.log('openMovieModal called with id:', id);
    console.log('MOVIES array:', MOVIES);

    const movie = MOVIES.find(m => m.id === id);
    console.log('Found movie:', movie);

    if (!movie) {
        console.error('Movie not found with id:', id);
        return;
    }

    const modal = document.getElementById('movie-modal');
    if (!modal) {
        console.error('Modal element not found');
        return;
    }

    modal.querySelector('.modal-title').textContent = movie.name;
    modal.querySelector('.modal-meta').textContent = (movie.type === 'series' ? 'مسلسل' : 'فيلم') + (movie.note ? ' • ' + movie.note : '');
    modal.querySelector('.modal-movie-description').textContent = movie.description || 'لا يوجد وصف متاح.';

    // Servers list
    const grid = modal.querySelector('.servers-grid');
    grid.innerHTML = '';

    if (movie.servers && movie.servers.length > 0) {
        modal.querySelector('.modal-section-title').textContent = movie.type === 'series' ? 'الحلقات المتاحة' : 'سيرفرات المشاهدة';
        movie.servers.forEach((s, idx) => {
            const btn = document.createElement('button');
            btn.className = 'server-btn' + (idx === 0 ? ' active' : '');
            btn.textContent = movie.type === 'series' ? (s.name || `حلقة ${idx + 1}`) : (s.name || `سيرفر ${idx + 1}`);
            btn.onclick = () => {
                modal.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                initPlayer(s.url, s.audioUrl, s.type);
            };
            grid.appendChild(btn);
        });
        // Auto-play first server
        initPlayer(movie.servers[0].url, movie.servers[0].audioUrl, movie.servers[0].type);
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

function closeMovieModal() {
    const modal = document.getElementById('movie-modal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    if (currentPlayer) {
        currentPlayer.destroy();
        currentPlayer = null;
    }
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
    document.getElementById('player-container').innerHTML = '';
}

function initPlayer(url, audioUrl, type) {
    const container = document.getElementById('player-container');
    container.innerHTML = '';

    if (currentPlayer) currentPlayer.destroy();
    if (hlsInstance) hlsInstance.destroy();

    const indicator = document.querySelector('.live-indicator-on-screen');
    if (indicator) container.appendChild(indicator);

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
        injectBranding();
    } else {
        let sourceUrl = url;
        const isHls = url.toLowerCase().includes('.m3u8');

        const video = document.createElement('video');
        video.id = 'player';
        video.playsInline = true;
        video.autoplay = true;
        video.controls = true;
        video.crossOrigin = 'anonymous';
        container.appendChild(video);

        currentPlayer = new Plyr(video, getPlyrConfig());
        injectBranding();

        if (isHls && Hls.isSupported()) {
            hlsInstance = new Hls({ enableWorker: true });
            hlsInstance.loadSource(sourceUrl);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
        } else {
            video.src = sourceUrl;
            video.play().catch(() => { });
        }
    }
}

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function getPlyrConfig() {
    return {
        autoplay: true,
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
        i18n: { play: 'تشغيل', pause: 'إيقاف', mute: 'كتم', settings: 'الإعدادات' }
    };
}

function injectBranding() {
    setTimeout(() => {
        const controls = document.querySelector('.plyr__controls');
        if (!controls || document.querySelector('.plyr-branding')) return;
        const branding = document.createElement('div');
        branding.className = 'plyr-branding';
        branding.innerHTML = `<span>كفومنك</span>`;
        const volume = controls.querySelector('.plyr__volume');
        if (volume) volume.parentNode.insertBefore(branding, volume);
        else controls.appendChild(branding);
    }, 500);
}

function setupSmartTV() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('webos')) document.body.classList.add('tv-optimized');
}

// 8. Interactive Sliders
let sliderIntervals = {};

function moveSlider(sliderId, direction) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    const firstCard = slider.querySelector('.movie-card');
    if (!firstCard) return;

    const cardWidth = firstCard.offsetWidth + 15;
    const isRTL = getComputedStyle(slider).direction === 'rtl';
    const scrollPos = slider.scrollLeft;
    const maxScroll = slider.scrollWidth - slider.clientWidth;

    let isAtStart, isAtEnd;
    if (isRTL) {
        isAtStart = Math.abs(scrollPos) <= 15;
        isAtEnd = Math.abs(scrollPos) >= maxScroll - 15;
    } else {
        isAtStart = scrollPos <= 15;
        isAtEnd = scrollPos >= maxScroll - 15;
    }

    if (direction === 1 && isAtEnd) {
        slider.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === -1 && isAtStart) {
        slider.scrollTo({ left: isRTL ? -maxScroll : maxScroll, behavior: 'smooth' });
    } else {
        const amount = isRTL ? -direction * cardWidth : direction * cardWidth;
        slider.scrollBy({ left: amount, behavior: 'smooth' });
    }
}

function initAutoSliders() {
    Object.values(sliderIntervals).forEach(clearInterval);
    sliderIntervals = {};

    const sliders = ['hero-slider', 'latest-episodes-slider', 'series-slider', 'movies-slider'];
    sliders.forEach(id => {
        const slider = document.getElementById(id);
        if (!slider) return;
        const interval = setInterval(() => moveSlider(id, 1), 3000);
        sliderIntervals[id] = interval;
        slider.parentElement.onmouseenter = () => clearInterval(sliderIntervals[id]);
        slider.parentElement.onmouseleave = () => {
            sliderIntervals[id] = setInterval(() => moveSlider(id, 1), 3000);
        };
    });
}

// 9. See More Feature
function showCategory(type) {
    const activeSort = (a, b) => {
        const timeA = a.updatedAt || 0;
        const timeB = b.updatedAt || 0;
        return timeB - timeA;
    };

    const filtered = MOVIES.filter(m => m.type === type).sort(activeSort);

    // Update title
    const gridTitle = document.getElementById('grid-view-title');
    if (gridTitle) {
        gridTitle.textContent = type === 'series' ? 'جميع المسلسلات' : 'جميع الأفلام';
    }

    renderMoviesList(filtered);
}

function closeGridView() {
    // Reset Search Inputs if they were used
    document.getElementById('movies-search').value = '';
    document.getElementById('type-filter').value = 'all';
    document.getElementById('genre-filter').value = 'all';

    renderMoviesList(null);
}

// Make functions globally accessible
window.openMovieModal = openMovieModal;
window.closeMovieModal = closeMovieModal;
window.moveSlider = moveSlider;
window.showCategory = showCategory;
window.closeGridView = closeGridView;

// Support Modal
function showSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(event, modalId) {
    if (event.target.id === modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
}

// Make functions globally accessible
window.showSupportModal = showSupportModal;
window.closeModal = closeModal;
