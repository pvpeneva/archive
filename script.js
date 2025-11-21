/* ---------------------------------------------
   PAGE ROUTER – switch between pages
--------------------------------------------- */
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });

    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + page);
    if (activeNav) activeNav.classList.add('active');

    localStorage.setItem('lastPage', page);
}

document.addEventListener("DOMContentLoaded", () => {
    const last = localStorage.getItem('lastPage') || 'home';
    showPage(last);
    loadSidebarSheets();
});


/* ---------------------------------------------
   LOAD SIDEBAR SHEETS FROM sheets-config.json
--------------------------------------------- */
async function loadSidebarSheets() {
    try {
        const response = await fetch("sheets-config.json");
        const data = await response.json();

        const list = document.getElementById("sidebarSheets");
        list.innerHTML = "";

        data.sheets.forEach(sheet => {
            const li = document.createElement("li");
            li.classList.add("sidebar-item");
            li.innerHTML = `<strong>${sheet.episode}_${sheet.name}</strong>`;

            li.onclick = () => {
                document.getElementById("sheetUrlInput")?.focus();

                // Insert URL in input field
                if (document.getElementById("sheetUrlInput")) {
                    document.getElementById("sheetUrlInput").value = sheet.url;
                }

                document.querySelectorAll(".sidebar-item")
                    .forEach(i => i.classList.remove("sidebar-active"));

                li.classList.add("sidebar-active");
            };

            list.appendChild(li);
        });
    } catch (e) {
        console.error("Sidebar load error:", e);
    }
}


/* ---------------------------------------------
   ARCHIVE SYSTEM ENGINE
--------------------------------------------- */
let archiveData = [];
let filteredData = [];
let connectedUrl = "";
let autoRefreshTimer = null;


/* Inject dynamic UI into Archives tab */
function initArchiveUI() {
    document.getElementById("archives-content").innerHTML = `
        <div class="connect-box">

            <h3>Connect Google Sheet</h3>

            <input id="sheetUrlInput" 
                   class="archive-input"
                   type="text"
                   placeholder="Paste your Google Apps Script Web App URL (must end with /exec)">
            
            <div class="connect-btns">
                <button class="archive-btn secondary" onclick="testConnection()">Test</button>
                <button class="archive-btn primary" onclick="connectToSheet()">Connect</button>
                <button class="archive-btn secondary" onclick="refreshData()">Refresh</button>
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
                    <select id="filterArchive"><option value="all">All archives</option></select>
                </div>

                <div class="filter-item">
                    <label>View Mode</label>
                    <select id="viewMode">
                        <option value="all">Video + Stills</option>
                        <option value="video">Video Only</option>
                        <option value="stills">Stills Only</option>
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
                <button class="archive-btn primary" onclick="applyFilters()">Apply Filters</button>
                <button class="archive-btn secondary" onclick="resetFilters()">Reset</button>
                <button class="archive-btn success" onclick="copyAsTable()">Copy as Table</button>
                <button class="archive-btn success" onclick="exportToExcel()">Export to Excel</button>
            </div>
        </div>

        <div id="archiveTables"></div>
    `;
}

initArchiveUI();


/* ---------------------------------------------
   TEST CONNECTION
--------------------------------------------- */
function testConnection() {
    const url = document.getElementById("sheetUrlInput").value;
    if (!url.includes("/exec")) {
        alert("URL must end with /exec");
        return;
    }
    window.open(url, "_blank");
}


/* ---------------------------------------------
    CONNECT TO SHEET
--------------------------------------------- */
function connectToSheet() {
    const url = document.getElementById("sheetUrlInput").value.trim();
    if (!url || !url.includes("/exec")) {
        alert("Please enter a valid Apps Script Web App URL.");
        return;
    }
    connectedUrl = url;

    document.getElementById("connectStatus").innerHTML = "Status: Connecting…";
    refreshData();
}


/* ---------------------------------------------
    FETCH DATA FROM GOOGLE SHEET
--------------------------------------------- */
async function refreshData() {
    if (!connectedUrl) {
        alert("Connect first.");
        return;
    }

    try {
        const response = await fetch(connectedUrl + "?_=" + Date.now());
        const rows = await response.json();

        document.getElementById("connectStatus").innerHTML =
            "Status: Connected & data loaded";

        processData(rows);

        document.getElementById("filtersPanel").style.display = "block";

    } catch (e) {
        console.error(e);
        document.getElementById("connectStatus").innerHTML =
            "Status: Error loading data";
    }
}


