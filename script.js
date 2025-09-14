import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2FZJqQe3wC6o9gAQpB1rVIWeWn_CHlmY",
    authDomain: "stringer-5536f.firebaseapp.com",
    databaseURL: "https://stringer-5536f-default-rtdb.firebaseio.com",
    projectId: "stringer-5536f",
    storageBucket: "stringer-5536f.appspot.com",
    messagingSenderId: "1040463002354",
    appId: "1:1040463002354:web:78faa9f323328d965b2e6b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'production-dashboard-html-app';

const AUTHORIZED_USERS = [
    'yashdeep242002@gmail.com',
    'yashdeep.tyagi@avaada.com',
    'abhishek.yadav2@avaada.com',
    'dharmendra.maurya@avaada.com',
    'v.siba@avaada.com',
    'pappu.kumar@avaada.com',
   	'rajesh.ray@avaada.com',
    'shivam.sharma@avaada.com',
    'control.dadriproduction@avaada.com'
    
];

let isDashboardInitialized = false;
let productionChartClickHandler = null;
let productionChart, stringerChart, breakdownReasonChart, downtimeChart, unsubscribe, loadingTimeout;
let currentProductionData = null;

const DOM = {
    currentTime: document.getElementById('current-time'),
    dateSelector: document.getElementById('date-selector'),
    shiftSelector: document.getElementById('shift-selector'),
    resetButton: document.getElementById('reset-button'),
    summarySection: document.getElementById('summary-section'),
    stringerGrid: document.getElementById('stringer-grid'),
    submitButton: document.getElementById('submit-button'),
    submitMessage: document.getElementById('submit-message'),
    detailsTableContainer: document.getElementById('details-table-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    messageArea: document.getElementById('message-area'),
    dashboardContent: document.getElementById('dashboard-content'),
    editModal: document.getElementById('edit-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    productionChartCanvas: document.getElementById('productionChart'),
    stringerChartCanvas: document.getElementById('stringerChart'),
    breakdownReasonChartCanvas: document.getElementById('breakdownReasonChart'),
    downtimeChartCanvas: document.getElementById('downtimeChart'),
    loginModal: document.getElementById('login-modal'),
    googleLoginButton: document.getElementById('google-login-button'),
    authStatus: document.getElementById('auth-status'),
};

function updateClock() {
    const now = new Date();
    DOM.currentTime.textContent = now.toLocaleString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}

function toggleEditFeatures(isEditable) {
    const editElements = document.querySelectorAll('.edit-col');
    const liveEntrySection = document.getElementById('live-input-section');
    const chartClickMessage = DOM.productionChartCanvas.parentElement.querySelector('.text-sm');
    const productionChartCanvas = document.getElementById('productionChart');

    if (isEditable) {
        if (liveEntrySection) liveEntrySection.style.display = 'block';
        editElements.forEach(el => el.style.display = 'table-cell');
        if (chartClickMessage) chartClickMessage.style.display = 'block';
        if (productionChartCanvas) productionChartCanvas.classList.add('is-editable');

        if (!productionChartClickHandler) {
            productionChartClickHandler = (event) => {
                const activePoints = productionChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
                if (activePoints.length > 0) {
                    openEditModal(activePoints[0].index);
                }
            };
            DOM.productionChartCanvas.addEventListener('click', productionChartClickHandler);
        }
    } else {
        if (liveEntrySection) liveEntrySection.style.display = 'none';
        editElements.forEach(el => el.style.display = 'none');
        if (chartClickMessage) chartClickMessage.style.display = 'none';
        if (productionChartCanvas) productionChartCanvas.classList.remove('is-editable');

        if (productionChartClickHandler) {
            DOM.productionChartCanvas.removeEventListener('click', productionChartClickHandler);
            productionChartClickHandler = null;
        }
        DOM.editModal.classList.add('hidden');
    }
}

async function handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        DOM.loginModal.style.display = 'none';
    } catch (error) {
        console.error("Google Sign-In failed:", error);
        alert("Could not sign in with Google. Please try again.");
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

function getShiftInfo(date) {
    const hour = date.getHours();
    let shift;
    if (hour >= 6 && hour < 14) {
        shift = 1;
    } else if (hour >= 14 && hour < 22) {
        shift = 2;
    } else {
        shift = 3;
    }
    const dateString = date.toISOString().split('T')[0];
    return { shift, dateString };
}

function getShiftHours(shift) {
    if (shift === 1) return [7, 8, 9, 10, 11, 12, 13, 14];
    if (shift === 2) return [15, 16, 17, 18, 19, 20, 21, 22];
    if (shift === 3) return [23, 0, 1, 2, 3, 4, 5, 6];
    return [];
}

function keyToHour(key) {
    if (key.startsWith('_')) return parseInt(key.slice(1), 10);
    return parseInt(key, 10);
}

function getEmptyShiftData(shift, dateString) {
    const hours = getShiftHours(shift);
    let hourlyData = {};
    const stringerTemplate = {};
    for (let i = 1; i <= 6; i++) {
        stringerTemplate[i] = { ok: 0, ng: 0, breakdownReason: 'None', breakdownTime: 0 };
    }
    hours.forEach(hour => {
        hourlyData[hour.toString()] = {
            hour,
            stringers: JSON.parse(JSON.stringify(stringerTemplate))
        };
    });
    return {
        shift,
        date: dateString,
        hourlyData
    };
}

function mergeWithEmptyShift(shift, dateString, firestoreData) {
    const emptyData = getEmptyShiftData(shift, dateString);
    const result = { ...firestoreData.hourlyData || {} };
    Object.keys(emptyData.hourlyData).forEach(hourKey => {
        if (!result[hourKey]) {
            result[hourKey] = emptyData.hourlyData[hourKey];
        } else {
            if (result[hourKey].hour === undefined) {
                result[hourKey].hour = keyToHour(hourKey);
            }
            for (let i = 1; i <= 6; i++) {
                if (!result[hourKey].stringers[i]) {
                    result[hourKey].stringers[i] = { ok: 0, ng: 0 };
                }
                if (result[hourKey].stringers[i].breakdownReason === undefined) {
                    result[hourKey].stringers[i].breakdownReason = 'None';
                }
                if (result[hourKey].stringers[i].breakdownTime === undefined) {
                    result[hourKey].stringers[i].breakdownTime = 0;
                }
            }
        }
    });
    Object.keys(result).forEach(hourKey => {
        if (result[hourKey].hour === undefined) {
            result[hourKey].hour = keyToHour(hourKey);
        }
    });
    return {
        ...firestoreData,
        shift,
        date: dateString,
        hourlyData: result
    };
}

function normalizeHourlyDataWithKeys(hourlyData, shift) {
    if (!hourlyData || typeof hourlyData !== "object") return [];
    const hoursOrder = getShiftHours(shift);
    const arr = Object.entries(hourlyData)
        .map(([key, value]) => ({ ...value, _key: key, hour: value.hour !== undefined ? value.hour : keyToHour(key) }));
    return arr.sort((a, b) => {
        const ai = hoursOrder.indexOf(a.hour);
        const bi = hoursOrder.indexOf(b.hour);
        return ai - bi;
    });
}

function renderStringerCards() {
    let html = '';
    const breakdownReasons = ['None', 'Ribbon Drop', 'Cell Crack', 'High CCD NG', 'Cell cutting issue', 'Robot issue', 'RMA', 'Other'];
    for (let i = 1; i <= 6; i++) {
        html += `
        <div class="p-3 stringer-card rounded-lg">
            <h4 class="font-bold text-md text-blue-800 mb-2">Stringer #${i}</h4>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label for="live-ok-s${i}" class="text-sm text-gray-600">OK</label>
                    <input type="number" id="live-ok-s${i}" class="w-full p-2 text-center rounded-md">
                </div>
                <div>
                    <label for="live-ng-s${i}" class="text-sm text-gray-600">NG</label>
                    <input type="number" id="live-ng-s${i}" class="w-full p-2 text-center rounded-md">
                </div>
            </div>
            <div class="mt-3 space-y-2">
                 <div>
                    <label for="live-br-reason-s${i}" class="text-sm text-gray-600">Breakdown Reason</label>
                    <select id="live-br-reason-s${i}" class="w-full p-2 rounded-md text-sm">
                        ${breakdownReasons.map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <input type="text" id="live-br-other-s${i}" placeholder="Specify other reason" class="w-full p-2 rounded-md text-sm hidden">
                </div>
                <div>
                    <label for="live-br-time-s${i}" class="text-sm text-gray-600">Breakdown Time (mins)</label>
                    <input type="number" id="live-br-time-s${i}" class="w-full p-2 text-center rounded-md">
                </div>
            </div>
        </div>`;
    }
    DOM.stringerGrid.innerHTML = html;
    for (let i = 1; i <= 6; i++) {
        const reasonSelect = document.getElementById(`live-br-reason-s${i}`);
        const otherReasonInput = document.getElementById(`live-br-other-s${i}`);
        reasonSelect.addEventListener('change', () => {
            otherReasonInput.style.display = reasonSelect.value === 'Other' ? 'block' : 'none';
        });
    }
}

function getShiftSummary(data) {
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    const stringerStats = [];
    let totalModules = 0, totalBreakdownTime = 0;
    let line1Modules = 0, line2Modules = 0;

    for (let s = 1; s <= 6; s++) {
        let totalOk = 0, totalNg = 0, totalBreakdown = 0;
        hourlyArray.forEach(hd => {
            totalOk += hd.stringers[s]?.ok || 0;
            totalNg += hd.stringers[s]?.ng || 0;
            totalBreakdown += hd.stringers[s]?.breakdownTime || 0;
        });

        const modules = Math.round(totalOk / 12);
        stringerStats.push({
            stringer: s,
            modules,
            ng: totalNg,
            ngRate: (totalNg / (totalOk + totalNg)) * 100 || 0
        });

        totalModules += modules;
        totalBreakdownTime += totalBreakdown;

        if (s <= 3) {
            line1Modules += modules;
        } else {
            line2Modules += modules;
        }
    }

    const best = stringerStats.reduce((a, b) => a.modules > b.modules ? a : b, { stringer: 'N/A', modules: 0, ng: 0 });
    const worst = stringerStats.reduce((a, b) => a.ngRate > b.ngRate ? a : b, { stringer: 'N/A', ngRate: 0 });
    const totalOk = stringerStats.reduce((sum, s) => sum + (s.modules * 12), 0);
    const totalNg = stringerStats.reduce((sum, s) => sum + s.ng, 0);
    const overallNgRate = (totalNg / (totalOk + totalNg)) * 100 || 0;

    return {
        stringerStats,
        best,
        worst,
        overallNgRate,
        totalOk,
        totalNg,
        totalModules,
        totalBreakdownTime,
        line1Modules,
        line2Modules,
        modulesDisplay: `${totalModules} _ ${line1Modules} | ${line2Modules}`
    };
}

function renderSummary(data) {
    const summary = getShiftSummary(data);
    const icons = {
        total: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        best: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
        worst: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>`,
        ng_rate: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        strings: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>`,
        breakdown: `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
    };

    DOM.summarySection.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-blue">${icons.total}</div><span>Total Modules</span></div>
        <div class="kpi-card-body">
          <div class="kpi-card-value kpi-value-main">${summary.totalModules}</div>
          <div class="kpi-card-footer"><div>Line 1: ${summary.line1Modules}</div><div>Line 2: ${summary.line2Modules}</div></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-green">${icons.best}</div><span>Best Stringer</span></div>
        <div class="kpi-card-body">
            <div class="kpi-card-value kpi-value-good">#${summary.best.stringer}</div>
            <div class="kpi-card-footer"><div>${summary.best.modules} Mod</div><div>${summary.best.ng} NG</div></div>
        </div>
      </div>
       <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-red">${icons.worst}</div><span>Inferior Stringer</span></div>
        <div class="kpi-card-body">
            <div class="kpi-card-value kpi-value-bad">#${summary.worst.stringer}</div>
            <div class="kpi-card-footer">${summary.worst.ngRate.toFixed(1)}% NG</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-amber">${icons.ng_rate}</div><span>Shift NG Rate</span></div>
         <div class="kpi-card-body">
            <div class="kpi-card-value kpi-value-warn">${summary.overallNgRate.toFixed(2)}<span class="text-3xl self-start">%</span></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-violet">${icons.strings}</div><span>Total Strings</span></div>
        <div class="kpi-card-body">
            <div class="kpi-card-value kpi-value-neutral">${summary.totalOk}</div>
            <div class="kpi-card-footer"><div class="text-green-600 font-semibold">OK</div><div class="text-red-600 font-semibold">${summary.totalNg} NG</div></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-header"><div class="kpi-card-icon icon-bg-sky">${icons.breakdown}</div><span>Total Breakdown</span></div>
        <div class="kpi-card-body">
            <div class="kpi-card-value kpi-value-neutral">${summary.totalBreakdownTime}</div>
            <div class="kpi-card-footer">Mins</div>
        </div>
      </div>
    `;
}

function updateUI(data) {
    if (!data || !data.hourlyData) {
        data = getEmptyShiftData(Number(DOM.shiftSelector.value), DOM.dateSelector.value);
    }
    DOM.dashboardContent.classList.remove('hidden');
    DOM.messageArea.classList.add('hidden');
    renderSummary(data);
    const now = new Date();
    const currentHour = now.getHours();
    const shiftHours = getShiftHours(data.shift);
    DOM.submitButton.disabled = shiftHours.findIndex(h => h === currentHour) === -1;
    document.querySelectorAll('#stringer-grid input, #stringer-grid select').forEach(el => {
        el.disabled = false;
        if (el.tagName !== 'SELECT') el.value = '';
    });
    updateProductionChart(data);
    updateStringerChart(data);
    updateBreakdownChart(data);
    updateDowntimeChart(data);
    renderHourlyTable(data);
    updateStringerHourlyGraphs(data);
}

function createGradient(ctx, topColor, bottomColor) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    return gradient;
}

function initializeCharts() {
    Chart.register(window.ChartDataLabels);
    Chart.defaults.font.family = "'Inter', sans-serif";

    const commonOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { usePointStyle: true, pointStyle: 'circle', padding: 20 }
            },
            tooltip: {
                enabled: true, mode: 'index', intersect: false, backgroundColor: '#1e293b',
                titleColor: '#ffffff', bodyColor: '#cbd5e1', titleFont: { weight: 'bold', size: 14 },
                bodyFont: { size: 12 }, padding: 12, cornerRadius: 8, boxPadding: 4,
            }
        },
        interaction: { mode: 'index', intersect: false, },
    };

    // 1. Production Chart
    const prodCtx = DOM.productionChartCanvas.getContext('2d');
    productionChart = new Chart(prodCtx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions, maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, grid: { color: '#e2e8f0' }, grace: '10%' }
            }
        }
    });

    // 2. Stringer Performance Chart
    const stringerCtx = DOM.stringerChartCanvas.getContext('2d');
    stringerChart = new Chart(stringerCtx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#e2e8f0' }, grace: '10%' }
            }
        }
    });

    // 3. Breakdown Reason Chart
    const breakdownCtx = DOM.breakdownReasonChartCanvas.getContext('2d');
    breakdownReasonChart = new Chart(breakdownCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], borderWidth: 4, borderColor: '#ffffff' }] },
        options: {
            ...commonOptions,
            maintainAspectRatio: false,
            cutout: '70%',
            layout: {
                padding: 30 // FIX: Add padding to prevent labels from being cut off
            },
            plugins: {
    ...commonOptions.plugins,
    // FIX: Configure datalabels to sit inside the chart and show only the value
    datalabels: {
        // Display the label only if the value is significant
        display: (context) => {
            return context.dataset.data[context.dataIndex] > 0;
        },
        formatter: (value) => {
            return `${value}m`; // Show only the value with "m" for minutes
        },
        color: '#ffffff', // White text for contrast
        font: {
            weight: 'bold',
            size: 14
        },
        textStrokeColor: 'rgba(0,0,0,0.4)', // Add a thin dark outline to text
        textStrokeWidth: 2
    }

            }
        }
    });

    // 4. Downtime Chart
    const downtimeCtx = DOM.downtimeChartCanvas.getContext('2d');
    downtimeChart = new Chart(downtimeCtx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions,
            maintainAspectRatio: false,
            plugins: { ...commonOptions.plugins, legend: { display: false } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutes' }, grace: '10%' } }
        }
    });

    // 5. Small Stringer Hourly Graphs
    for (let s = 1; s <= 6; s++) {
        const ctx = document.getElementById(`stringerGraph${s}`).getContext('2d');
        window[`stringerHourlyChart${s}`] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    { label: 'Modules', data: [] },
                    { label: 'NG Trend', data: [], type: 'line' }
                ]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: commonOptions.tooltip },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, grace: '20%' }
                }
            }
        });
    }
}

