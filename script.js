/*************************************************
 * LIVE ARCHIVE TOOL — FINAL STABLE VERSION
 * Supports these exact sheet columns:
 * ID, inv no, FILE NAME, SOURCE IN, SOURCE OUT,
 * SOURCE DURATION, Link
 *************************************************/


/* =================================================
   PAGE ROUTER
================================================= */

function showPage(page) {
    document.querySelectorAll(".page").forEach(p => {
        p.style.display = "none";
        p.classList.remove("active");
    });

    const target = document.getElementById("page-" + page);
    if (target) {
        target.style.display = "block";
        target.classList.add("active");
    }

    document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
    const nav = document.getElementById("nav-" + page);
    if (nav) nav.classList.add("active");

    localStorage.setItem("lastPage", page);
}

document.addEventListener("DOMContentLoaded", () => {
    initArchiveUI();
    loadSidebarSheets();

    const last = localStorage.getItem("lastPage") || "home";
    showPage(last);
});


/* =================================================
   SIDEBAR: LOAD SHEETS FROM sheets-config.json
================================================= */

async function loadSidebarSheets() {
    const list = document.getElementById("sidebarSheets");
    if (!list) return;

    try {
        const r = await fetch("sheets-config.json?cache=" + Date.now());
        const data = await r.json();

        list.innerHTML = "";

        data.sheets.forEach(sheet => {
            const li = document.createElement("li");
            li.className = "sidebar-item";
            li.innerHTML = `<strong>${sheet.episode}_${sheet.name}</strong>`;

            li.onclick = () => {
                document.querySelectorAll(".sidebar-item")
                    .forEach(i => i.classList.remove("sidebar-active"));

                li.classList.add("sidebar-active");

                const input = document.getElementById("sheetUrlInput");
                input.value = sheet.url;
                connectedUrl = sheet.url;

                document.getElementById("connectStatus").textContent =
                    "Status: Ready (" + sheet.name + ")";
            };

            list.appendChild(li);
        });

    } catch (err) {
        console.error("Sidebar load error:", err);
    }
}


/* =================================================
   BUILD ARCHIVE PAGE UI
================================================= */

function initArchiveUI() {
    document.getElementById("archives-content").innerHTML = `
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
                    <input id="searchInput" type="text" placeholder="Search …">
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
            </div>
        </div>

        <div id="archiveTables" style="margin-top:25px;"></div>
    `;

    document.getElementById("btnTest").onclick = testConnection;
    document.getElementById("btnConnect").onclick = connectToSheet;
    document.getElementById("btnRefresh").onclick = refreshData;

    document.getElementById("btnApply").onclick = applyFilters;
    document.getElementById("btnReset").onclick = resetFilters;
    document.getElementById("btnCopy").onclick = copyAsTable;
}


/* =================================================
   CONNECTION + DATA LOADING
================================================= */

let connectedUrl = "";
let archiveData = [];
let filteredData = [];


function testConnection() {
    const url = document.getElementById("sheetUrlInput").value;
    if (!url) return alert("Paste your /exec URL first.");

    window.open(url, "_blank");
}

function connectToSheet() {
    const url = document.getElementById("sheetUrlInput").value.trim();
    if (!url || !url.includes("/exec")) {
        alert("Invalid Web App URL.");
        return;
    }
    connectedUrl = url;
    document.getElementById("connectStatus").textContent = "Status: Connected (Click Refresh)";
}

async function refreshData() {
    if (!connectedUrl) return alert("Connect first.");

    document.getElementById("connectStatus").textContent = "Loading…";
    document.getElementById("archiveTables").innerHTML =
        `<div class="loading-box">Loading from Google Apps Script…</div>`;

    try {
        const url = connectedUrl + "?_=" + Date.now();
        const resp = await fetch(url);
        const rows = await resp.json();

        processRows(rows);

        document.getElementById("filtersPanel").style.display = "block";
        document.getElementById("connectStatus").textContent =
            "Status: Data Loaded";

    } catch (err) {
        console.error(err);
        document.getElementById("connectStatus").textContent =
            "Error loading data";
    }
}


