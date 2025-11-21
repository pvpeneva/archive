/* -------------------------------------------
    PAGE ROUTER – SWITCH BETWEEN 3 PAGES
-------------------------------------------- */

function showPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });

    // Show selected page
    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // Update active nav link
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + page);
    if (activeNav) activeNav.classList.add('active');

    // Save last visited page
    localStorage.setItem('lastPage', page);
}

/* -------------------------------------------
    GLOBAL DATA
-------------------------------------------- */

let archiveData = [];   // групирани архиви (video + stills)
let filteredData = [];  // филтрирани архиви за показване
let summaryData = [];   // данни от таба Summary в Google Sheets
let connectedUrl = '';  // Apps Script Web App URL

/* Цени – може да ги промениш според твоята тарифа */
const pricingConfig = {
    videoPerMinute: 60, // цена за минута видео (пример: 60 EUR)
    stillPerImage: 5    // цена за снимка/стил (пример: 5 EUR)
};

/* -------------------------------------------
    ИНИЦИАЛИЗАЦИЯ НА ARCHIVES UI
-------------------------------------------- */

function initArchivesUI() {
    const container = document.getElementById('archives-content');
    if (!container) return;

    container.innerHTML = `
        <div class="archives-page-inner">

            <div class="archives-config">
                <h3>Connect Google Sheet</h3>
                <p>Paste your Google Apps Script Web App URL (that reads your archive sheet).</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                    <input id="appsScriptUrl" type="text" placeholder="https://script.google.com/macros/s/......../exec"
                        style="flex:1; padding:10px 12px; border-radius:10px; border:1px solid #ccc; min-width:260px;">
                    <button id="btnTest" class="archive-btn secondary">Test</button>
                    <button id="btnConnect" class="archive-btn primary">Connect</button>
                    <button id="btnRefresh" class="archive-btn secondary">Refresh</button>
                </div>
                <div style="margin-top:8px; font-size:0.85rem; color:#666;">
                    Status: <span id="connectionStatus">Not connected</span>
                </div>
            </div>

            <div class="filters-wrapper" style="margin-top:30px;">
                <div class="filter-item">
                    <label for="searchInput">Search</label>
                    <input id="searchInput" type="text" placeholder="Search by Archive, ID, Inv No, File Name">
                </div>

                <div class="filter-item">
                    <label for="filterArchive">Archive</label>
                    <select id="filterArchive">
                        <option value="all">All archives</option>
                    </select>
                </div>

                <div class="filter-item">
                    <label for="viewMode">View Mode</label>
                    <select id="viewMode">
                        <option value="all">Video + Stills</option>
                        <option value="video">Video only</option>
                        <option value="stills">Stills only</option>
                    </select>
                </div>

                <div class="filter-item">
                    <label for="sortSelect">Sort By</label>
                    <select id="sortSelect">
                        <option value="duration-desc">Duration (Longest first)</option>
                        <option value="duration-asc">Duration (Shortest first)</option>
                        <option value="name-asc">Archive name (A–Z)</option>
                        <option value="name-desc">Archive name (Z–A)</option>
                        <option value="clips-desc">Clips count (Most first)</option>
                        <option value="clips-asc">Clips count (Least first)</option>
                    </select>
                </div>
            </div>

            <div class="archive-buttons">
                <button id="btnApply" class="archive-btn primary">Apply Filters</button>
                <button id="btnReset" class="archive-btn secondary">Reset</button>
            </div>

            <div id="archives-tables" style="margin-top:30px;">
                <div class="loading-box">
                    No data loaded yet.<br>
                    Connect your sheet and click <strong>Refresh</strong>.
                </div>
            </div>
        </div>
    `;

    // Бутончета и инпути
    document.getElementById('btnTest').addEventListener('click', testConnection);
    document.getElementById('btnConnect').addEventListener('click', connectToSheet);
    document.getElementById('btnRefresh').addEventListener('click', refreshData);
    document.getElementById('btnApply').addEventListener('click', applyFilters);
    document.getElementById('btnReset').addEventListener('click', resetFilters);

    // Enter в search да тригърне Apply
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') applyFilters();
    });
}