function updateProductionChart(data) {
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    const hourlyTotals = hourlyArray.map(hourData => {
        let hourlyOk = 0;
        let hourlyNg = 0;
        Object.values(hourData.stringers).forEach(s => {
            hourlyOk += s.ok || 0;
            hourlyNg += s.ng || 0;
        });
        return {
            hour: hourData.hour,
            Modules: Math.round(hourlyOk / 12),
            NG: hourlyNg
        };
    });

    productionChart.data.labels = hourlyTotals.map(d => `${d.hour}:00`);
    productionChart.data.datasets = [{
        label: 'Modules Produced',
        data: hourlyTotals.map(d => d.Modules),
        backgroundColor: createGradient(productionChart.ctx, 'rgba(59, 130, 246, 0.8)', 'rgba(59, 130, 246, 0.2)'),
        stack: 'stack0',
        borderRadius: 4
    }, {
        label: 'NG Strings',
        data: hourlyTotals.map(d => d.NG),
        backgroundColor: createGradient(productionChart.ctx, 'rgba(220, 38, 38, 0.8)', 'rgba(220, 38, 38, 0.2)'),
        stack: 'stack1',
        borderRadius: 4,
        barPercentage: 0.5
    }];

    productionChart.options.plugins.datalabels = {
        display: (context) => {
            return context.dataset.data[context.dataIndex] > 0;
        },
        anchor: 'end',
        align: 'top',
        font: {
            weight: 'bold'
        },
        color: (context) => {
            if (context.dataset.label === 'Modules Produced') {
                return '#1e293b';
            }
            if (context.dataset.label === 'NG Strings') {
                return '#ffffff';
            }
            return '#000000';
        },
        formatter: (value) => {
            return value;
        }
    };

    productionChart.options.plugins.tooltip.callbacks = {
        title: (context) => `Hour: ${context[0].label}`,
        label: (context) => {
            if (context.dataset.label === 'Modules Produced') {
                return ` Modules: ${context.parsed.y}`;
            }
            if (context.dataset.label === 'NG Strings') {
                return ` NG Strings: ${context.parsed.y}`;
            }
            return '';
        }
    };

    productionChart.update();
}

