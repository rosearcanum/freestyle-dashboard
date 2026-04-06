// =============================================
//  ICE ARENA FREESTYLE DASHBOARD — script.js
// =============================================

const API_KEY        = 'AIzaSyBypFcSsyYeFzmIMsYSGuL22MU7Mvr-npc';
const SPREADSHEET_ID = '18kC_kfghnpjap9y5FXd79ikmzDIOdtNOgI89uWZ5uHo';
const DATA_RANGE     = 'B3:F100';
const REFRESH_MS     = 60 * 1000;

const WARN_MINUTES   = 10;
const URGENT_MINUTES = 5;

let refreshTimer    = null;
let countdownTimer  = null;
let nextRefreshSecs = REFRESH_MS / 1000;
let tickInterval    = null;
let allSkaterData   = [];

// ---- GET TODAY'S SHEET TAB NAME ----
function getTodaySheetName() {
    const day = new Date().getDate();
    if (day === 1)  return '1st';
    if (day === 2)  return '2nd';
    if (day === 3)  return '3rd';
    if (day === 4)  return '4th';
    if (day === 5)  return '5th';
    if (day === 6)  return '6th';
    if (day === 7)  return '7th';
    if (day === 8)  return '8th';
    if (day === 9)  return '9th';
    if (day === 10) return '10th';
    if (day === 11) return '11th';
    if (day === 12) return '12th';
    if (day === 13) return '13th';
    if (day === 14) return '14th';
    if (day === 15) return '15th';
    if (day === 16) return '16th';
    if (day === 17) return '17th';
    if (day === 18) return '18th';
    if (day === 19) return '19th';
    if (day === 20) return '20th';
    if (day === 21) return '21st';
    if (day === 22) return '22nd';
    if (day === 23) return '23rd';
    if (day === 24) return '24th';
    if (day === 25) return '25th';
    if (day === 26) return '26th';
    if (day === 27) return '27th';
    if (day === 28) return '28th';
    if (day === 29) return '29th';
    if (day === 30) return '30th';
    if (day === 31) return '31st';
}

window.addEventListener('load', () => {
    startClock();
    fetchData();
    startRefreshCycle();
});

// ---- CLOCK ----
function startClock() {
    function tick() {
        const el = document.getElementById('live-clock');
        if (el) el.textContent = formatTime12(new Date());
    }
    tick();
    setInterval(tick, 1000);
}

// ---- AUTO REFRESH ----
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

// ---- FETCH ----
async function fetchData() {
    setStatus('connecting');

    const sheetName = getTodaySheetName();
    const range     = encodeURIComponent(sheetName) + '!' + DATA_RANGE;
    const url       = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;

    // Update footer to show which tab is being read
    const tabEl = document.getElementById('sheet-tab');
    if (tabEl) tabEl.textContent = `Sheet: ${sheetName}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            // If sheet tab doesn't exist yet, show friendly message
            if (err?.error?.code === 400 || err?.error?.code === 404) {
                throw new Error(`No sheet tab found for today ("${sheetName}"). Create it in Google Sheets to get started.`);
            }
            throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        processRows(data.values || []);
        setStatus('live');
        updateLastRefreshed();
    } catch (e) {
        console.error('Fetch error:', e);
        setStatus('error');
        showError(e.message);
    }
}

// ---- PROCESS ROWS ----
function processRows(rows) {
    const skaters = rows.filter(r => r && r[0] && r[0].trim() !== '');

    allSkaterData = skaters.map(row => {
        const name     = row[0] || '—';
        const duration = row[1] || '—';
        const timeOn   = row[2] || '';
        const timeOff  = row[3] || '';
        const coach    = row[4] || '—';

        const timeOnDate  = parseTime(timeOn);
        const timeOffDate = parseTime(timeOff);

        return { name, duration, timeOn, timeOff, coach, timeOnDate, timeOffDate };
    });

    renderVisible();
}

// ---- RENDER ----
function renderVisible() {
    const tbody = document.getElementById('skater-tbody');
    const now   = new Date();

    let visible = allSkaterData.filter(s => {
        const started = s.timeOnDate && s.timeOnDate <= now;
        const notOver = !s.timeOffDate || s.timeOffDate > now;
        return started && notOver;
    });

    if (visible.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-msg">No skaters currently on ice</div></td></tr>`;
        updateStats(0, 0);
        return;
    }

    visible.sort((a, b) => {
        if (a.timeOffDate && b.timeOffDate) return a.timeOffDate - b.timeOffDate;
        if (a.timeOffDate) return -1;
        if (b.timeOffDate) return  1;
        return 0;
    });

    const urgentCount = visible.filter(s => {
        if (!s.timeOffDate) return false;
        return (s.timeOffDate - now) / 60000 <= WARN_MINUTES;
    }).length;
    updateStats(visible.length, urgentCount);

    tbody.innerHTML = visible.map((s, i) => {
        const remainingMin = s.timeOffDate ? (s.timeOffDate - now) / 60000 : null;
        const { urgencyClass, rowClass, label } = getUrgency(remainingMin);
        return `
        <tr class="${rowClass}" style="animation-delay:${i * 0.05}s"
            data-timeout="${s.timeOffDate ? s.timeOffDate.getTime() : ''}"
            data-timeon="${s.timeOnDate ? s.timeOnDate.getTime() : ''}">
            <td class="td-name">${escHtml(s.name)}</td>
            <td class="td-coach">${escHtml(s.coach)}</td>
            <td class="td-duration">${escHtml(s.duration)}</td>
            <td class="td-time">${formatTimeStr(s.timeOn)}</td>
            <td class="td-timeout">${formatTimeStr(s.timeOff)}</td>
            <td class="td-remaining ${urgencyClass}"
                data-timeout="${s.timeOffDate ? s.timeOffDate.getTime() : ''}">${label}</td>
        </tr>`;
    }).join('');

    startCountdownTick();
}

