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

if (!db) {
    console.error("CRITICAL: Firestore 'db' is not initialized. Rendering will not start.");
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
let currentFrontendPage = 1;
let currentFullList = [];
const MOVIES_PER_PAGE_FRONTEND = 21;
let renderTimeout = null;
let CONFIG_SHOW_RAMADAN = false;
let ADS = [];
let adSliderIntervals = {};

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

    initStats();
    handleDeepLink();
});

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.movieId) {
        openMovieModal(e.state.movieId, false); // false to avoid recursive pushState
    } else {
        closeMovieModal(false); // false to avoid recursive pushState
    }
});

function handleDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const movieId = urlParams.get('id');
    if (movieId) {
        // Wait for data to be ready
        const checkData = setInterval(() => {
            if (MOVIES.length > 0) {
                clearInterval(checkData);
                openMovieModal(movieId, false);
            }
        }, 100);
    }
}

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

        console.log(`Firestore Sync: Received ${MOVIES.length} movies/series`);
        updateGenreDropdown();

        // Debounce render to prevent multiple rapid DOM updates
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            console.log("Triggering debounced renderMoviesList...");
            renderMoviesList();
            initAutoSliders(); // Re-init sliders with new data if needed
        }, 250);
    }, err => console.error("Movies Sync Error:", err));

    // Platform Settings (for Title)
    db.collection('settings').doc('platform').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.siteTitle) {
                document.title = 'أفلام ومسلسلات | ' + data.siteTitle;
            }
            CONFIG_SHOW_RAMADAN = data.showRamadanSection || false;
            const ramadanSection = document.getElementById('ramadan-section');
            if (ramadanSection) {
                ramadanSection.style.display = CONFIG_SHOW_RAMADAN ? 'block' : 'none';
            }
            console.log("Ramadan Show Setting updated:", CONFIG_SHOW_RAMADAN);
            renderMoviesList(); // Re-render to show/hide Ramadan section
        }
    }, err => console.error("Platform Settings Sync Error:", err));

    // Ads Subscription
    db.collection('ads').onSnapshot(snapshot => {
        ADS = [];
        snapshot.forEach(doc => ADS.push({ id: doc.id, ...doc.data() }));
        renderAd();
    }, err => console.error("Ads Sync Error:", err));
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

        currentFullList = listToRender;
        const totalItems = currentFullList.length;
        const totalPages = Math.ceil(totalItems / MOVIES_PER_PAGE_FRONTEND);

        // Slice items
        const start = (currentFrontendPage - 1) * MOVIES_PER_PAGE_FRONTEND;
        const sliced = currentFullList.slice(start, start + MOVIES_PER_PAGE_FRONTEND);

        const grid = document.getElementById('grid-view-content');
        if (grid) {
            console.log(`Rendering grid with ${sliced.length} items...`);
            grid.innerHTML = sliced.map(mov => createMovieCardHTML(mov)).join('');
        }

        // Render Pagination
        const pagination = document.getElementById('frontend-pagination');
        if (pagination) {
            if (totalPages > 1) {
                let html = '';
                for (let i = 1; i <= totalPages; i++) {
                    html += `<button class="pagination-btn ${i === currentFrontendPage ? 'active' : ''}" onclick="changeFrontendPage(${i})">${i}</button>`;
                }
                pagination.innerHTML = html;
            } else {
                pagination.innerHTML = '';
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    // Default: Show Sliders
    const browsingContainer = document.getElementById('main-browsing-container');
    if (browsingContainer) browsingContainer.style.display = 'block';

    // Hide grid container
    const gridContainer = document.getElementById('grid-view-container');
    if (gridContainer) gridContainer.style.display = 'none';

    console.log("Rendering sliders with default content groups...");
    const movies = MOVIES.filter(m => m.type === 'movie');
    const series = MOVIES.filter(m => m.type === 'series');
    console.log(`Filtered: ${movies.length} movies, ${series.length} series`);

    const activeSort = (a, b) => {
        const timeA = a.updatedAt || 0;
        const timeB = b.updatedAt || 0;
        return timeB - timeA;
    };

    // Most Watched / Popular (Hero Slider - Automatic by Views)
    const latestAdditions = [...MOVIES]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 10); // Top 10 most watched

    // Sorted Series and Movies for sliders
    const sortedSeries = [...series].sort(activeSort);
    const sortedMovies = [...movies].sort(activeSort);

    // Ramadan Special Filter
    const ramadanContent = [...MOVIES].filter(m => {
        const keyword = "رمضان";
        const keywordEn = "ramadan";
        const text = (m.name + " " + (m.note || "") + " " + (m.genre || "")).toLowerCase();
        return text.includes(keyword) || text.includes(keywordEn);
    }).sort(activeSort);

    // Render Hero Slider
    const heroSlider = document.getElementById('hero-slider');
    if (heroSlider) {
        if (latestAdditions.length === 0) heroSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد إضافات حالياً</div>';
        else heroSlider.innerHTML = latestAdditions.slice(0, 15).map((mov, index) => createHeroCardHTML(mov, index)).join('');
    }

    // Render Ramadan Slider
    const ramadanSection = document.getElementById('ramadan-section');
    const ramadanSlider = document.getElementById('ramadan-slider');
    if (ramadanSlider && ramadanSection) {
        console.log("Checking Ramadan Visibility:", { content: ramadanContent.length, setting: CONFIG_SHOW_RAMADAN });
        if (ramadanContent.length > 0 && CONFIG_SHOW_RAMADAN) {
            ramadanSection.style.display = 'block';
            ramadanSlider.innerHTML = ramadanContent.slice(0, 20).map(mov => createMovieCardHTML(mov)).join('');
        } else {
            ramadanSection.style.display = 'none';
        }
    }

    // Render Latest Episodes Slider (Hidden/Removed per request)
    const latestSlider = document.getElementById('latest-episodes-slider');
    if (latestSlider) {
        latestSlider.style.display = 'none';
    }

    // Render Series Slider
    const seriesSlider = document.getElementById('series-slider');
    if (seriesSlider) {
        if (sortedSeries.length === 0) seriesSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد مسلسلات حالياً</div>';
        else seriesSlider.innerHTML = sortedSeries.slice(0, 20).map(mov => createMovieCardHTML(mov)).join('');
    }

    // Render Movies Slider
    const moviesSlider = document.getElementById('movies-slider');
    if (moviesSlider) {
        if (sortedMovies.length === 0) moviesSlider.innerHTML = '<div style="padding: 20px; color: #666; font-size: 12px;">لا توجد أفلام حالياً</div>';
        else moviesSlider.innerHTML = sortedMovies.slice(0, 20).map(mov => createMovieCardHTML(mov)).join('');
    }

    // Start auto-sliders
    initAutoSliders();
}