function updateStringerChart(data) {
    const stringerTotals = Array.from({ length: 6 }, () => ({ ok: 0, ng: 0 }));
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    hourlyArray.forEach(hourData => {
        for (let i = 1; i <= 6; i++) { stringerTotals[i - 1].ok += hourData.stringers[i]?.ok || 0; stringerTotals[i - 1].ng += hourData.stringers[i]?.ng || 0; }
    });
    stringerChart.data.labels = Array.from({ length: 6 }, (_, i) => `Stringer ${i + 1}`);
    stringerChart.data.datasets = [
        { label: 'Total OK', data: stringerTotals.map(s => s.ok), backgroundColor: createGradient(stringerChart.ctx, 'rgba(34, 197, 94, 0.8)', 'rgba(34, 197, 94, 0.2)'), borderRadius: 4 },
        { label: 'Total NG', data: stringerTotals.map(s => s.ng), backgroundColor: createGradient(stringerChart.ctx, 'rgba(239, 68, 68, 0.8)', 'rgba(239, 68, 68, 0.2)'), borderRadius: 4 }
    ];
    stringerChart.update();
}

function updateBreakdownChart(data) {
    const reasonTotals = {};
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    hourlyArray.forEach(hourData => {
        Object.values(hourData.stringers).forEach(s => {
            const reason = s.breakdownReason || 'None';
            const time = s.breakdownTime || 0;
            if (time > 0 && reason !== 'None') {
                reasonTotals[reason] = (reasonTotals[reason] || 0) + time;
            }
        });
    });

    const labels = Object.keys(reasonTotals);
    const chartData = Object.values(reasonTotals);
    
    // FIX: Use a pleasing pastel color palette
    const pastelColors = [
        '#a1c9f4', '#ffb482', '#8de5a1', '#ff9f9b', '#d0bbff',
        '#debb9b', '#fab0e4', '#cfcfcf', '#fffea3', '#b9f2f0'
    ];

    breakdownReasonChart.data.labels = labels;
    breakdownReasonChart.data.datasets[0].data = chartData;
    breakdownReasonChart.data.datasets[0].backgroundColor = pastelColors.slice(0, labels.length);
    breakdownReasonChart.update();
}