// ---- LIVE TICK ----
function startCountdownTick() {
    clearInterval(tickInterval);
    tickInterval = setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    const now = new Date();

    // Check if any skater just became active
    const anyNewlyActive = allSkaterData.some(s => {
        const started  = s.timeOnDate && s.timeOnDate <= now;
        const notOver  = !s.timeOffDate || s.timeOffDate > now;
        const inTable  = document.querySelector(`#skater-tbody tr[data-timeon="${s.timeOnDate ? s.timeOnDate.getTime() : ''}"]`);
        return started && notOver && !inTable;
    });
    if (anyNewlyActive) { renderVisible(); return; }

    const rows = document.querySelectorAll('#skater-tbody tr[data-timeout]');
    let urgentCount = 0;
    let toRemove = [];

    rows.forEach(row => {
        const ts = parseInt(row.dataset.timeout);
        if (!ts) return;
        const remainingMin = (ts - now.getTime()) / 60000;

        if (remainingMin <= 0) { toRemove.push(row); return; }

        const { urgencyClass, rowClass, label } = getUrgency(remainingMin);
        const cell = row.querySelector('.td-remaining');
        if (cell) { cell.textContent = label; cell.className = `td-remaining ${urgencyClass}`; }
        row.className = rowClass;
        if (remainingMin <= WARN_MINUTES) urgentCount++;
    });

    toRemove.forEach(row => {
        row.style.transition = 'opacity 0.7s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 700);
    });

    const remaining = rows.length - toRemove.length;
    const totalEl  = document.getElementById('stat-total');
    const urgentEl = document.getElementById('stat-urgent');
    if (totalEl)  totalEl.textContent  = Math.max(0, remaining);
    if (urgentEl) urgentEl.textContent = urgentCount;
}

// ---- URGENCY ----
function getUrgency(remainingMin) {
    if (remainingMin === null) return { urgencyClass: '',        rowClass: '',            label: '—' };
    if (remainingMin <= 0)     return { urgencyClass: 'expired', rowClass: '',            label: 'TIME EXPIRED' };
    const label = formatCountdown(remainingMin);
    if (remainingMin <= URGENT_MINUTES) return { urgencyClass: 'urgent',  rowClass: 'row-urgent',  label };
    if (remainingMin <= WARN_MINUTES)   return { urgencyClass: 'warning', rowClass: 'row-warning', label };
    return { urgencyClass: 'ok', rowClass: '', label };
}

// ---- TIME PARSING ----
function parseTime(str) {
    if (!str || str.trim() === '') return null;
    str = str.trim();
    const now = new Date();

    const m12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
        let h = parseInt(m12[1]);
        const m = parseInt(m12[2]);
        const ap = m12[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    }

    const m24 = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            parseInt(m24[1]), parseInt(m24[2]), 0, 0);
    }

    return null;
}

// ---- FORMATTING ----
function formatTime12(date) {
    let h = date.getHours();
    const m  = String(date.getMinutes()).padStart(2, '0');
    const s  = String(date.getSeconds()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m}:${s} ${ap}`;
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

// ---- STATUS ----
function setStatus(state) {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;
    dot.className = 'status-dot';
    if (state === 'live')       { dot.classList.add('live');  text.textContent = 'Live'; }
    else if (state === 'error') { dot.classList.add('error'); text.textContent = 'Error'; }
    else                        { text.textContent = 'Connecting...'; }
}

function showError(msg) {
    const tbody = document.getElementById('skater-tbody');
    if (tbody) tbody.innerHTML = `
        <tr class="empty-row"><td colspan="6">
            <div class="empty-msg">${escHtml(msg)}</div>
        </td></tr>`;
}

function updateStats(total, urgent) {
    const t = document.getElementById('stat-total');
    const u = document.getElementById('stat-urgent');
    if (t) t.textContent = total;
    if (u) u.textContent = urgent;
}

function updateLastRefreshed() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = `Last updated: ${formatTime12(new Date())}`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