/* ---------------------------------------------
   PROCESS DATA → BUILD ARCHIVE STRUCTURE
--------------------------------------------- */
function processData(rows) {
    const map = new Map();

    rows.forEach(row => {
        const archive = (row.Archive || row.ARCHIVE || "").trim();
        if (!archive) return;

        if (!map.has(archive))
            map.set(archive, { name: archive, clips: [], durations: [] });

        map.get(archive).clips.push(row);
        map.get(archive).durations.push(row.Duration || row.duration || "00:00:00:00");
    });

    archiveData = Array.from(map.values());
    filteredData = archiveData;

    buildArchiveFilter();
    renderTables(filteredData);
}


/* ---------------------------------------------
   ARCHIVE FILTER
--------------------------------------------- */
function buildArchiveFilter() {
    const select = document.getElementById("filterArchive");
    select.innerHTML = `<option value="all">All archives</option>`;

    archiveData.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.name;
        opt.textContent = a.name;
        select.appendChild(opt);
    });
}


/* ---------------------------------------------
   APPLY FILTERS
--------------------------------------------- */
function applyFilters() {
    const term = document.getElementById("searchInput").value.toLowerCase();
    const archiveName = document.getElementById("filterArchive").value;
    const mode = document.getElementById("viewMode").value;
    const sort = document.getElementById("sortSelect").value;

    filteredData = archiveData.filter(a => {
        let okSearch =
            a.name.toLowerCase().includes(term) ||
            a.clips.some(c =>
                (c.ID || "").toLowerCase().includes(term) ||
                (c["File Name"] || "").toLowerCase().includes(term)
            );

        let okArchive = archiveName === "all" || archiveName === a.name;

        let okMode = true;
        if (mode === "video") okMode = !a.name.toLowerCase().includes("still");
        if (mode === "stills") okMode = a.name.toLowerCase().includes("still");

        return okSearch && okArchive && okMode;
    });

    renderTables(filteredData);
}


/* ---------------------------------------------
   RESET
--------------------------------------------- */
function resetFilters() {
    document.getElementById("searchInput").value = "";
    document.getElementById("filterArchive").value = "all";
    document.getElementById("viewMode").value = "all";
    document.getElementById("sortSelect").value = "duration-desc";

    filteredData = archiveData;
    renderTables(filteredData);
}


/* ---------------------------------------------
   RENDER ARCHIVE TABLES
--------------------------------------------- */
function renderTables(data) {
    const container = document.getElementById("archiveTables");
    if (!data.length) {
        container.innerHTML = `<div class="loading-box">No results.</div>`;
        return;
    }

    let html = "";

    data.forEach(a => {
        html += `
        <div class="archive-section">
            <div class="archive-title">
                ${a.name}
                <span>${a.clips.length} clips</span>
            </div>

            <table class="archive-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Inv No</th>
                        <th>File</th>
                        <th>Source In</th>
                        <th>Source Out</th>
                        <th>Duration</th>
                    </tr>
                </thead>

                <tbody>
                    ${a.clips
                        .map(
                            (c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${c.ID || ""}</td>
                            <td>${c["Inv No"] || c.inv_no || ""}</td>
                            <td>${c["File Name"] || ""}</td>
                            <td>${c["Source In"] || ""}</td>
                            <td>${c["Source Out"] || ""}</td>
                            <td class="duration-cell">${c.Duration || "00:00:00:00"}</td>
                        </tr>`
                        )
                        .join("")}
                </tbody>
            </table>
        </div>
        `;
    });

    container.innerHTML = html;
}


/* ---------------------------------------------
   COPY AS TABLE
--------------------------------------------- */
function copyAsTable() {
    const html = document.getElementById("archiveTables").innerHTML;

    navigator.clipboard.writeText(html.replace(/<[^>]*>/g, ""))
        .then(() => alert("Copied!"))
        .catch(() => alert("Copy failed"));
}


/* ---------------------------------------------
   EXPORT TO EXCEL
--------------------------------------------- */
function exportToExcel() {
    alert("Excel export can be added later. Function placeholder.");
}