function updateDowntimeChart(data) {
    const downtimeTotals = Array(6).fill(0);
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    hourlyArray.forEach(hourData => {
        for (let i = 1; i <= 6; i++) { downtimeTotals[i - 1] += hourData.stringers[i]?.breakdownTime || 0; }
    });
    downtimeChart.data.labels = Array.from({ length: 6 }, (_, i) => `Stringer ${i + 1}`);
    downtimeChart.data.datasets[0] = {
        label: 'Total Downtime (mins)',
        data: downtimeTotals,
        backgroundColor: createGradient(downtimeChart.ctx, 'rgba(245, 158, 11, 0.8)', 'rgba(245, 158, 11, 0.2)')
    };
    downtimeChart.update();
}

function renderHourlyTable(data) {
    let tableHtml = `<thead><tr><th>Hour</th>`; // Modified this line
    for (let i = 1; i <= 6; i++) { tableHtml += `<th colspan="2">Stringer ${i}</th>`; }
    tableHtml += `<th class="edit-col">Edit</th></tr><tr class="bg-gray-50 text-xs"><th></th>`;
    for (let i = 1; i <= 6; i++) { tableHtml += `<th>OK</th><th>NG</th>`; }
    tableHtml += `<th class="edit-col"></th></tr></thead><tbody>`;
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    hourlyArray.forEach((hourData, hourIndex) => {
        const hourLabel = (hourData.hour !== undefined ? hourData.hour : keyToHour(hourData._key)) + ":00";
        tableHtml += `<tr><td class="font-semibold">${hourLabel}</td>`;
        for (let i = 1; i <= 6; i++) {
            const okValue = hourData.stringers[i]?.ok || 0; const ngValue = hourData.stringers[i]?.ng || 0;
            let ngClass = ''; if (ngValue > 5) ngClass = 'cell-danger'; else if (ngValue > 0) ngClass = 'cell-warn';
            let okClass = okValue > 100 ? 'cell-good' : '';
            tableHtml += `<td class="${okClass}">${okValue}</td><td class="${ngClass}">${ngValue}</td>`;
        }
        tableHtml += `<td class="edit-col"><button class="edit-hour-btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs" data-hour-index="${hourIndex}">Edit</button></td></tr>`;
    });
    tableHtml += `</tbody>`;
    DOM.detailsTableContainer.innerHTML = tableHtml;
    DOM.detailsTableContainer.querySelectorAll('.edit-hour-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(Number(btn.dataset.hourIndex)));
    });
}

