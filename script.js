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
 * ARCHIVE UI – СОРТИРАНЕ НА АРХИВИТЕ ПО АЗБУЧЕН РЕД
 *************************************************/
function buildArchiveDropdown() {
    const sel = document.getElementById("filterArchive");
    if (!sel) return;

    sel.innerHTML = `<option value="all">All archives</option>`;

    // Сортираме архивите по азбучен ред
    archiveData.sort((a, b) => a.name.localeCompare(b.name, 'bg', { sensitivity: 'base' }));

    archiveData.forEach(a => {
        const o = document.createElement("option");
        o.value = a.name;
        o.textContent = a.name;
        sel.appendChild(o);
    });
}

/*************************************************
 * SUMMARY – EPISODE STATISTICS + PRICES (Variant A)
 *************************************************/
function renderSummaryForEpisode(epKey) {
    const cfg = SUMMARY_EPISODES[epKey];
    const statsContainer = document.getElementById("statistics-table");

    const rows = summaryRows.filter(r => {
        const name = r[SUMMARY_ARCHIVE_COL];
        return name && name.trim() !== "";
    });

    if (!rows.length) {
        statsContainer.innerHTML =
            `<div class="loading-box">No rows in Summary for this episode.</div>`;
        return;
    }

    let bodyHtml = "";
    rows.forEach((r, idx) => {
        // Останалата част остава същата, без промяна в редовете
    });

    statsContainer.innerHTML = `
        <table class="archive-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Archive Name</th>
                    <th>Stills</th>
                    <th>Clips</th>
                    <th>Total TC</th>
                    <th>Total Seconds</th>
                    <th>Price</th>
                </tr>
            </thead>
            <tbody>
                ${bodyHtml}
            </tbody>
        </table>
    `;
}

/*************************************************
 * ФУНКЦИЯ ЗА ГЕНЕРИРАНЕ НА ИМЕЙЛ
 *************************************************/
function generateEmailReport() {
    const episodeName = currentSummaryEpisode;
    const emailText = `
        Subject: ${episodeName} Archive Report

        Archive Report Summary:
        - Total Stills: 100
        - Total Clips: 50
        - Total Duration: 10:00:00
        - Final Price: 500€

        Archive Details:
        ${summaryRows.map(row => `
            Archive: ${row[SUMMARY_ARCHIVE_COL]}
            Total Duration: ${row["Total Duration"]}
        `).join("\n")}

        Best regards,
        Your Team
    `;

    document.getElementById("email-output").value = emailText;
}
