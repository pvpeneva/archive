// Live Archive Tool - main script with header info + sidebar + dark theme

/*************************************************
 * PAGE ROUTER
 *************************************************/
function showPage(page) {
    // hide all pages
    document.querySelectorAll(".page").forEach(p => {
        p.style.display = "none";
        p.classList.remove("active");
    });

    // show selected
    const target = document.getElementById("page-" + page);
    if (target) {
        target.style.display = "block";
        target.classList.add("active");
    }

    // update nav
    document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
    const nav = document.getElementById("nav-" + page);
    if (nav) nav.classList.add("active");

    // remember last
    localStorage.setItem("lastPage", page);
}

/*************************************************
 * THEME TOGGLE
 *************************************************/
function initThemeToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    const saved = localStorage.getItem("theme") || "light";
    if (saved === "dark") {
        document.body.classList.add("dark");
        btn.textContent = "Light";
    } else {
        btn.textContent = "Dark";
    }

    btn.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        btn.textContent = isDark ? "Light" : "Dark";
    });
}

/*************************************************
 * GLOBAL STATE (archives + header)
 *************************************************/
let connectedUrl = "";
let archiveData = [];
let filteredData = [];
let allSheetsConfig = [];
let currentSheetMeta = null;

// default header info – used if some fields are missing
const DEFAULT_META = {
    production: "Michael W. King Productions, LLC., USA",
    project: "The Rescuers",
    researcher: "Frank Drauschke",
    contact: "research@drauschke.de",
    episodeLabel: ""
};

// SUMMARY WEBAPP
const SUMMARY_WEBAPP_URL =
    "https://script.google.com/macros/s/AKfycbyXaGpw4aVA_3fh8_GBrih9_Kj6loNHQ7dKKDGnIA83E2U1IfvRADgLWT8i_GKSA8TeAw/exec";

// SUMMARY CONFIG – колони в Summary таба
const SUMMARY_ARCHIVE_COL = "Archive / Librarie";

const SUMMARY_EPISODES = {
    duckwitz: {
        key: "duckwitz",
        label: "Duckwitz",
        stillsCol: "01_Duckwitz_St",
        clipsCol: "01_D_clips",
        tcCol: "01_Duckwitz_TC"
    },
    alice: {
        key: "alice",
        label: "Alice",
        stillsCol: "02_Alice_St",
        clipsCol: "02_Alice_clips",
        tcCol: "02_Alice_TC"
    },
    law1: {
        key: "law1",
        label: "LAW 1",
        stillsCol: "03_LAW1_St",
        clipsCol: "03_LAW1_clips",
        tcCol: "03_LAW1_TC"
    },
    law2: {
        key: "law2",
        label: "LAW 2",
        stillsCol: "04_LAW2_St",
        clipsCol: "04_LAW2_clips",
        tcCol: "04_LAW2_TC"
    },
    frybing: {
        key: "frybing",
        label: "Fry/Bing",
        stillsCol: "05_FRY/BING EDL_St",
        clipsCol: "05_FRY/BING EDL_clips",
        tcCol: "05_FRY/BING EDL_TC"
    }
};

let summaryRows = [];
let summaryLoaded = false;
let currentSummaryEpisode = "duckwitz";

/*************************************************
 * HEADER RENDERING
 *************************************************/
function makeEpisodeLabel(sheet) {
    if (!sheet || !sheet.episode) return "";
    const baseName = ((sheet.name || "").split(" ")[0] || "").replace(/_/g, " ");
    if (!baseName) return sheet.episode;
    const nice = baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
    return sheet.episode + " " + nice;
}

function setCurrentSheetMeta(meta) {
    currentSheetMeta = Object.assign({}, DEFAULT_META, meta || {});
    renderHeaderInfo();
}