function openEditModal(hourIndex) {
    const hourlyArray = normalizeHourlyDataWithKeys(currentProductionData.hourlyData, currentProductionData.shift);
    const hourData = hourlyArray[hourIndex];
    const hourLabel = (hourData.hour !== undefined ? hourData.hour : keyToHour(hourData._key)) + ":00";
    DOM.modalTitle.textContent = `Editing Data for ${hourLabel}`;
    const breakdownReasons = ['None', 'Ribbon Drop', 'Cell Crack', 'High CCD NG', 'Cell cutting issue', 'Robot issue', 'RMA', 'Other'];
    let modalHtml = '<div class="modal-grid">';
    for (let i = 1; i <= 6; i++) {
        const sData = hourData.stringers[i];
        const isOther = !breakdownReasons.includes(sData.breakdownReason);
        modalHtml += `
        <div class="p-3 stringer-card rounded-lg border">
            <h4 class="font-bold text-md text-blue-800 mb-2">Stringer #${i}</h4>
            <div class="space-y-2">
                <div> <label class="text-sm text-gray-600">OK</label> <input type="number" value="${sData.ok || 0}" id="modal-ok-s${i}" class="w-full p-2 text-center rounded-md border border-gray-300"> </div>
                <div> <label class="text-sm text-gray-600">NG</label> <input type="number" value="${sData.ng || 0}" id="modal-ng-s${i}" class="w-full p-2 text-center rounded-md border border-gray-300"> </div>
                <div> <label class="text-sm text-gray-600">Breakdown Reason</label> <select id="modal-br-reason-s${i}" class="w-full p-2 rounded-md border border-gray-300 text-sm"> ${breakdownReasons.map(r => `<option value="${r}" ${((isOther && r === 'Other') || (r === sData.breakdownReason)) ? 'selected' : ''}>${r}</option>`).join('')} </select> </div>
                <div> <input type="text" id="modal-br-other-s${i}" placeholder="Specify other reason" value="${isOther ? sData.breakdownReason : ''}" class="w-full p-2 rounded-md border border-gray-300 text-sm ${isOther ? '' : 'hidden'}"> </div>
                <div> <label class="text-sm text-gray-600">Breakdown Time (mins)</label> <input type="number" value="${sData.breakdownTime || 0}" id="modal-br-time-s${i}" class="w-full p-2 text-center rounded-md border border-gray-300"> </div>
            </div>
        </div>`;
    }
    modalHtml += '</div><div class="mt-6 text-center"><button id="save-modal-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg">Save Changes</button></div>';
    DOM.modalBody.innerHTML = modalHtml;
    for (let i = 1; i <= 6; i++) {
        const reasonSelect = document.getElementById(`modal-br-reason-s${i}`);
        const otherReasonInput = document.getElementById(`modal-br-other-s${i}`);
        reasonSelect.addEventListener('change', () => { otherReasonInput.style.display = reasonSelect.value === 'Other' ? 'block' : 'none'; });
    }
    DOM.editModal.classList.remove('hidden');
    document.getElementById('save-modal-btn').onclick = async () => {
        const docRef = doc(db, "artifacts", appId, "public/data/productionData", `${DOM.dateSelector.value}_${Number(DOM.shiftSelector.value)}`);
        const updateObject = {};
        for (let i = 1; i <= 6; i++) {
            const reasonSelect = document.getElementById(`modal-br-reason-s${i}`);
            const otherReasonInput = document.getElementById(`modal-br-other-s${i}`);
            const reasonValue = reasonSelect.value === 'Other' ? otherReasonInput.value.trim() || 'Other' : reasonSelect.value;
            updateObject[`hourlyData.${hourData._key}.stringers.${i}.ok`] = Number(document.getElementById(`modal-ok-s${i}`).value);
            updateObject[`hourlyData.${hourData._key}.stringers.${i}.ng`] = Number(document.getElementById(`modal-ng-s${i}`).value);
            updateObject[`hourlyData.${hourData._key}.stringers.${i}.breakdownReason`] = reasonValue;
            updateObject[`hourlyData.${hourData._key}.stringers.${i}.breakdownTime`] = Number(document.getElementById(`modal-br-time-s${i}`).value);
        }
        await updateDoc(docRef, updateObject);
        DOM.editModal.classList.add('hidden');
    };
}

