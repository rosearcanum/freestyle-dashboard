// =============================================
//  ICE ARENA FREESTYLE DASHBOARD — script.js
// =============================================

// -------  CONFIGURATION  -------
const API_KEY        = 'AIzaSyBypFcSsyYeFzmIMsYSGuL22MU7Mvr-npc';
const SPREADSHEET_ID = '18kC_kfghnpjap9y5FXd79ikmzDIOdtNOgI89uWZ5uHo';
const SHEET_NAME     = '1st';
const DATA_RANGE     = 'B3:F100';
const REFRESH_MS     = 60 * 1000;

const WARN_MINUTES   = 10;
const URGENT_MINUTES = 5;

let refreshTimer    = null;
let countdownTimer  = null;
let nextRefreshSecs = REFRESH_MS / 1000;

document.addEventListener('DOMContentLoaded', () => {
    startClock();
    fetchData();
    startRefreshCycle();
});

function startClock() {
    function tick() {
        const el = document.getElementById('live-clock');
        if (el) el.textContent = formatTime12(new Date());
    }
    tick();
    setInterval(tick, 1000);
}

function startRefreshCycle() {
    nextRefreshSecs = REFRESH_MS / 1000;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        nextRefreshSecs--;
        const el = document.getElementById('stat-refresh');
        if (el) el.textContent = nextRefreshSecs > 0 ? nextRefreshSecs + 's' : '...';
        if (nextRefreshSecs <= 0) nextRefreshSecs = REFRESH_MS / 1000;
    }, 1000);

    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        fetchData();
        nextRefreshSecs = REFRESH_MS / 1000;
    }, REFRESH_MS);
}

async function fetchData() {
    setStatus('connecting');
    const range = encodeURIComponent(SHEET_NAME) + '!' + DATA_RANGE;
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const rows = data.values || [];
        renderTable(rows);
        setStatus('live');
        updateLastRefreshed();
    } catch (e) {
        console.error('Fetch error:', e);
        setStatus('error');
        showError(e.message);
    }
}