function renderHeaderInfo() {
    const meta = currentSheetMeta;
    const ids = ["headerInfoHome", "headerInfoArchives", "headerInfoSummary"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (!meta) {
            el.innerHTML = "";
            return;
        }

        const episodeText = meta.episodeLabel ? meta.episodeLabel : "";
        const projectText = meta.project || "";
        const prodText = meta.production || "";
        const researcherText = meta.researcher || "";
        const contactText = meta.contact || "";

        el.innerHTML = `
            <div class="header-info-box">
                <div class="header-info-row"><span class="header-label">Production company:</span><span class="header-value">${prodText}</span></div>
                <div class="header-info-row"><span class="header-label">Film project:</span><span class="header-value">${projectText}</span></div>
                ${episodeText ? `<div class="header-info-row"><span class="header-label">Episode:</span><span class="header-value">${episodeText}</span></div>` : ""}
                <div class="header-info-row"><span class="header-label">Researcher:</span><span class="header-value">${researcherText}</span></div>
                <div class="header-info-row"><span class="header-label">Contact:</span><span class="header-value">${contactText}</span></div>
            </div>
        `;
    });
}

/*************************************************
 * SIDEBAR – LOAD SHEETS FROM sheets-config.json
 *************************************************/
async function loadSidebarSheets() {
    const list = document.getElementById("sidebarSheets");
    if (!list) return;

    list.innerHTML = "<li class='sidebar-item'>Loading…</li>";

    try {
        const res = await fetch("sheets-config.json?cache=" + Date.now());
        const cfg = await res.json();
        allSheetsConfig = Array.isArray(cfg.sheets) ? cfg.sheets : [];

        list.innerHTML = "";

        allSheetsConfig.forEach((sheet, index) => {
            const li = document.createElement("li");
            li.className = "sidebar-item";
            li.textContent = (sheet.episode ? sheet.episode + "_" : "") + (sheet.name || "");
            li.addEventListener("click", () => onSelectSheetFromSidebar(sheet, li));
            list.appendChild(li);

            // auto-select first sheet
            if (index === 0) {
                onSelectSheetFromSidebar(sheet, li, true);
            }
        });

    } catch (err) {
        console.error("Error loading sheets-config.json", err);
        list.innerHTML = "<li class='sidebar-item'>Error loading sheets</li>";
    }
}

function onSelectSheetFromSidebar(sheet, li, silentAuto) {
    // active state
    document.querySelectorAll(".sidebar-item").forEach(item => item.classList.remove("sidebar-active"));
    if (li) li.classList.add("sidebar-active");

    // connected URL and input
    connectedUrl = sheet.url || "";
    const input = document.getElementById("sheetUrlInput");
    if (input) input.value = connectedUrl;

    // header info
    const episodeLabel = makeEpisodeLabel(sheet);
    setCurrentSheetMeta({
        production: sheet.production,
        project: sheet.project,
        researcher: sheet.researcher,
        contact: sheet.contact,
        episodeLabel: episodeLabel
    });

    // status text
    const statusEl = document.getElementById("connectStatus");
    if (statusEl) {
        statusEl.textContent = "Status: Ready (" + (sheet.name || "Sheet") + ")";
    }

    // if user clicked (not auto) – load data
    if (!silentAuto) {
        refreshData();
    }
}

/*************************************************
 * ARCHIVE UI – BUILD STATIC PART
 *************************************************/