/* -------------------------------------------
    CONNECT / TEST
-------------------------------------------- */

function setStatus(text, ok = false) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#2ecc71' : '#c0392b';
}

function testConnection() {
    const url = document.getElementById('appsScriptUrl').value.trim();
    if (!url) {
        alert('Paste your Apps Script Web App URL first.');
        return;
    }
    if (!url.includes('script.google.com')) {
        alert('This does not look like a Google Apps Script URL.');
        return;
    }
    window.open(url, '_blank');
}

function connectToSheet() {
    const url = document.getElementById('appsScriptUrl').value.trim();
    if (!url) {
        alert('Paste your Apps Script Web App URL.');
        return;
    }
    if (!url.includes('script.google.com') || !url.includes('/exec')) {
        alert('The URL should be a deployed Web App and end with /exec');
        return;
    }

    connectedUrl = url;
    setStatus('Connected (not loaded yet)', true);
    refreshData();
}

/* -------------------------------------------
    FETCH DATA FROM GOOGLE APPS SCRIPT
-------------------------------------------- */

async function refreshData() {
    if (!connectedUrl) {
        alert('Connect to your Google Sheet first.');
        return;
    }

    const tables = document.getElementById('archives-tables');
    if (tables) {
        tables.innerHTML = '<div class="loading-box">Loading data from Google Sheets…</div>';
    }

    try {
        const url = connectedUrl + (connectedUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
        const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        // Очакваме структура: { main: [...], summary: [...] } или просто масив
        let mainRows = null;
        if (Array.isArray(data)) {
            mainRows = data;
            summaryData = [];
        } else {
            mainRows = Array.isArray(data.main) ? data.main : [];
            summaryData = Array.isArray(data.summary) ? data.summary : [];
        }

        if (!mainRows || mainRows.length === 0) {
            throw new Error('No data returned from sheet');
        }

        processData(mainRows);
        applyFilters();       // рендва таблиците
        buildSummaryUI();     // обновява Summary страницата

        setStatus('Connected & data loaded', true);

    } catch (err) {
        console.error(err);
        setStatus('Error: ' + err.message, false);
        if (tables) {
            tables.innerHTML = `<div class="loading-box">Error: ${err.message}</div>`;
        }
    }
}

/* -------------------------------------------
    DATA PROCESSING – GROUP BY ARCHIVE
-------------------------------------------- */

function detectDurationColumn(row) {
    if (!row) return null;
    const names = [
        'SOURCE_DURATION','SOURCE DURATION','Source Duration',
        'DURATION','Duration','duration',
        'CLIP_DURATION','Clip Duration','clip_duration',
        'LENGTH','Length','length',
        'RUNTIME','Runtime','runtime',
        'TC_DURATION','TC Duration','tc_duration'
    ];
    for (const n of names) {
        if (row.hasOwnProperty(n)) return n;
    }
    for (const k in row) {
        if (k.toLowerCase().includes('duration')) return k;
    }
    return null;
}

function TCSUM(arr, fpsValue) {
    let fps = 30;
    if (fpsValue !== undefined && fpsValue !== '') {
        const s = fpsValue.toString().replace(',', '.').replace(';', '.');
        const m = s.match(/\d+[.,]?\d*/);
        if (m) {
            const v = parseFloat(m[0]);
            if (!isNaN(v)) fps = v;
        }
    }
    let total = 0;
    for (const tc of arr) {
        if (!tc) continue;
        const txt = tc.toString().trim();
        if (txt === '') continue;
        let sign = 1;
        if (/^-|\(/.test(txt)) sign = -1;
        const clean = txt.replace(/[^0-9:]/g, '');
        if (clean === '') continue;
        const p = clean.split(':');
        const h = +p[0] || 0, m = +p[1] || 0, s = +p[2] || 0, f = +p[3] || 0;
        total += sign * (h * 3600 * fps + m * 60 * fps + s * fps + f);
    }
    total = Math.round(total);
    let neg = '';
    if (total < 0) { neg = '-'; total = Math.abs(total); }
    const h = Math.floor(total / (3600 * fps));
    const remH = total % (3600 * fps);
    const m = Math.floor(remH / (60 * fps));
    const remM = remH % (60 * fps);
    const s = Math.floor(remM / fps);
    const f = remM % fps;
    const pad = n => n < 10 ? '0' + n : '' + n;
    return `${neg}${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function timecodeToFrames(tc, fps) {
    if (!tc || tc === '00:00:00:00') return 0;
    const p = tc.split(':').map(x => parseInt(x) || 0);
    const [h, m, s, f] = p;
    return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

function framesToTimecode(frames, fps) {
    if (frames === 0) return '00:00:00:00';
    const h = Math.floor(frames / (3600 * fps));
    const m = Math.floor((frames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((frames % (60 * fps)) / fps);
    const f = frames % fps;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function processData(rows) {
    const map = new Map();
    const durationCol = detectDurationColumn(rows[0]);

    rows.forEach(row => {
        const archive = (row.Archive || row.archive || row.ARCHIVE || '').toString().trim();
        if (!archive) return;

        const id = (row.ID || row.id || '').toString().trim();
        const invNo = (row.inv_no || row['inv no'] || row['Inv No'] || '').toString().trim();
        const fileName = (row.FILE_NAME || row['FILE NAME'] || row['File Name'] || '').toString().trim();
        let duration = '00:00:00:00';
        if (durationCol && row[durationCol]) {
            duration = row[durationCol].toString().trim();
        } else {
            duration = (row.SOURCE_DURATION || row['SOURCE DURATION'] || row['Source Duration'] ||
                        row.Duration || row.duration || '00:00:00:00').toString().trim();
        }

        const sourceIn = (row.SOURCE_IN || row['SOURCE IN'] || row['Source In'] || '').toString().trim();
        const sourceOut = (row.SOURCE_OUT || row['SOURCE OUT'] || row['Source Out'] || '').toString().trim();
        const link = (row.link || row.Link || row.URL || '').toString().trim();

        if (!map.has(archive)) {
            map.set(archive, { name: archive, clips: [], allDurations: [] });
        }
        map.get(archive).clips.push({ id, invNo, fileName, duration, sourceIn, sourceOut, link });
        map.get(archive).allDurations.push(duration);
    });

    archiveData = Array.from(map.values()).map(a => {
        const totalDuration = TCSUM(a.allDurations, 30);
        const totalFrames = timecodeToFrames(totalDuration, 30);
        const type = totalDuration === '00:00:00:00' ? 'stills' : 'video';
        return {
            name: a.name,
            entries: a.clips.length,
            clips: a.clips,
            totalFrames,
            duration: totalDuration,
            type,
            fps: 30
        };
    });

    populateArchiveFilter();
}

/* -------------------------------------------
    FILTERS + SORT + RENDER TABLES
-------------------------------------------- */

function populateArchiveFilter() {
    const select = document.getElementById('filterArchive');
    if (!select) return;
    select.innerHTML = '<option value="all">All archives</option>';
    [...new Set(archiveData.map(a => a.name))].sort().forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        select.appendChild(opt);
    });
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const filterArchive = document.getElementById('filterArchive');
    const viewMode = document.getElementById('viewMode');

    if (!searchInput || !sortSelect || !filterArchive || !viewMode) return;

    const term = searchInput.value.toLowerCase();
    const sortBy = sortSelect.value;
    const filterVal = filterArchive.value;
    const viewVal = viewMode.value;

    filteredData = archiveData.filter(a => {
        const matchesSearch =
            a.name.toLowerCase().includes(term) ||
            a.clips.some(c =>
                (c.id || '').toLowerCase().includes(term) ||
                (c.invNo || '').toLowerCase().includes(term) ||
                (c.fileName || '').toLowerCase().includes(term)
            );
        const matchesArchive = (filterVal === 'all' || a.name === filterVal);
        let matchesView = true;
        if (viewVal === 'video') matchesView = a.type === 'video';
        if (viewVal === 'stills') matchesView = a.type === 'stills';
        return matchesSearch && matchesArchive && matchesView;
    });

    filteredData.sort((a, b) => {
        switch (sortBy) {
            case 'duration-desc': return b.totalFrames - a.totalFrames;
            case 'duration-asc': return a.totalFrames - b.totalFrames;
            case 'name-asc': return a.name.localeCompare(b.name);
            case 'name-desc': return b.name.localeCompare(a.name);
            case 'clips-desc': return b.entries - a.entries;
            case 'clips-asc': return a.entries - b.entries;
            default: return 0;
        }
    });

    renderArchivesTables(filteredData);
}

function resetFilters() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const filterArchive = document.getElementById('filterArchive');
    const viewMode = document.getElementById('viewMode');

    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'duration-desc';
    if (filterArchive) filterArchive.value = 'all';
    if (viewMode) viewMode.value = 'all';

    filteredData = [...archiveData];
    renderArchivesTables(filteredData);
}

function renderArchivesTables(data) {
    const container = document.getElementById('archives-tables');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="loading-box">No archives match your filters.</div>`;
        return;
    }

    const video = data.filter(a => a.type === 'video');
    const stills = data.filter(a => a.type === 'stills');

    let html = '';

    // VIDEO
    if (video.length > 0) {
        html += `<div class="archive-section">
                    <h3 style="margin-bottom:12px;">Video Archives</h3>
                 </div>`;
        video.forEach(archive => {
            html += `
            <div class="archive-section">
                <div class="archive-title">
                    <span>${archive.name}</span>
                    <span>${archive.clips.length} clips • Total ${archive.duration}</span>
                </div>
                <table class="archive-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ID</th>
                            <th>Inv No</th>
                            <th>File Name</th>
                            <th>Source In</th>
                            <th>Source Out</th>
                            <th>Duration</th>
                            <th>Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${archive.clips.map((c, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${c.id || ''}</td>
                                <td>${c.invNo || ''}</td>
                                <td>${c.fileName || ''}</td>
                                <td class="duration-cell" style="font-size:0.9rem;">${c.sourceIn || ''}</td>
                                <td class="duration-cell" style="font-size:0.9rem;">${c.sourceOut || ''}</td>
                                <td class="duration-cell">${c.duration || '00:00:00:00'}</td>
                                <td>${c.link ? `<a href="${c.link}" target="_blank">Link</a>` : ''}</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row">
                            <td colspan="6"><strong>TOTAL</strong></td>
                            <td class="duration-cell"><strong>${archive.duration}</strong></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        });
    }

    // STILLS
    if (stills.length > 0) {
        html += `<div class="archive-section" style="margin-top:40px;">
                    <h3 style="margin-bottom:12px;">Stills / Images</h3>
                 </div>`;
        stills.forEach(archive => {
            html += `
            <div class="archive-section">
                <div class="archive-title stills">
                    <span>${archive.name}</span>
                    <span>${archive.entries} stills</span>
                </div>
                <table class="archive-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ID</th>
                            <th>Inv No</th>
                            <th>File Name</th>
                            <th>Type</th>
                            <th>Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${archive.clips.map((c, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${c.id || ''}</td>
                                <td>${c.invNo || ''}</td>
                                <td>${c.fileName || ''}</td>
                                <td>Still Image</td>
                                <td>${c.link ? `<a href="${c.link}" target="_blank">Link</a>` : ''}</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row stills">
                            <td colspan="6"><strong>TOTAL: ${archive.entries} still images</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        });
    }

    container.innerHTML = html;
}

/* -------------------------------------------
    SUMMARY PAGE (STATS + PRICING)
-------------------------------------------- */

function buildSummaryUI() {
    const cardsContainer = document.getElementById('summary-cards');
    const pricingContainer = document.getElementById('pricing-table');
    const rawContainer = document.getElementById('summary-raw');

    if (!cardsContainer || !pricingContainer || !rawContainer) return;

    const video = archiveData.filter(a => a.type === 'video');
    const stills = archiveData.filter(a => a.type === 'stills');

    const videoClips = video.reduce((s, a) => s + a.clips.length, 0);
    const stillsCount = stills.reduce((s, a) => s + a.entries, 0);
    const videoFramesTotal = video.reduce((s, a) => s + a.totalFrames, 0);
    const totalDuration = framesToTimecode(videoFramesTotal, 30);

    const toBaseName = n => !n ? '' : n.toString().trim().toLowerCase().replace(/\.[a-z0-9]+$/i, '');
    const uniqueSources = new Set(
        video.flatMap(a => a.clips.map(c => c.fileName)).filter(Boolean).map(toBaseName)
    ).size;

    // SUMMARY CARDS
    cardsContainer.innerHTML = `
        <div class="summary-card">
            <div class="summary-card-title">Video Clips</div>
            <div class="summary-card-value">${videoClips}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Stills / Images</div>
            <div class="summary-card-value">${stillsCount}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Total Video Duration</div>
            <div class="summary-card-value">${totalDuration}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Unique Sources</div>
            <div class="summary-card-value">${uniqueSources}</div>
        </div>
    `;

    // PRICING TABLE
    let pricingHtml = `<table>
        <thead>
            <tr>
                <th>Archive</th>
                <th>Type</th>
                <th>Unit Price</th>
                <th>Quantity</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
    `;

    let grandTotal = 0;

    // Video pricing
    video.forEach(a => {
        const minutes = (a.totalFrames / (a.fps * 60)) || 0;
        const total = minutes * pricingConfig.videoPerMinute;
        grandTotal += total;
        pricingHtml += `
            <tr>
                <td>${a.name}</td>
                <td>Video</td>
                <td>${pricingConfig.videoPerMinute.toFixed(2)} €/min</td>
                <td>${minutes.toFixed(2)} min</td>
                <td>${total.toFixed(2)} €</td>
            </tr>
        `;
    });

    // Stills pricing
    stills.forEach(a => {
        const count = a.entries;
        const total = count * pricingConfig.stillPerImage;
        grandTotal += total;
        pricingHtml += `
            <tr>
                <td>${a.name}</td>
                <td>Stills</td>
                <td>${pricingConfig.stillPerImage.toFixed(2)} €/image</td>
                <td>${count}</td>
                <td>${total.toFixed(2)} €</td>
            </tr>
        `;
    });

    pricingHtml += `
        <tr class="pricing-total-row">
            <td colspan="4">GRAND TOTAL</td>
            <td>${grandTotal.toFixed(2)} €</td>
        </tr>
        </tbody>
    </table>`;

    pricingContainer.innerHTML = pricingHtml;

    // RAW SUMMARY (от таб Summary в Sheets)
    if (!summaryData || summaryData.length === 0) {
        rawContainer.innerHTML = `<div style="color:#777;">No Summary tab data received from Google Sheet.</div>`;
    } else {
        let rawHtml = '';
        summaryData.forEach(row => {
            Object.keys(row).forEach(key => {
                rawHtml += `
                    <div class="summary-raw-row">
                        <div class="summary-raw-label">${key}</div>
                        <div class="summary-raw-value">${row[key]}</div>
                    </div>
                `;
            });
        });
        rawContainer.innerHTML = rawHtml;
    }
}

/* -------------------------------------------
   INITIAL BOOT – when page is loaded
-------------------------------------------- */

window.addEventListener("DOMContentLoaded", () => {
    const last = localStorage.getItem('lastPage') || 'home';
    showPage(last);
    initArchivesUI();   // тук вече вкарваме Connect/Filters/таблиците
});