async function handleSubmit() {
    DOM.submitButton.disabled = true;
    const shift = Number(DOM.shiftSelector.value);
    const dateString = DOM.dateSelector.value;
    const currentHour = new Date().getHours();
    const hourObj = normalizeHourlyDataWithKeys(currentProductionData.hourlyData, currentProductionData.shift).find(hd => Number(hd.hour) === currentHour);
    if (!hourObj) {
        DOM.submitMessage.textContent = 'Current hour not in shift!';
        setTimeout(() => { DOM.submitMessage.textContent = ''; DOM.submitButton.disabled = false; }, 3000);
        return;
    }
    const updatesForDb = {};
    for (let i = 1; i <= 6; i++) {
        const reasonSelect = document.getElementById(`live-br-reason-s${i}`);
        const otherReasonInput = document.getElementById(`live-br-other-s${i}`);
        const reasonValue = reasonSelect.value === 'Other' ? otherReasonInput.value.trim() || 'Other' : reasonSelect.value;
        updatesForDb[`hourlyData.${hourObj._key}.stringers.${i}.ok`] = Number(document.getElementById(`live-ok-s${i}`).value) || 0;
        updatesForDb[`hourlyData.${hourObj._key}.stringers.${i}.ng`] = Number(document.getElementById(`live-ng-s${i}`).value) || 0;
        updatesForDb[`hourlyData.${hourObj._key}.stringers.${i}.breakdownReason`] = reasonValue;
        updatesForDb[`hourlyData.${hourObj._key}.stringers.${i}.breakdownTime`] = Number(document.getElementById(`live-br-time-s${i}`).value) || 0;
    }
    const docRef = doc(db, "artifacts", appId, "public/data/productionData", `${dateString}_${shift}`);
    try {
        await updateDoc(docRef, updatesForDb);
        DOM.submitMessage.textContent = 'Data submitted successfully!';
        setTimeout(() => DOM.submitMessage.textContent = '', 3000);
    } catch (error) {
        DOM.submitMessage.textContent = 'Error updating data!';
        setTimeout(() => DOM.submitMessage.textContent = '', 5000);
    } finally {
        DOM.submitButton.disabled = false;
        document.querySelectorAll('#stringer-grid input').forEach(el => el.value = '');
    }
}