function initArchiveUI() {
    const container = document.getElementById("archives-content");
    if (!container) return;

    container.innerHTML = `
        <div class="connect-box">
            <h3>Connect Google Sheet</h3>
            <input id="sheetUrlInput" class="archive-input"
                type="text" placeholder="Paste Google Apps Script Web App URL">
            <div class="connect-btns">
                <button id="btnTest" class="archive-btn secondary">Test</button>
                <button id="btnConnect" class="archive-btn primary">Connect</button>
                <button id="btnRefresh" class="archive-btn secondary">Refresh</button>
            </div>
            <div id="connectStatus" class="status-msg">Status: Not connected</div>
        </div>

        <div id="filtersPanel" style="display:none; margin-top:30px;">
            <div class="filters-wrapper">
                <div class="filter-item">
                    <label>Search</label>
                    <input id="searchInput" type="text" placeholder="Search by Archive, ID, Inv No, File Name…">
                </div>
                <div class="filter-item">
                    <label>Archive</label>
                    <select id="filterArchive">
                        <option value="all">All archives</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label>Sort</label>
                    <select id="sortSelect">
                        <option value="duration-desc">Duration (Longest)</option>
                        <option value="duration-asc">Duration (Shortest)</option>
                        <option value="name-asc">Archive A–Z</option>
                        <option value="name-desc">Archive Z–A</option>
                        <option value="clips-desc">Most Clips</option>
                        <option value="clips-asc">Fewest Clips</option>
                    </select>
                </div>
            </div>
            <div class="archive-buttons">
                <button class="archive-btn primary" id="btnApply">Apply</button>
                <button class="archive-btn secondary" id="btnReset">Reset</button>
                <button class="archive-btn success" id="btnCopy">Copy</button>
                <button class="archive-btn secondary" id="btnDownloadExcel">Download Excel</button>
            </div>
        </div>

        <div id="archiveTables" style="margin-top:25px;"></div>
    `;

    // wire buttons
    document.getElementById("btnTest").onclick = testConnection;
    document.getElementById("btnConnect").onclick = connectToSheet;
    document.getElementById("btnRefresh").onclick = refreshData;

    document.getElementById("btnApply").onclick = applyFilters;
    document.getElementById("btnReset").onclick = resetFilters;
    document.getElementById("btnCopy").onclick = () =>
        copyContainerAsHtml("headerInfoArchives", "archiveTables");
    document.getElementById("btnDownloadExcel").onclick = downloadArchiveExcel;
}

/*************************************************
 * CONNECTION + DATA LOADING (ARCHIVES)
 *************************************************/
function testConnection() {
    const input = document.getElementById("sheetUrlInput");
    if (!input || !input.value.trim()) {
        alert("Paste your /exec Web App URL first.");
        return;
    }
    window.open(input.value.trim(), "_blank");
}

function connectToSheet() {
    const input = document.getElementById("sheetUrlInput");
    if (!input) return;

    const url = input.value.trim();
    if (!url || !url.includes("/exec")) {
        alert("Please paste a valid Web App URL (must end with /exec).");
        return;
    }
    connectedUrl = url;

    // if user connects manually, we still set default header
    if (!currentSheetMeta) {
        setCurrentSheetMeta(DEFAULT_META);
    }

    const statusEl = document.getElementById("connectStatus");
    if (statusEl) statusEl.textContent = "Status: Connected (click Refresh)";
}

async function refreshData() {
    if (!connectedUrl) {
        alert("First choose a sheet from the left or paste a Web App URL.");
        return;
    }

    const statusEl = document.getElementById("connectStatus");
    if (statusEl) statusEl.textContent = "Loading…";

    const tables = document.getElementById("archiveTables");
    if (tables) {
        tables.innerHTML = `<div class="loading-box">Loading data from Google Apps Script…</div>`;
    }

    try {
        const url = connectedUrl + (connectedUrl.includes("?") ? "&" : "?") + "_=" + Date.now();
        const resp = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
        const data = await resp.json();

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("No data returned from script.");
        }

        processRows(data);

        const filtersPanel = document.getElementById("filtersPanel");
        if (filtersPanel) filtersPanel.style.display = "block";

        if (statusEl) statusEl.textContent = "Status: Data Loaded";

    } catch (err) {
        console.error(err);
        if (statusEl) statusEl.textContent = "Error while loading data";
        const tables2 = document.getElementById("archiveTables");
        if (tables2) {
            tables2.innerHTML = `<div class="loading-box">Error: ${err.message}</div>`;
        }
    }
}

/*************************************************
 * PROCESS DATA (ARCHIVES)
 *************************************************/
