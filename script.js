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
        buildSummaryUI();     // обновява Summary