function createMovieCardHTML(mov) {
    const name = String(mov.name || 'بدون اسم');
    const note = String(mov.note || '');
    const movieUrl = `movies.html?id=${mov.id}`;
    return `
        <a href="${movieUrl}" class="movie-card" onclick="openMovieModal('${mov.id}'); return false;">
            <div class="movie-poster-wrapper">
                ${mov.type === 'series' ? '<span class="movie-type-badge series">مسلسل</span>' : ''}
                <img src="${mov.image || 'assets/placeholder.jpg'}" class="movie-poster" alt="${name}" loading="lazy" width="200" height="300" onerror="this.src='https://placehold.co/200x300/111/333?text=Kafomnak'">
            </div>
            <div class="movie-info-overlay">
                <div class="movie-title">${name}</div>
                <div class="movie-meta">${note}</div>
            </div>
        </a>
    `;
}

function createHeroCardHTML(mov, index = 0) {
    const name = String(mov.name || 'بدون اسم');
    const descText = String(mov.description || '');
    const desc = descText ? descText.substring(0, 100) + '...' : 'لا يوجد وصف متاح لهذا العمل حالياً.';
    const movieUrl = `movies.html?id=${mov.id}`;

    // Improve LCP: First item should load immediately
    const loadingAttr = index === 0 ? 'eager' : 'lazy';

    return `
        <a href="${movieUrl}" class="movie-card hero-card" onclick="openMovieModal('${mov.id}'); return false;">
            <div class="movie-poster-wrapper">
                ${mov.type === 'series' ? '<span class="movie-type-badge series">مسلسل</span>' : ''}
                <span class="movie-type-badge special">مميز</span>
                <img src="${mov.image || 'assets/placeholder.jpg'}" class="movie-poster" alt="${name}" loading="${loadingAttr}" width="400" height="225" onerror="this.src='https://placehold.co/200x300/111/333?text=Kafomnak'">
                
                <div class="movie-info-overlay hero-overlay">
                    <div class="movie-title hero-title-text">${name}</div>
                    <div class="movie-meta hero-description">${desc}</div>
                    <div class="hero-play-tag">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        شاهد الآن
                    </div>
                </div>
            </div>
        </a>
    `;
}

