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

/* ---------- On load ---------- */
window.addEventListener("DOMContentLoaded", () => {
    const last = localStorage.getItem('lastPage') || 'home';
    showPage(last);
});