function processRows(rows) {
    const map = new Map();

    rows.forEach(r => {
        const archive = (r.Archive || r.archive || r.ARCHIVE || "").toString().trim();
        if (!archive) return;

        const id = (r.ID || r.id || "").toString().trim();
        const inv = (r["inv no"] || r["INV NO"] || r["Inv No"] || "").toString().trim();
        const file = (r["FILE NAME"] || r["File Name"] || r.FILE_NAME || "").toString().trim();
        const sin = (r["SOURCE IN"] || r["Source In"] || r.SOURCE_IN || "").toString().trim();
        const sout = (r["SOURCE OUT"] || r["Source Out"] || r.SOURCE_OUT || "").toString().trim();
        const dur = (r["SOURCE DURATION"] || r["Source Duration"] || r.SOURCE_DURATION || r.Duration || "").toString().trim();
        const link = (r["Link"] || r["link"] || r["URL"] || "").toString().trim();

        if (!map.has(archive)) {
            map.set(archive, { name: archive, clips: [], durations: [] });
        }

        map.get(archive).clips.push({ id, inv, file, sin, sout, dur, link });
        map.get(archive).durations.push(dur || "00:00:00:00");
    });

    archiveData = Array.from(map.values()).map(a => {
        const total = sumDurations(a.durations);
        return {
            name: a.name,
            clips: a.clips,
            totalDuration: total,
            totalFrames: tcToFrames(total),
            entries: a.clips.length
        };
    });

    filteredData = archiveData.slice();
    buildArchiveDropdown();
    renderTables(filteredData);
}

/*************************************************
 * FILTERS + SORT (ARCHIVES)
 *************************************************/
function buildArchiveDropdown() {
    const sel = document.getElementById("filterArchive");
    if (!sel) return;

    sel.innerHTML = `<option value="all">All archives</option>`;
    archiveData.forEach(a => {
        const o = document.createElement("option");
        o.value = a.name;
        o.textContent = a.name;
        sel.appendChild(o);
    });
}

function applyFilters() {
    const termEl = document.getElementById("searchInput");
    const arcEl = document.getElementById("filterArchive");
    const sortEl = document.getElementById("sortSelect");

    const term = termEl ? termEl.value.toLowerCase() : "";
    const arc = arcEl ? arcEl.value : "all";
    const sort = sortEl ? sortEl.value : "duration-desc";

    filteredData = archiveData.filter(a => {
        const matchArchive = arc === "all" || a.name === arc;
        const matchSearch =
            a.name.toLowerCase().includes(term) ||
            a.clips.some(c =>
                (c.id || "").toLowerCase().includes(term) ||
                (c.inv || "").toLowerCase().includes(term) ||
                (c.file || "").toLowerCase().includes(term)
            );
        return matchArchive && matchSearch;
    });

    filteredData.sort((a, b) => {
        switch (sort) {
            case "duration-desc": return b.totalFrames - a.totalFrames;
            case "duration-asc": return a.totalFrames - b.totalFrames;
            case "name-asc": return a.name.localeCompare(b.name);
            case "name-desc": return b.name.localeCompare(a.name);
            case "clips-desc": return b.entries - a.entries;
            case "clips-asc": return a.entries - b.entries;
            default: return 0;
        }
    });

    renderTables(filteredData);
}

function resetFilters() {
    const termEl = document.getElementById("searchInput");
    const arcEl = document.getElementById("filterArchive");
    const sortEl = document.getElementById("sortSelect");

    if (termEl) termEl.value = "";
    if (arcEl) arcEl.value = "all";
    if (sortEl) sortEl.value = "duration-desc";

    filteredData = archiveData.slice();
    renderTables(filteredData);
}

/*************************************************
 * TIME-CODE HELPERS
 *************************************************/