function filterMovies() {
    const query = document.getElementById('movies-search').value.toLowerCase();
    const genre = document.getElementById('genre-filter').value;
    const type = document.getElementById('type-filter').value;

    if (!query && genre === 'all' && type === 'all') {
        currentFrontendPage = 1;
        closeGridView(); // Go back to main
        return;
    }

    currentFrontendPage = 1;

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
            String(m.genre).split(/[،, ]+/).forEach(g => {
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
function openMovieModal(id, updateUrl = true) {
    if (updateUrl) {
        const movie = MOVIES.find(m => String(m.id) === String(id));
        const title = movie ? movie.name : 'مشاهدة';
        const newUrl = window.location.pathname + '?id=' + id;
        history.pushState({ movieId: id }, title, newUrl);
        if (movie) {
            document.title = title + " | كفومنك";

            // Update Meta Description
            let metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.setAttribute('content', (movie.description || movie.name) + " - شاهد الآن على كفومنك.");
            }

            // Update Canonical
            let canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) {
                canonical.setAttribute('href', "https://kafotv.github.io" + newUrl);
            }
        }
    }

    // Increment view count in background
    if (id) {
        db.collection('movies').doc(String(id)).update({
            views: firebase.firestore.FieldValue.increment(1)
        }).catch(err => console.error("View count error:", err));
    }

    console.log('openMovieModal called with id:', id);
    // console.log('MOVIES array:', MOVIES);

    const movie = MOVIES.find(m => String(m.id) === String(id));
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

    // Dynamic SEO Updates
    const movieUrl = `https://kafotv.github.io/movies.html?id=${movie.id}`;
    const siteTitle = document.title.split('|')[1]?.trim() || 'كفومنك';

    document.title = `${movie.name} | ${siteTitle}`;

    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', movie.description || `شاهد ${movie.name} بجودة عالية على كفومنك`);

    const canonical = document.getElementById('canonical-link');
    if (canonical) canonical.setAttribute('href', movieUrl);

    // OG Tags
    const ogTitle = document.getElementById('og-title');
    const ogDesc = document.getElementById('og-description');
    const ogUrl = document.getElementById('og-url');
    if (ogTitle) ogTitle.setAttribute('content', movie.name);
    if (ogDesc) ogDesc.setAttribute('content', movie.description || '');
    if (ogUrl) ogUrl.setAttribute('content', movieUrl);

    // Servers list
    const grid = modal.querySelector('.servers-grid');
    grid.innerHTML = '';
    const playerContainer = document.getElementById('player-container');
    const serversSection = modal.querySelector('.movies-server-selection');

    if (movie.popupNote) {
        const noteContainer = modal.querySelector('#channel-note-display');
        if (noteContainer) {
            noteContainer.innerHTML = `
            <div class="channel-note-wrapper">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span>${movie.popupNote}</span>
            </div>
            `;
            noteContainer.style.display = 'block';
        }
    } else {
        const noteContainer = modal.querySelector('#channel-note-display');
        if (noteContainer) {
            noteContainer.innerHTML = '';
            noteContainer.style.display = 'none';
        }
    }

    if (movie.servers && movie.servers.length > 0) {
        playerContainer.style.display = 'block';
        serversSection.style.display = 'block';

        // Remove old placeholder if exists
        const oldPlaceholder = modal.querySelector('.coming-soon-placeholder');
        if (oldPlaceholder) oldPlaceholder.remove();
        modal.querySelector('.modal-section-title').textContent = movie.type === 'series' ? 'الحلقات المتاحة' : 'سيرفرات المشاهدة';
        movie.servers.forEach((s, idx) => {
            const btn = document.createElement('button');
            btn.className = 'server-btn' + (idx === 0 ? ' active' : '');
            btn.textContent = movie.type === 'series' ? (s.name || `حلقة ${idx + 1}`) : (s.name || `سيرفر ${idx + 1}`);
            btn.onclick = () => {
                modal.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                initPlayer(s.url, s.audioUrl, s.type, movie.type);
            };
            grid.appendChild(btn);
        });
        // Auto-play first server
        initPlayer(movie.servers[0].url, movie.servers[0].audioUrl, movie.servers[0].type, movie.type);
    } else {
        // Coming Soon State
        playerContainer.style.display = 'none';
        serversSection.style.display = 'none';

        // Check for existing placeholder to avoid duplicates
        if (!modal.querySelector('.coming-soon-placeholder')) {
            const placeholder = document.createElement('div');
            placeholder.className = 'coming-soon-placeholder';
            placeholder.innerHTML = `
                <div class="placeholder-bg" style="background-image: url('${movie.image}')"></div>
                <div class="placeholder-content">
                    <div class="coming-soon-badge">قريباً</div>
                    <div class="placeholder-icon">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <h2>انتظرونا في رمضان</h2>
                    <p>هذا العمل سيتم توفيره قريباً بجودة عالية</p>
                </div>
            `;
            // Insert below player-container
            modal.querySelector('.modal-content-wrapper').insertBefore(placeholder, modal.querySelector('#channel-note-display'));
        }
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

function closeMovieModal(updateUrl = true) {
    const modal = document.getElementById('movie-modal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    if (updateUrl) {
        history.pushState(null, 'أفلام ومسلسلات | كفومنك', window.location.pathname);

        // Restore SEO Metadata
        const siteTitle = 'كفومنك';
        document.title = 'أفلام ومسلسلات | ' + siteTitle;

        const metaDesc = document.getElementById('meta-description');
        if (metaDesc) metaDesc.setAttribute('content', 'شاهد أحدث الأفلام والمسلسلات العربية والتركية بجودة عالية HD. مكتبة ضخمة متجددة يومياً على كفومنك.');

        const canonical = document.getElementById('canonical-link');
        if (canonical) canonical.setAttribute('href', 'https://kafotv.github.io/movies.html');

        const ogTitle = document.getElementById('og-title');
        const ogDesc = document.getElementById('og-description');
        const ogUrl = document.getElementById('og-url');
        if (ogTitle) ogTitle.setAttribute('content', 'أفلام ومسلسلات كفومنك');
        if (ogDesc) ogDesc.setAttribute('content', 'سينما في منزلك. أحدث الأفلام والمسلسلات بجودة عالية.');
        if (ogUrl) ogUrl.setAttribute('content', 'https://kafotv.github.io/movies.html');
    }

    // Cleanup placeholder
    const placeholder = modal.querySelector('.coming-soon-placeholder');
    if (placeholder) placeholder.remove();

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

function getRandomRecommendation(excludeId) {
    const list = MOVIES.filter(m => m.id !== excludeId && m.image);
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function showFinishedScreen(movieId) {
    const container = document.getElementById('player-container');
    if (!container) return;

    const rec = getRandomRecommendation(movieId);
    const currentMovie = MOVIES.find(m => m.id === movieId);
    const bgImage = currentMovie ? currentMovie.image : '';

    let recHtml = '';
    if (rec) {
        recHtml = `
            <div class="recommendation-card" onclick="openMovieModal(${rec.id})">
                <div class="rec-poster-container">
                    <img src="${rec.image}" class="rec-poster" alt="${rec.name}">
                    <div class="rec-play-overlay">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                </div>
                <div class="rec-info">
                    <span class="rec-label">نرشح لك للمشاهدة</span>
                    <div class="rec-name">${rec.name}</div>
                    <div class="rec-genre">${rec.genre || (rec.type === 'series' ? 'مسلسل' : 'فيلم')}</div>
                </div>
                <div class="rec-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            </div>
        `;
    }

    // Cleanup player
    if (currentPlayer) {
        currentPlayer.destroy();
        currentPlayer = null;
    }
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    container.innerHTML = `
        <div class="playback-finished-screen">
            <div class="finished-bg" style="background-image: url('${bgImage}')"></div>
            <div class="finished-overlay"></div>
            
            <div class="finished-content">
                <div class="finished-header">
                    <div class="finished-icon">🎉</div>
                    <h2 class="finished-title">نتمنى أن تكون قد استمتعت بالمشاهدة!</h2>
                    <p class="finished-subtitle">شكراً لثقتك بـ "كفومنك"، نتطلع لرؤيتك في المرة القادمة.</p>
                </div>
                
                ${recHtml}

                <div class="finished-actions">
                    <button class="btn-replay" onclick="openMovieModal(${movieId})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M23 4v6h-6"></path>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                        إعادة التشغيل
                    </button>
                    <button class="btn-replay btn-close-modal" onclick="closeMovieModal()">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
}

function initPlayer(url, audioUrl, type, category = 'movie') {
    const container = document.getElementById('player-container');
    if (!container) return;

    // "Coming Soon" Check: If no URL is provided
    if (!url || url.trim() === '') {
        const title = category === 'series' ? 'قريباً تضاف الحلقة' : 'قريباً يضاف السيرفر';
        const subTitle = category === 'series' ?
            'انتظرونا، نحن نعمل على توفير الحلقة بأعلى جودة ممكنة في أقرب وقت.' :
            'انتظرونا، نحن نعمل على توفير سيرفر مشاهدة جديد وثابت في أقرب وقت.';

        container.innerHTML = `
            <div class="episode-coming-soon">
                <div class="coming-soon-icon">
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </div>
                <h2>${title}</h2>
                <p>${subTitle}</p>
            </div>
        `;
        if (currentPlayer) currentPlayer.destroy();
        if (hlsInstance) hlsInstance.destroy();
        return;
    }

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

        // Playback Finished Listener
        currentPlayer.on('ended', () => {
            const currentMovie = MOVIES.find(m => m.servers.some(s => s.url === url));
            showFinishedScreen(currentMovie ? currentMovie.id : null);
        });
    } else {
        let sourceUrl = url;
        const isHls = url.toLowerCase().includes('.m3u8');

        // Check if we can/should mask the URL (Blob)
        // If it's MP4 and NOT HLS, we can try to fetch it as blob to hide the URL
        // BUT this downloads the whole file. We will only do this if it's not HLS.
        // For HLS, hls.js handles it.

        const video = document.createElement('video');
        video.id = 'player';
        video.playsInline = true;
        video.autoplay = true;
        video.muted = false; // Enable audio by default
        video.controls = true;
        video.crossOrigin = 'anonymous'; // Important for Blob/CORS
        container.appendChild(video);

        currentPlayer = new Plyr(video, getPlyrConfig());
        handleOrientation(currentPlayer); // Add Orientation Lock
        injectBranding();

        // Playback Finished Listener
        currentPlayer.on('ended', () => {
            const currentMovie = MOVIES.find(m => m.servers.some(s => s.url === url));
            showFinishedScreen(currentMovie ? currentMovie.id : null);
        });

        if (isHls && Hls.isSupported()) {
            window.hls = new Hls({ enableWorker: true });
            const hls = window.hls;
            hls.loadSource(sourceUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                // Collect unique quality heights
                const availableQualities = [...new Set(data.levels.map(l => l.height).filter(h => h > 0))];
                availableQualities.sort((a, b) => b - a); // Sort descending

                // Add "0" for Auto
                availableQualities.unshift(0);

                // Update Plyr Quality Settings
                currentPlayer.quality = {
                    default: 0,
                    options: availableQualities,
                    forced: true,
                    onChange: (newQuality) => {
                        if (newQuality === 0) {
                            hls.currentLevel = -1; // Auto
                        } else {
                            hls.levels.forEach((level, levelIndex) => {
                                if (level.height === newQuality) {
                                    hls.currentLevel = levelIndex;
                                }
                            });
                        }
                    },
                };
            });
            hlsInstance = hls;
            video.play().catch(() => { });
        } else {
            // Advanced MP4 Protection: Use MediaSource to stream as Blob
            // This masks the URL without downloading the whole file at once (if server supports Range)
            playMp4ViaMSE(video, sourceUrl);
        }
    }
}

function playMp4ViaMSE(video, url) {
    // Reverted: MSE/Blob streaming for large MP4s is unstable (CORS/Codec issues).
    // Restoring direct playback to ensure the player works.
    video.src = url;
    video.play().catch(() => { });
    return;

    /* 
    // OLD UNSTABLE CODE RETAINED FOR REFERENCE
    if (!window.MediaSource || !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')) {
        // ...
    }
    */
}

/*
const mediaSource = new MediaSource();
video.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', async () => {
    try {
         // Create SourceBuffer with standard web MP4 codec
        const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
        
        // Fetch the file in chunks (streaming emulation)
        const response = await fetch(url);
        if(!response.ok) throw new Error("Network response was not ok");
        
        const reader = response.body.getReader();
        const appendChunk = async () => {
            const { done, value } = await reader.read();
            if (done) {
                if (mediaSource.readyState === 'open') mediaSource.endOfStream();
                return;
            }

            if (!sourceBuffer.updating) {
                sourceBuffer.appendBuffer(value);
            } else {
                // Wait for buffer to clear before appending next chunk
                await new Promise(resolve => {
                     sourceBuffer.addEventListener('updateend', resolve, { once: true });
                });
                sourceBuffer.appendBuffer(value);
            }
            
            // Continue fetching/appending
            appendChunk();
        };

        appendChunk();
        video.play().catch(() => { });

    } catch (e) {
        console.error("MSE Stream Error:", e);
        // Fallback to direct play if anything goes wrong
        if (mediaSource.readyState === 'open') mediaSource.endOfStream();
        video.src = url;
        video.play().catch(() => { });
    }
});
*/


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

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function getPlyrConfig() {
    return {
        autoplay: true,
        muted: false, // Enable audio by default
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
        settings: ['quality', 'speed'],
        i18n: {
            play: 'تشغيل',
            pause: 'إيقاف',
            mute: 'كتم',
            settings: 'الإعدادات',
            quality: 'الجودة',
            speed: 'السرعة',
            auto: 'تلقائي'
        }
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
                <rect x="2" y="2" width="20" height="20" rx="2"></rect>
                <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"></path>
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

    const sliders = ['hero-slider', 'series-slider', 'movies-slider'];
    sliders.forEach((id, index) => {
        const slider = document.getElementById(id);
        if (!slider) return;

        const intervalDelay = 12000; // 12 seconds
        const staggeredStart = index * 3000; // 3s staggered start for coordination

        const startTimer = () => {
            if (document.hidden) return; // Don't start if page is hidden
            if (sliderIntervals[id]) clearInterval(sliderIntervals[id]);
            sliderIntervals[id] = setInterval(() => moveSlider(id, -1), intervalDelay);
        };

        // Delayed initial start for smoother performance
        setTimeout(startTimer, staggeredStart);

        slider.parentElement.onmouseenter = () => {
            if (sliderIntervals[id]) clearInterval(sliderIntervals[id]);
            sliderIntervals[id] = null;
        };
        slider.parentElement.onmouseleave = () => {
            if (!sliderIntervals[id]) startTimer();
        };
    });
}

// Global pause on tab switch
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.values(sliderIntervals).forEach(clearInterval);
        sliderIntervals = {};
    } else {
        initAutoSliders();
    }
});

// 9. See More Feature
function showCategory(type) {
    currentFrontendPage = 1;
    const activeSort = (a, b) => {
        const timeA = a.updatedAt || 0;
        const timeB = b.updatedAt || 0;
        return timeB - timeA;
    };

    let filtered = [];
    if (type === 'ramadan') {
        filtered = MOVIES.filter(m => {
            const keyword = "رمضان";
            const keywordEn = "ramadan";
            const text = (m.name + " " + (m.note || "") + " " + (m.genre || "")).toLowerCase();
            return text.includes(keyword) || text.includes(keywordEn);
        }).sort(activeSort);
    } else {
        filtered = MOVIES.filter(m => m.type === type).sort(activeSort);
    }

    // Update title
    const gridTitle = document.getElementById('grid-view-title');
    if (gridTitle) {
        if (type === 'ramadan') gridTitle.textContent = 'انتاجات رمضان يجمعنا';
        else gridTitle.textContent = type === 'series' ? 'جميع المسلسلات' : 'جميع الأفلام';
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

function changeFrontendPage(page) {
    currentFrontendPage = page;
    renderMoviesList(currentFullList);
}

// Make functions globally accessible
window.openMovieModal = openMovieModal;
window.closeMovieModal = closeMovieModal;
window.moveSlider = moveSlider;
window.showCategory = showCategory;
window.closeGridView = closeGridView;
window.changeFrontendPage = changeFrontendPage;

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

// --- Ad Rendering & Tracking ---
function renderAd() {
    console.log("Attempting to render ads...", ADS);
    const container = document.getElementById('ad-container');
    if (!container) {
        console.warn("Ad container not found in DOM");
        return;
    }

    const activeAds = ADS.filter(ad => {
        const isMatch = ad.active && (ad.target === 'all' || ad.target === 'movies');
        if (!isMatch && ad.active) {
            console.log(`Ad ${ad.id} skipped. Active: ${ad.active}, Target: ${ad.target}`);
        }
        return isMatch;
    });

    console.log("Filtered active ads for movies page:", activeAds);

    if (activeAds.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    // Clear existing intervals
    Object.values(adSliderIntervals).forEach(clearInterval);
    adSliderIntervals = {};

    container.style.display = 'block';
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
                    <img src="${firstItem.url}" alt="إعلان">
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

function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- Platform Stats & Visits (Movies) ---
const sessionID = Date.now().toString() + Math.random().toString(36).substring(7);

function initStats() {
    // Only track if not admin
    if (localStorage.getItem('admin_auth') === 'true') {
        console.log("Admin session - Skipping stats.");
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