async function initializeShiftData(shift, dateString) {
    const docId = `${dateString}_${shift}`;
    const docRef = doc(db, "artifacts", appId, "public/data/productionData", docId);
    const initialData = getEmptyShiftData(shift, dateString);
    initialData.createdAt = serverTimestamp();
    try {
        await setDoc(docRef, initialData);
    } catch (error) {
        console.error("Error creating initial shift data:", error);
    }
}

function listenToShiftData() {
    DOM.loadingOverlay.classList.remove('hidden');
    if (unsubscribe) unsubscribe();
    clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
        DOM.loadingOverlay.classList.add('hidden');
        DOM.dashboardContent.classList.add('hidden');
        DOM.messageArea.innerHTML = `<h2 class="text-2xl font-semibold text-red-600">Connection Failed</h2><p class="text-gray-500 mt-2">Could not load data from the database.</p>`;
        DOM.messageArea.classList.remove('hidden');
    }, 10000);
    const dateString = DOM.dateSelector.value;
    const shift = Number(DOM.shiftSelector.value);
    const docRef = doc(db, "artifacts", appId, "public/data/productionData", `${dateString}_${shift}`);
    unsubscribe = onSnapshot(docRef, async (docSnap) => {
        clearTimeout(loadingTimeout);
        DOM.loadingOverlay.classList.add('hidden');
        if (docSnap.exists()) {
            currentProductionData = mergeWithEmptyShift(shift, dateString, docSnap.data());
        } else {
            currentProductionData = getEmptyShiftData(shift, dateString);
            const now = new Date();
            const currentShift = getShiftInfo(now);
            if (dateString === currentShift.dateString && shift === currentShift.shift) {
                if (auth.currentUser && !auth.currentUser.isAnonymous && AUTHORIZED_USERS.includes(auth.currentUser.email)) {
                    await initializeShiftData(shift, dateString);
                }
            }
        }
        updateUI(currentProductionData);
    }, (error) => {
        console.error("Error fetching data:", error);
        clearTimeout(loadingTimeout);
        DOM.loadingOverlay.classList.add('hidden');
    });
}