function renderTable(rows) {
    const tbody = document.getElementById('skater-tbody');
    const skaters = rows.filter(r => r && r[0] && r[0].trim() !== '');

    if (skaters.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6"><div class="empty-msg">— NO SKATERS ON ICE —</div></td>
            </tr>`;
        updateStats(0, 0);
        return;
    }

    const now = new Date();

    // Google Sheets returns each row as a plain array: [B, C, D, E, F]
    let skaterData = skaters.map(row => {
        const name     = row[0] || '—';   // Col B — Skater's Name
        const duration = row[1] || '—';   // Col C — Duration
        const timeOn   = row[2] || '';    // Col D — Time On
        const timeOff  = row[3] || '';    // Col E — Time Off
        const coach    = row[4] || '—';   // Col F — Coach's Name

        const timeOffDate  = parseTime(timeOff);
        const remainingMs  = timeOffDate ? (timeOffDate - now) : null;
        const remainingMin = remainingMs !== null ? remainingMs / 60000 : null;

        return { name, duration, timeOn, timeOff, coach, timeOffDate, remainingMin };
    });

    skaterData.sort((a, b) => {
        if (a.timeOffDate && b.timeOffDate) return a.timeOffDate - b.timeOffDate;
        if (a.timeOffDate) return -1;
        if (b.timeOffDate) return  1;
        return 0;
    });

    const urgentCount = skaterData.filter(s =>
        s.remainingMin !== null && s.remainingMin >= 0 && s.remainingMin <= URGENT_MINUTES
    ).length;
    updateStats(skaterData.length, urgentCount);

    tbody.innerHTML = skaterData.map((s, i) => {
        const { urgencyClass, rowClass, label } = getUrgency(s.remainingMin);
        return `
        <tr class="${rowClass}" style="animation-delay:${i * 0.05}s">
            <td class="td-name">${escHtml(s.name)}</td>
            <td class="td-coach">${escHtml(s.coach)}</td>
            <td class="td-duration">${escHtml(s.duration)}</td>
            <td class="td-time">${formatTimeStr(s.timeOn)}</td>
            <td class="td-timeout">${formatTimeStr(s.timeOff)}</td>
            <td class="td-remaining ${urgencyClass}" data-timeout="${s.timeOffDate ? s.timeOffDate.getTime() : ''}">${label}</td>
        </tr>`;
    }).join('');

    startCountdownTick();
}

let tickInterval = null;
function startCountdownTick() {
    clearInterval(tickInterval);
    tickInterval = setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    const now = new Date();
    const cells = document.querySelectorAll('.td-remaining[data-timeout]');
    cells.forEach(cell => {
        const ts = parseInt(cell.dataset.timeout);
        if (!ts) return;
        const remainingMin = (ts - now.getTime()) / 60000;
        const { urgencyClass, rowClass, label } = getUrgency(remainingMin);
        cell.textContent = label;
        cell.className = `td-remaining ${urgencyClass}`;
        const row = cell.closest('tr');
        if (row) row.className = rowClass;
    });

    const urgentCount = Array.from(cells).filter(c => {
        const ts = parseInt(c.dataset.timeout);
        if (!ts) return false;
        const m = (ts - now.getTime()) / 60000;
        return m >= 0 && m <= URGENT_MINUTES;
    }).length;
    const el = document.getElementById('stat-urgent');
    if (el) el.textContent = urgentCount;
}

function getUrgency(remainingMin) {
    if (remainingMin === null) return { urgencyClass: '', rowClass: '', label: '—' };
    if (remainingMin < 0)      return { urgencyClass: 'expired', rowClass: '', label: 'TIME EXPIRED' };
    const label = formatCountdown(remainingMin);
    if (remainingMin <= URGENT_MINUTES) return { urgencyClass: 'urgent',  rowClass: 'row-urgent',  label };
    if (remainingMin <= WARN_MINUTES)   return { urgencyClass: 'warning', rowClass: 'row-warning', label };
    return { urgencyClass: 'ok', rowClass: '', label };
}

function parseTime(str) {
    if (!str || str.trim() === '') return null;
    str = str.trim();
    const now = new Date();

    const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
        let h = parseInt(match12[1]);
        const m = parseInt(match12[2]);
        const ampm = match12[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    }

    const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            parseInt(match24[1]), parseInt(match24[2]), 0, 0);
    }

    return null;
}

function formatTime12(date) {
    let h = date.getHours();
    const m    = String(date.getMinutes()).padStart(2, '0');
    const s    = String(date.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m}:${s} ${ampm}`;
}

function formatTimeStr(str) {
    return (!str || str.trim() === '') ? '—' : str.trim();
}

function formatCountdown(minutes) {
    const totalSecs = Math.floor(minutes * 60);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function setStatus(state) {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;
    dot.className = 'status-dot';
    if (state === 'live')       { dot.classList.add('live');  text.textContent = 'LIVE'; }
    else if (state === 'error') { dot.classList.add('error'); text.textContent = 'ERROR'; }
    else                        { text.textContent = 'CONNECTING...'; }
}

function showError(msg) {
    const tbody = document.getElementById('skater-tbody');
    if (tbody) tbody.innerHTML = `
        <tr class="empty-row">
            <td colspan="6">
                <div class="empty-msg">⚠ ERROR LOADING DATA<br>
                <span style="font-size:0.65rem;opacity:0.6;">${escHtml(msg)}</span></div>
            </td>
        </tr>`;
}

function updateStats(total, urgent) {
    const t = document.getElementById('stat-total');
    const u = document.getElementById('stat-urgent');
    if (t) t.textContent = total;
    if (u) u.textContent = urgent;
}

function updateLastRefreshed() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = `LAST UPDATED: ${formatTime12(new Date())}`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