function tcToFrames(tc, fps = 25) {
    if (!tc) return 0;
    const parts = tc.toString().split(":").map(n => parseInt(n, 10) || 0);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    const f = parts[3] || 0;
    return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

function framesToTc(frames, fps = 25) {
    if (!frames) return "00:00:00:00";
    const h = Math.floor(frames / (3600 * fps));
    const m = Math.floor((frames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((frames % (60 * fps)) / fps);
    const f = frames % fps;
    const z = n => String(n).padStart(2, "0");
    return `${z(h)}:${z(m)}:${z(s)}:${z(f)}`;
}

function sumDurations(list) {
    const totalFrames = (list || []).reduce((sum, tc) => sum + tcToFrames(tc), 0);
    return framesToTc(totalFrames);
}

/*************************************************
 * RENDER TABLES (ARCHIVES)
 *************************************************/
function renderTables(data) {
    const container = document.getElementById("archiveTables");
    if (!container) return;

    if (!data || !data.length) {
        container.innerHTML = `<div class="loading-box">No archives match your filters.</div>`;
        return;
    }

    let html = "";

    data.forEach(a => {
        html += `
        <div class="archive-section">
            <div class="archive-title">
                <span>${a.name}</span>
                <span>${a.entries} clips • Total: ${a.totalDuration}</span>
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
                    ${a.clips.map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${c.id || ""}</td>
                            <td>${c.inv || ""}</td>
                            <td style="max-width:380px;white-space:normal;">${c.file || ""}</td>
                            <td>${c.sin || ""}</td>
                            <td>${c.sout || ""}</td>
                            <td class="duration-cell">${c.dur || ""}</td>
                            <td>${c.link ? `<a href="${c.link}" target="_blank">Link</a>` : ""}</td>
                        </tr>
                    `).join("")}
                    <tr class="total-row">
                        <td colspan="6"><strong>Total</strong></td>
                        <td><strong>${a.totalDuration}</strong></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>
        `;
    });

    container.innerHTML = html;
}

/*************************************************
 * GENERIC COPY AS HTML (header + tables)
 *************************************************/
async function copyContainerAsHtml(headerId, mainId) {
    const mainEl = document.getElementById(mainId);
    if (!mainEl || !mainEl.innerHTML.trim()) {
        alert("No data to copy yet.");
        return;
    }

    const headerEl = document.getElementById(headerId);

    // Чист HTML с <table>, без <html><body> wrappers
    const html = `
        <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
            <tr>
                <td>
                    ${headerEl ? headerEl.innerHTML : ""}
                </td>
            </tr>
        </table>
        ${mainEl.innerHTML}
    `;

    const plainText = stripHtml(html);

    if (navigator.clipboard && navigator.clipboard.write) {
        try {
            const item = new ClipboardItem({
                "text/html": new Blob([html], { type: "text/html" }),
                "text/plain": new Blob([plainText], { type: "text/plain" })
            });
            await navigator.clipboard.write([item]);
            alert("Header + table copied as rich HTML table.");
            return;
        } catch (e) {
            console.warn("HTML clipboard failed, falling back to plain text", e);
        }
    }

    // fallback – текст
    const ta = document.createElement("textarea");
    ta.value = plainText;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        alert("Header + table copied (text-only fallback).");
    } catch (e) {
        alert("Copy failed in this browser.");
    }
    document.body.removeChild(ta);
}

function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.innerText;
}

/*************************************************
 * EXCEL EXPORT HELPERS (ARCHIVES + SUMMARY)
 *************************************************/
function downloadArchiveExcel() {
    if (typeof XLSX === "undefined") {
        alert("Excel export library (XLSX) not loaded.");
        return;
    }
    const container = document.getElementById("archiveTables");
    if (!container) return;
    const tables = container.querySelectorAll("table");
    if (!tables.length) {
        alert("No tables to export.");
        return;
    }

    const wb = XLSX.utils.book_new();
    tables.forEach((tbl, idx) => {
        const ws = XLSX.utils.table_to_sheet(tbl);
        XLSX.utils.book_append_sheet(wb, ws, `Archive_${idx + 1}`);
    });

    XLSX.writeFile(wb, "archives.xlsx");
}

function downloadSummaryExcel() {
    if (typeof XLSX === "undefined") {
        alert("Excel export library (XLSX) not loaded.");
        return;
    }
    const container = document.getElementById("summary-main-export");
    if (!container) return;
    const tables = container.querySelectorAll("table");
    if (!tables.length) {
        alert("No tables to export.");
        return;
    }

    const wb = XLSX.utils.book_new();
    tables.forEach((tbl, idx) => {
        const ws = XLSX.utils.table_to_sheet(tbl);
        const name = idx === 0 ? "Statistics" : "Pricing";
        XLSX.utils.book_append_sheet(wb, ws, name);
    });

    const epCfg = SUMMARY_EPISODES[currentSummaryEpisode] || { label: "episode" };
    XLSX.writeFile(wb, `summary_${epCfg.label.replace(/[^a-z0-9]/gi, "_")}.xlsx`);
}

/*************************************************
 * SUMMARY PAGE – LOAD DATA & RENDER
 *************************************************/
function initSummaryPage() {
    const select = document.getElementById("summaryEpisodeSelect");
    if (!select) return;

    select.value = currentSummaryEpisode;

    select.addEventListener("change", () => {
        currentSummaryEpisode = select.value;
        if (summaryLoaded) {
            renderSummaryForEpisode(currentSummaryEpisode);
        }
    });

    const btnCopy = document.getElementById("btnSummaryCopy");
    if (btnCopy) {
        btnCopy.onclick = () =>
            copyContainerAsHtml("headerInfoSummary", "summary-main-export");
    }

    const btnExcel = document.getElementById("btnSummaryExcel");
    if (btnExcel) {
        btnExcel.onclick = downloadSummaryExcel;
    }

    loadSummaryData();
}

async function loadSummaryData() {
    const statsContainer = document.getElementById("statistics-table");
    if (statsContainer) {
        statsContainer.innerHTML =
            `<div class="loading-box">Loading Summary data from Google Apps Script…</div>`;
    }

    try {
        const url = SUMMARY_WEBAPP_URL + "?_=" + Date.now();
        const resp = await fetch(url, { headers: { "Accept": "application/json" } });
        const data = await resp.json();

        if (!Array.isArray(data) || !data.length) {
            throw new Error("No summary data returned.");
        }

        summaryRows = data;
        summaryLoaded = true;

        renderSummaryForEpisode(currentSummaryEpisode);
        renderRawSummary();

    } catch (err) {
        console.error(err);
        if (statsContainer) {
            statsContainer.innerHTML =
                `<div class="loading-box">Error while loading Summary data: ${err.message}</div>`;
        }
    }
}

function safeNumber(val) {
    if (val === null || val === undefined) return 0;
    const n = parseFloat(val.toString().replace(",", "."));
    return isNaN(n) ? 0 : n;
}

function renderSummaryForEpisode(epKey) {
    const cfg = SUMMARY_EPISODES[epKey];
    const statsContainer = document.getElementById("statistics-table");
    if (!cfg || !statsContainer) return;

    const rows = summaryRows.filter(r => {
        const name = r[SUMMARY_ARCHIVE_COL];
        return name !== null && name !== undefined && name.toString().trim() !== "";
    });

    if (!rows.length) {
        statsContainer.innerHTML =
            `<div class="loading-box">No rows in Summary for this episode.</div>`;
        return;
    }

    let bodyHtml = "";
    let totalStills = 0;
    let totalClips = 0;
    let totalFrames = 0;

    rows.forEach((r, idx) => {
        const archiveName = r[SUMMARY_ARCHIVE_COL] || "";
        const stills = safeNumber(r[cfg.stillsCol]);
        const clips = safeNumber(r[cfg.clipsCol]);
        const tcRaw = r[cfg.tcCol] || "";
        const tcStr = tcRaw ? tcRaw.toString() : "";
        const frames = tcToFrames(tcStr);

        totalStills += stills;
        totalClips += clips;
        totalFrames += frames;

        bodyHtml += `
            <tr>
                <td>${idx + 1}</td>
                <td>${archiveName}</td>
                <td>${stills}</td>
                <td>${clips}</td>
                <td class="duration-cell">${tcStr}</td>
            </tr>
        `;
    });

    const totalTc = framesToTc(totalFrames);

    statsContainer.innerHTML = `
        <div class="archive-section">
            <div class="archive-title">
                <span>${cfg.label} – Statistics</span>
                <span>${rows.length} archives</span>
            </div>
            <table class="archive-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Archive Name</th>
                        <th>Stills</th>
                        <th>Clips</th>
                        <th>Total TC</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyHtml}
                    <tr class="total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td><strong>${totalStills}</strong></td>
                        <td><strong>${totalClips}</strong></td>
                        <td><strong>${totalTc}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    renderPricingTable(totalStills);
}

function renderPricingTable(totalStills) {
    const container = document.getElementById("pricing-table");
    if (!container) return;

    container.innerHTML = `
        <table>
            <tbody>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>Total stills</td>
                    <td id="pricingTotalStills" data-stills="${totalStills}">${totalStills}</td>
                </tr>
                <tr>
                    <td>Cost per still</td>
                    <td>
                        <input id="pricingCostPerStill" type="number" min="0" step="0.01" value="0">
                    </td>
                </tr>
                <tr>
                    <td>Total stills cost</td>
                    <td id="pricingStillsCost">0.00</td>
                </tr>
                <tr>
                    <td>Extra costs</td>
                    <td>
                        <input id="pricingExtraCosts" type="number" step="0.01" value="0">
                    </td>
                </tr>
                <tr class="pricing-total-row">
                    <td>Total calculated cost</td>
                    <td id="pricingTotalCost">0.00</td>
                </tr>
            </tbody>
        </table>
    `;

    const costInput = document.getElementById("pricingCostPerStill");
    const extraInput = document.getElementById("pricingExtraCosts");
    const stillsCostEl = document.getElementById("pricingStillsCost");
    const totalCostEl = document.getElementById("pricingTotalCost");
    const stillsEl = document.getElementById("pricingTotalStills");

    const recalc = () => {
        const stills = safeNumber(stillsEl.dataset.stills || 0);
        const costPerStill = safeNumber(costInput.value || 0);
        const extra = safeNumber(extraInput.value || 0);

        const stillsCost = stills * costPerStill;
        const total = stillsCost + extra;

        stillsCostEl.textContent = stillsCost.toFixed(2);
        totalCostEl.textContent = total.toFixed(2);
    };

    costInput.addEventListener("input", recalc);
    extraInput.addEventListener("input", recalc);
}

/*************************************************
 * RAW SUMMARY VIEW
 *************************************************/
function renderRawSummary() {
    const container = document.getElementById("summary-raw");
    if (!container) return;

    if (!summaryRows.length) {
        container.innerHTML = `<div class="loading-box">No rows in Summary sheet.</div>`;
        return;
    }

    let html = "";
    summaryRows.slice(0, 120).forEach(r => {
        const name = r[SUMMARY_ARCHIVE_COL] || "";
        const clips = r["clips"] || r["Clips"] || "";
        const tc = r["total TC"] || r["Total TC"] || "";
        html += `
            <div class="summary-raw-row">
                <div class="summary-raw-label">${name}</div>
                <div class="summary-raw-value">
                    Clips: ${clips || 0} • Total TC: ${tc || ""}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/*************************************************
 * INITIALISE EVERYTHING ON LOAD
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const last = localStorage.getItem("lastPage") || "home";
    showPage(last);

    initThemeToggle();
    initArchiveUI();
    loadSidebarSheets();

    setCurrentSheetMeta(DEFAULT_META);

    initSummaryPage();
});

// за всеки случай – expose в window, ако имаш inline onclick="showPage('home')"
window.showPage = showPage;