function updateStringerHourlyGraphs(data) {
    const hourlyArray = normalizeHourlyDataWithKeys(data.hourlyData, data.shift);
    for (let s = 1; s <= 6; s++) {
        const chart = window[`stringerHourlyChart${s}`];
        if (!chart) continue;

        chart.data.labels = hourlyArray.map(hd => `${hd.hour}:00`);
        
        chart.data.datasets = [
            {
                label: 'Modules',
                data: hourlyArray.map(hd => Math.round((hd.stringers[s]?.ok || 0) / 12)),
                backgroundColor: createGradient(chart.ctx, 'rgba(59, 130, 246, 0.7)', 'rgba(59, 130, 246, 0.1)'),
                borderRadius: 4,
                yAxisID: 'y'
            },
            {
                label: 'NG Trend',
                data: hourlyArray.map(hd => hd.stringers[s]?.ng || 0),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                type: 'line',
                yAxisID: 'y'
            }
        ];
        
        chart.update();
    }
}

function initializeDashboardApp() {
    if (isDashboardInitialized) return;
    renderStringerCards();
    initializeCharts();
    const { shift, dateString } = getShiftInfo(new Date());
    DOM.dateSelector.value = dateString;
    DOM.shiftSelector.value = shift;
    listenToShiftData();
    updateClock();
    setInterval(updateClock, 1000);
    DOM.dateSelector.addEventListener('change', listenToShiftData);
    DOM.shiftSelector.addEventListener('change', listenToShiftData);
    DOM.resetButton.addEventListener('click', () => {
        const { shift, dateString } = getShiftInfo(new Date());
        DOM.dateSelector.value = dateString;
        DOM.shiftSelector.value = shift;
        listenToShiftData();
    });
    DOM.submitButton.addEventListener('click', handleSubmit);
    DOM.modalCloseBtn.addEventListener('click', () => DOM.editModal.classList.add('hidden'));
    isDashboardInitialized = true;
}

document.addEventListener('DOMContentLoaded', () => {
    DOM.googleLoginButton.addEventListener('click', handleGoogleLogin);
    document.getElementById('app').style.visibility = 'hidden';
    onAuthStateChanged(auth, (user) => {
        if (!isDashboardInitialized) {
            initializeDashboardApp();
        }
        if (user && !user.isAnonymous) {
            const isAuthorized = AUTHORIZED_USERS.includes(user.email);
            const status = isAuthorized ? '(Editor)' : '(View-Only)';
            DOM.authStatus.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-gray-600 hidden sm:inline" title="${user.email}">${user.displayName} <span class="text-xs text-gray-400">${status}</span></span>
                    <button id="logout-button" class="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 px-3 rounded-md">Logout</button>
                </div>
            `;
            document.getElementById('logout-button').addEventListener('click', handleLogout);
            DOM.loginModal.style.display = 'none';
            toggleEditFeatures(isAuthorized);
        } else {
            DOM.authStatus.innerHTML = `
                 <button id="login-button" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md text-sm">Sign In</button>
            `;
            document.getElementById('login-button').addEventListener('click', () => {
                DOM.loginModal.style.display = 'flex';
            });
            if (!auth.currentUser || !auth.currentUser.isAnonymous) {
                signInAnonymously(auth).catch(err => console.error("Anonymous sign-in for viewer failed:", err));
            }
            toggleEditFeatures(false);
        }
        document.getElementById('app').style.visibility = 'visible';
        setTimeout(() => {
            if (document.getElementById('app').style.visibility === 'hidden') {
                console.log("Auth timeout - showing app");
                document.getElementById('app').style.visibility = 'visible';
                signInAnonymously(auth).catch(err => console.error("Fallback auth failed:", err));
            }
        }, 5000);
    });

});