/* =================================================
   PROCESS DATA
================================================= */

function processRows(rows) {
    const map = new Map();

    rows.forEach(r => {
        const archive = (r.Archive || r.archive || "").trim();
        if (!archive) return;

        const id = String(r.ID || "").trim();
        const inv = String(r["inv no"] || r["Inv No"] || "").trim();
        const file = String(r["FILE NAME"] || r["File Name"] || "").trim();
        const sin = String(r["SOURCE IN"] || r["Source In"] || "").trim();
        const sout = String(r["SOURCE OUT"] || r["Source Out"] || "").trim();
        const dur = String(r["SOURCE DURATION"] || r["Duration"] || "").trim();
        const link = String(r["Link"] || r["link"] || "").trim();

        if (!map.has(archive)) map.set(archive, { name: archive, clips: [], durations: [] });

        map.get(archive).clips.push({ id, inv, file, sin, sout, dur, link });
        map.get(archive).durations.push(dur);
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

    filteredData = [...archiveData];

    buildArchiveDropdown();
    renderTables(filteredData);
}


/* =================================================
   FILTERS + SORT
================================================= */

function buildArchiveDropdown() {
    const sel = document.getElementById("filterArchive");
    sel.innerHTML = `<option value="all">All archives</option>`;
    archiveData.forEach(a => {
        const o = document.createElement("option");
        o.value = a.name;
        o.textContent = a.name;
        sel.appendChild(o);
    });
}

function applyFilters() {
    const term = document.getElementById("searchInput").value.toLowerCase();
    const arc = document.getElementById("filterArchive").value;
    const sort = document.getElementById("sortSelect").value;

    filteredData = archiveData.filter(a => {
        const matchArchive = arc === "all" || a.name === arc;
        const matchSearch =
            a.name.toLowerCase().includes(term) ||
            a.clips.some(c =>
                c.id.toLowerCase().includes(term) ||
                c.inv.toLowerCase().includes(term) ||
                c.file.toLowerCase().includes(term)
            );
        return matchArchive && matchSearch;
    });

    // sorting
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
    document.getElementById("searchInput").value = "";
    document.getElementById("filterArchive").value = "all";
    document.getElementById("sortSelect").value = "duration-desc";
    filteredData = [...archiveData];
    renderTables(filteredData);
}


/* =================================================
   TIME CODE UTILITIES
================================================= */

function tcToFrames(tc, fps = 25) {
    if (!tc) return 0;
    let [h, m, s, f] = tc.split(":").map(n => parseInt(n) || 0);
    return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

function framesToTc(frames, fps = 25) {
    if (!frames) return "00:00:00:00";
    const h = Math.floor(frames / (3600 * fps));
    const m = Math.floor((frames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((frames % (60 * fps)) / fps);
    const f = frames % fps;
    const Z = n => String(n).padStart(2, "0");
    return `${Z(h)}:${Z(m)}:${Z(s)}:${Z(f)}`;
}

function sumDurations(list) {
    const total = list.reduce((sum, tc) => sum + tcToFrames(tc), 0);
    return framesToTc(total);
}


/* =================================================
   RENDER TABLES
================================================= */

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
                            <td>${c.id}</td>
                            <td>${c.inv}</td>
                            <td style="max-width:350px; white-space:normal;">
                                ${c.file}
                            </td>
                            <td>${c.sin}</td>
                            <td>${c.sout}</td>
                            <td class="duration-cell">${c.dur}</td>
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


/* =================================================
   COPY TABLE
================================================= */

function copyAsTable() {
    const text = document.getElementById("archiveTables").innerText;
    navigator.clipboard.writeText(text);
    alert("Copied!");
}
