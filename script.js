/*************************************************
 * SIMPLE LIVE ARCHIVE TOOL – SCRIPT.JS
 * Работи с index.html и style.css от разговора
 *************************************************/


/* =========================
   PAGE ROUTER
========================= */

function showPage(page) {
    // скрий всички страници
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });

    // покажи избраната
    const target = document.getElementById("page-" + page);
    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }

    // навигация
    document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
    const nav = document.getElementById("nav-" + page);
    if (nav) nav.classList.add("active");

    localStorage.setItem("lastPage", page);
}


/* =========================
   GLOBAL STATE
========================= */

let connectedUrl = "";
let archiveData = [];     // [{name, clips:[], type, totalFrames, duration}]
let filteredData = [];


/* =========================
   HELPERS – TIMECODE
========================= */

function timecodeToFrames(tc, fps = 25) {
    if (!tc) return 0;
    const parts = tc.toString().split(":").map(x => parseInt(x, 10) || 0);
    while (parts.length < 4) parts.unshift(0); // ensure h:m:s:f
    const [h, m, s, f] = parts;
    return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

function framesToTimecode(frames, fps = 25) {
    if (!frames || frames <= 0) return "00:00:00:00";
    const h = Math.floor(frames / (3600 * fps));
    const m = Math.floor((frames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((frames % (60 * fps)) / fps);
    const f = frames % fps;
    const pad = n => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function sumTimecodes(arr, fps = 25) {
    const totalFrames = arr.reduce((sum, tc) => sum + timecodeToFrames(tc, fps), 0);
    return framesToTimecode(totalFrames, fps);
}


/* =========================
   BUILD ARCHIVE UI IN PAGE
========================= */

function initArchiveUI() {
    const container = document.getElementById("archives-content");
    if (!container) return;

    container.innerHTML = `
        <div class="connect-box">
            <h3>Connect Google Sheet</h3>
            <p>Paste your Google Apps Script Web App URL (that reads your archive sheet).</p>

            <input id="sheetUrlInput"
                   class="archive-input"
                   type="text"
                   placeholder="https://script.google.com/macros/s/.../exec">

            <div class="connect-btns">
                <button class="archive-btn secondary" id="btnTest">Test</button>
                <button class="archive-btn primary"   id="btnConnect">Connect</button>
                <button class="archive-btn secondary" id="btnRefresh">Refresh</button>
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
                    <label>View Mode</label>
                    <select id="viewMode">
                        <option value="all">Video + Stills</option>
                        <option value="video">Video only</option>
                        <option value="stills">Stills only</option>
                    </select>
                </div>

                <div class="filter-item">
                    <label>Sort By</label>
                    <select id="sortSelect">
                        <option value="duration-desc">Duration (Longest first)</option>
                        <option value="duration-asc">Duration (Shortest first)</option>
                        <option value="name-asc">Archive name (A–Z)</option>
                        <option value="name-desc">Archive name (Z–A)</option>
                        <option value="clips-desc">Clip count (Most first)</option>
                        <option value="clips-asc">Clip count (Least first)</option>
                    </select>
                </div>
            </div>

            <div class="archive-buttons">
                <button class="archive-btn primary"   id="btnApply">Apply Filters</button>
                <button class="archive-btn secondary" id="btnReset">Reset</button>
                <button class="archive-btn success"   id="btnCopy">Copy as Table</button>
                <button class="archive-btn success"   id="btnExport">Export to Excel</button>
            </div>
        </div>

        <div id="archiveTables" style="margin-top:30px;"></div>
    `;

    // hook up buttons
    document.getElementById("btnTest").onclick = testConnection;
    document.getElementById("btnConnect").onclick = connectToSheet;
    document.getElementById("btnRefresh").onclick = refreshData;
    document.getElementById("btnApply").onclick = applyFilters;
    document.getElementById("btnReset").onclick = resetFilters;
    document.getElementById("btnCopy").onclick = copyAsTable;
    document.getElementById("btnExport").onclick = exportToExcel;
}


/* =========================
   SIDEBAR: LOAD SHEETS
========================= */

async function loadSidebarSheets() {
    const list = document.getElementById("sidebarSheets");
    if (!list) return;

    try {
        const resp = await fetch("sheets-config.json?cache=" + Date.now());
        const data = await resp.json();
        if (!data || !Array.isArray(data.sheets)) return;

        list.innerHTML = "";

        data.sheets.forEach(sheet => {
            const li = document.createElement("li");
            li.className = "sidebar-item";
            li.innerHTML = `<strong>${sheet.episode}_${sheet.name}</strong>`;
            li.addEventListener("click", () => {
                // активираме визуално
                document.querySelectorAll(".sidebar-item")
                    .forEach(el => el.classList.remove("sidebar-active"));
                li.classList.add("sidebar-active");

                // слагаме URL-а в полето
                const input = document.getElementById("sheetUrlInput");
                if (input) input.value = sheet.url || "";

                // запомняме като connectedUrl
                connectedUrl = sheet.url || "";
                document.getElementById("connectStatus").textContent =
                    "Status: Ready to refresh (" + (sheet.name || "") + ")";
            });
            list.appendChild(li);
        });
    } catch (err) {
        console.error("Error loading sheets-config.json", err);
    }
}


/* =========================
   CONNECTION / FETCH
========================= */

function testConnection() {
    const url = document.getElementById("sheetUrlInput").value.trim();
    if (!url) {
        alert("Please paste your Apps Script Web App URL first.");
        return;
    }
    if (!url.includes("script.google.com") || !url.includes("/exec")) {
        alert("The URL does not look like a valid Apps Script Web App (/exec).");
        return;
    }
    window.open(url, "_blank");
}

function connectToSheet() {
    const url = document.getElementById("sheetUrlInput").value.trim();
    if (!url) {
        alert("Please paste your Apps Script Web App URL first.");
        return;
    }
    connectedUrl = url;
    document.getElementById("connectStatus").textContent = "Status: Connected (click Refresh to load)";
}

async function refreshData() {
    if (!connectedUrl) {
        alert("Please connect to a sheet first.");
        return;
    }

    document.getElementById("connectStatus").textContent = "Status: Loading data…";
    document.getElementById("archiveTables").innerHTML =
        `<div class="loading-box">Loading from Google Apps Script…</div>`;

    try {
        const url = connectedUrl + (connectedUrl.includes("?") ? "&" : "?") + "_=" + Date.now();
        const resp = await fetch(url);
        const rows = await resp.json();

        if (!Array.isArray(rows) || rows.length === 0) {
            document.getElementById("connectStatus").textContent = "Status: No data returned";
            document.getElementById("archiveTables").innerHTML =
                `<div class="loading-box">No rows received from web app.</div>`;
            return;
        }

        processRows(rows);
        document.getElementById("filtersPanel").style.display = "block";
        document.getElementById("connectStatus").textContent = "Status: Connected & data loaded";

    } catch (err) {
        console.error(err);
        document.getElementById("connectStatus").textContent =
            "Status: Error loading data (" + err.message + ")";
        document.getElementById("archiveTables").innerHTML =
            `<div class="loading-box">Error loading data. Check console.</div>`;
    }
}


/* =========================
   PROCESS SHEET ROWS
========================= */

function processRows(rows) {
    const map = new Map();

    rows.forEach(row => {
        const archive =
            (row.Archive || row.ARCHIVE || row.archive || "").toString().trim();
        if (!archive) return;

        const id = (row.ID || row.id || "").toString().trim();
        const invNo =
            (row["Inv No"] || row["inv_no"] || row.inv_no || "").toString().trim();
        const fileName =
            (row["File Name"] || row["FILE_NAME"] || row.FILE_NAME || "").toString().trim();
        const sourceIn =
            (row["Source In"] || row.SOURCE_IN || "").toString().trim();
        const sourceOut =
            (row["Source Out"] || row.SOURCE_OUT || "").toString().trim();
        const duration =
            (row.Duration || row.duration || row["Source Duration"] || row.SOURCE_DURATION || "00:00:00:00")
                .toString()
                .trim();

        if (!map.has(archive)) {
            map.set(archive, { name: archive, clips: [], allDurations: [] });
        }

        map.get(archive).clips.push({
            id, invNo, fileName, sourceIn, sourceOut, duration
        });
        map.get(archive).allDurations.push(duration);
    });

    archiveData = Array.from(map.values()).map(a => {
        const totalDuration = sumTimecodes(a.allDurations, 25);
        const totalFrames = timecodeToFrames(totalDuration, 25);
        const isStills = totalFrames === 0;
        return {
            name: a.name,
            entries: a.clips.length,
            clips: a.clips,
            duration: totalDuration,
            totalFrames,
            type: isStills ? "stills" : "video"
        };
    });

    filteredData = archiveData.slice();

    populateArchiveFilterDropdown();
    renderArchiveTables(filteredData);
    updateSummaryPanel(archiveData);
}


/* =========================
   FILTERS / SORT
========================= */

function populateArchiveFilterDropdown() {
    const select = document.getElementById("filterArchive");
    if (!select) return;

    select.innerHTML = `<option value="all">All archives</option>`;
    archiveData
        .map(a => a.name)
        .sort()
        .forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
}

function applyFilters() {
    const term = document.getElementById("searchInput").value.toLowerCase();
    const filterArchive = document.getElementById("filterArchive").value;
    const viewMode = document.getElementById("viewMode").value;
    const sortBy = document.getElementById("sortSelect").value;

    filteredData = archiveData.filter(a => {
        let okSearch =
            a.name.toLowerCase().includes(term) ||
            a.clips.some(c =>
                (c.id || "").toLowerCase().includes(term) ||
                (c.invNo || "").toLowerCase().includes(term) ||
                (c.fileName || "").toLowerCase().includes(term)
            );

        let okArchive = filterArchive === "all" || a.name === filterArchive;

        let okMode = true;
        if (viewMode === "video") okMode = a.type === "video";
        if (viewMode === "stills") okMode = a.type === "stills";

        return okSearch && okArchive && okMode;
    });

    // sort
    filteredData.sort((a, b) => {
        switch (sortBy) {
            case "duration-desc": return b.totalFrames - a.totalFrames;
            case "duration-asc":  return a.totalFrames - b.totalFrames;
            case "name-asc":      return a.name.localeCompare(b.name);
            case "name-desc":     return b.name.localeCompare(a.name);
            case "clips-desc":    return b.entries - a.entries;
            case "clips-asc":     return a.entries - b.entries;
            default:              return 0;
        }
    });

    renderArchiveTables(filteredData);
}

function resetFilters() {
    document.getElementById("searchInput").value = "";
    document.getElementById("filterArchive").value = "all";
    document.getElementById("viewMode").value = "all";
    document.getElementById("sortSelect").value = "duration-desc";
    filteredData = archiveData.slice();
    renderArchiveTables(filteredData);
}


/* =========================
   RENDER TABLES
========================= */

function renderArchiveTables(data) {
    const container = document.getElementById("archiveTables");
    if (!container) return;

    if (!data.length) {
        container.innerHTML = `<div class="loading-box">No archives match your filters.</div>`;
        return;
    }

    let html = "";

    data.forEach(archive => {
        html += `
        <div class="archive-section">
            <div class="archive-title ${archive.type === "stills" ? "stills" : ""}">
                <span>${archive.name}</span>
                <span>${archive.entries} ${archive.type === "stills" ? "stills" : "clips"} • Total: ${archive.duration}</span>
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
                    </tr>
                </thead>
                <tbody>
                    ${archive.clips
                        .map((c, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${c.id || ""}</td>
                                <td>${c.invNo || ""}</td>
                                <td>${c.fileName || ""}</td>
                                <td class="duration-cell">${c.sourceIn || ""}</td>
                                <td class="duration-cell">${c.sourceOut || ""}</td>
                                <td class="duration-cell">${c.duration || "00:00:00:00"}</td>
                            </tr>
                        `)
                        .join("")}
                    <tr class="total-row ${archive.type === "stills" ? "stills" : ""}">
                        <td colspan="6"><strong>TOTAL</strong></td>
                        <td class="duration-cell"><strong>${archive.duration}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
        `;
    });

    container.innerHTML = html;
}


/* =========================
   SUMMARY PAGE
========================= */

function updateSummaryPanel(allArchives) {
    const cards = document.getElementById("summary-cards");
    const pricing = document.getElementById("pricing-table");
    const raw = document.getElementById("summary-raw");

    if (!cards || !pricing || !raw) return;

    const videos = allArchives.filter(a => a.type === "video");
    const stills = allArchives.filter(a => a.type === "stills");

    const videoClips = videos.reduce((s, a) => s + a.entries, 0);
    const stillsCount = stills.reduce((s, a) => s + a.entries, 0);
    const totalVideoFrames = videos.reduce((s, a) => s + a.totalFrames, 0);
    const totalVideoDuration = framesToTimecode(totalVideoFrames, 25);

    cards.innerHTML = `
        <div class="summary-card">
            <div class="summary-card-title">Video Clips</div>
            <div class="summary-card-value">${videoClips}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Video Archives</div>
            <div class="summary-card-value">${videos.length}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Total Video Duration</div>
            <div class="summary-card-value">${totalVideoDuration}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Stills / Images</div>
            <div class="summary-card-value">${stillsCount}</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-title">Stills Archives</div>
            <div class="summary-card-value">${stills.length}</div>
        </div>
    `;

    // проста pricing таблица – можеш да променяш числата
    const ratePerSecond = 10; // примерно 10 EUR / секунда
    const totalSeconds = Math.round(totalVideoFrames / 25);
    const videoPrice = totalSeconds * ratePerSecond;
    const stillPrice = stillsCount * 5; // примерно 5 EUR / снимка

    pricing.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th>Estimated Price</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Video footage</td>
                    <td>${totalVideoDuration} (${totalSeconds} s)</td>
                    <td>${ratePerSecond} € / sec</td>
                    <td>${videoPrice.toLocaleString()} €</td>
                </tr>
                <tr>
                    <td>Stills / Images</td>
                    <td>${stillsCount}</td>
                    <td>5 € / image</td>
                    <td>${stillPrice.toLocaleString()} €</td>
                </tr>
                <tr class="pricing-total-row">
                    <td colspan="3">Total estimate</td>
                    <td>${(videoPrice + stillPrice).toLocaleString()} €</td>
                </tr>
            </tbody>
        </table>
    `;

    raw.innerHTML = "";
    const addRow = (label, value) => {
        const row = document.createElement("div");
        row.className = "summary-raw-row";
        row.innerHTML = `
            <div class="summary-raw-label">${label}</div>
            <div class="summary-raw-value">${value}</div>
        `;
        raw.appendChild(row);
    };

    addRow("Video Clips", videoClips);
    addRow("Video Archives", videos.length);
    addRow("Total Video Duration", totalVideoDuration);
    addRow("Stills / Images", stillsCount);
    addRow("Stills Archives", stills.length);
}


/* =========================
   COPY & EXPORT (SIMPLE)
========================= */

function copyAsTable() {
    const container = document.getElementById("archiveTables");
    if (!container) return;

    const tmp = document.createElement("div");
    tmp.innerHTML = container.innerHTML;
    tmp.style.position = "fixed";
    tmp.style.left = "-9999px";
    document.body.appendChild(tmp);

    const range = document.createRange();
    range.selectNodeContents(tmp);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    try {
        const ok = document.execCommand("copy");
        alert(ok ? "Table copied – you can paste in Word/Excel/Email." : "Copy failed");
    } catch (e) {
        alert("Copy not supported in this browser.");
    }

    sel.removeAllRanges();
    document.body.removeChild(tmp);
}

function exportToExcel() {
    alert("Excel export is not implemented in this simplified version. You can copy the table and paste into Excel.");
}


/* =========================
   DOMContentLoaded – START
========================= */

document.addEventListener("DOMContentLoaded", () => {
    // router
    const last = localStorage.getItem("lastPage") || "home";
    showPage(last);

    // archives UI + sidebar
    initArchiveUI();
    loadSidebarSheets();
});
