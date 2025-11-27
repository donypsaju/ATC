// --- Global Data Store ---
let allRosterData = [];
let allCandidateData = [];
let chartInstances = {}; 

// --- Chart Colors ---
const CHART_COLORS = {
    blue: 'rgb(54, 162, 235)',
    green: 'rgb(75, 192, 192)',
    red: 'rgb(255, 99, 132)',
    orange: 'rgb(255, 159, 64)',
    purple: 'rgb(153, 102, 255)',
    grey: 'rgb(101, 103, 107)',
};

// --- Category Mappings ---
const ROSTER_CATEGORY_MAP = {
    'LPST': ['category_01'], 
    'UPST': ['category_01'], 
    'Primary': ['category_01'],
    'HST': ['category_02'],
    'NonTeaching': ['category_03'],
    'HSST': ['category_04', 'category_05', 'category_06', 'category_07'],
};

ROSTER_CATEGORY_MAP.Teaching = [
    'category_01', 'category_02', 'category_04', 'category_05', 'category_06', 'category_07'
];

ROSTER_CATEGORY_MAP.All = [ ...ROSTER_CATEGORY_MAP.Teaching, 'category_03' ];

const CANDIDATE_CATEGORY_MAP = {
    'LPST': ['LPST'],
    'UPST': ['UPST'],
    'NonTeaching': ['NonTeaching'],
    'HST': ['HST'],
    'HSST': ['HSST'],
    'Primary': ['LPST', 'UPST'],
};

CANDIDATE_CATEGORY_MAP.Teaching = ['LPST', 'UPST', 'HST', 'HSST'];
CANDIDATE_CATEGORY_MAP.All = [...CANDIDATE_CATEGORY_MAP.Teaching, 'NonTeaching'];


// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // Init Tooltips & Popovers
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl));

    fetchTimestamps();
    loadAllData();
    setupFilterListeners();
});

async function fetchTimestamps() {
    try {
        const rosterCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=roster_data.json&per_page=1`);
        const rosterCommits = await rosterCommitResponse.json();
        if (rosterCommits && rosterCommits.length > 0) {
            document.getElementById('roster-update-time').textContent = `Roster: ${new Date(rosterCommits[0].commit.author.date).toLocaleDateString()}`;
        }
        const candidateCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=candidates.json&per_page=1`);
        const candidateCommits = await candidateCommitResponse.json();
        if (candidateCommits && candidateCommits.length > 0) {
            document.getElementById('candidate-update-time').textContent = `Candidates: ${new Date(candidateCommits[0].commit.author.date).toLocaleDateString()}`;
        }
    } catch (e) {
        console.error("Error fetching timestamps:", e);
    }
}

async function loadAllData() {
    try {
        const [rosterResponse, candidatesResponse] = await Promise.all([
            fetch('roster_data.json'),
            fetch('candidates.json')
        ]);
        allRosterData = await rosterResponse.json();
        allCandidateData = await candidatesResponse.json();

        populateSearchFilters();
        updateDashboard(); 
        
        // Initialize the Auditor table with ALL data by default
        handleAuditorSearch({ target: { value: '' } });

        // Show guide modal on first load
        const myModal = new bootstrap.Modal(document.getElementById('introModal'));
        myModal.show();

    } catch (error) {
        console.error("Failed to load data:", error);
    }
}

function setupFilterListeners() {
    document.getElementById('filter-main').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            e.currentTarget.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            const mainFilter = e.target.dataset.filter;
            document.getElementById('sub-filter-container').style.display = (mainFilter === 'Teaching') ? 'block' : 'none';
            updateDashboard();
        }
    });
    
    document.getElementById('filter-sub').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            e.currentTarget.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });
    
    document.getElementById('global-search').addEventListener('input', handleGlobalSearch);
    
    // AUDITOR Search Input Listener
    document.getElementById('auditor-search').addEventListener('input', handleAuditorSearch);
}

// --- Dashboard Logic ---
function updateDashboard() {
    const filter = getActiveFilter();
    
    const rosterStats = processRosterData(filter);
    const candidateStats = processCandidateData(filter);
    
    const verificationRate = rosterStats.totalSchools > 0 ? ((rosterStats.totalVerified / rosterStats.totalSchools) * 100).toFixed(1) : 0;
    
    // Update KPIs
    document.getElementById('kpi-total-owed').textContent = Math.round(rosterStats.totalPostsOwed).toLocaleString();
    document.getElementById('kpi-total-supply').textContent = candidateStats.totalSupply.toLocaleString();
    document.getElementById('kpi-total-filled').textContent = rosterStats.totalManagerAppointed.toLocaleString();
    document.getElementById('kpi-total-reported').textContent = rosterStats.totalReported.toLocaleString();
    document.getElementById('kpi-total-limbo').textContent = rosterStats.totalLimbo.toLocaleString();
    document.getElementById('kpi-verification-rate').textContent = `${verificationRate}%`;
    document.getElementById('kpi-total-managements').textContent = allRosterData.length.toLocaleString();
    document.getElementById('kpi-rti-entries').textContent = candidateStats.totalRTIEntries.toLocaleString();

    // Update Supply Detail Text
    if (filter.type === 'All') {
        const nonTeachStats = processCandidateData({type: 'NonTeaching'});
        const nonTeachPct = Math.round((nonTeachStats.totalSupply / candidateStats.totalSupply) * 100);
        document.getElementById('kpi-supply-detail').textContent = `Caution: ${nonTeachPct}% are Non-Teaching Candidates`;
    } else {
        document.getElementById('kpi-supply-detail').textContent = filter.type;
    }

    // Update Charts
    renderSupplyDemandChart(rosterStats.totalPostsOwed, candidateStats.totalSupply);
    renderVerificationChart(rosterStats.totalVerified, rosterStats.totalSchools);
    
    const unaccounted = rosterStats.totalPostsOwed - rosterStats.totalManagerAppointed - rosterStats.totalReported;
    renderActionOnOwedChart({
        'Filled by Mgmt': rosterStats.totalManagerAppointed,
        'Reported to Exchange': rosterStats.totalReported,
        'Unaccounted': Math.max(0, unaccounted),
    });
    
    renderCandidateSupplyChart(candidateStats.supplyByPost);
    renderCandidateDisabilityChart(candidateStats.supplyByDisability);

    renderKeyFindings();
}

function getActiveFilter() {
    const main = document.querySelector('#filter-main .btn.active').dataset.filter;
    let sub = 'All';
    if (main === 'Teaching') {
        sub = document.querySelector('#filter-sub .btn.active').dataset.filter;
    }
    if (main === 'Teaching' && sub !== 'All') return { type: sub };
    return { type: main };
}

function processRosterData(filter) {
    let totalVerified = 0, totalSchools = 0, totalLimbo = 0;
    let totalPostsOwed = 0, totalManagerAppointed = 0, totalReported = 0, totalNotApproved = 0, totalVacant = 0;

    const keysToProcess = [...new Set(ROSTER_CATEGORY_MAP[filter.type] || [])];
    
    allRosterData.forEach(entry => {
        totalVerified += entry.verf_status[0] || 0;
        totalSchools += entry.verf_status[1] || 0;

        keysToProcess.forEach(catKey => {
            if (entry[catKey] && entry[catKey].length > 0) {
                const data = entry[catKey][0];
                
                const owed = ((data.appo_2017 || 0) * 0.03) + ((data.appo_after_2017 || 0) * 0.04);
                totalPostsOwed += owed;

                totalManagerAppointed += data.manager_appo || 0;
                totalReported += data.reported || 0;
                
                const notApproved = data.not_approved || 0;
                const notAppointed = data.not_appointed || 0; 
                
                totalNotApproved += notApproved;
                totalVacant += notAppointed;
                totalLimbo += (notApproved + notAppointed);
            }
        });
    });
    
    return { 
        totalVerified, totalSchools, 
        totalLimbo, totalPostsOwed: Math.round(totalPostsOwed), 
        totalManagerAppointed, totalReported,
        totalNotApproved, totalVacant
    };
}

function processCandidateData(filter) {
    let totalSupply = 0;
    const supplyByPost = {};
    const supplyByDisability = { 'Visually Impaired': 0, 'Hearing Impairment': 0, 'LD': 0, 'Others': 0 };
    
    const keysToProcess = CANDIDATE_CATEGORY_MAP[filter.type] || [];

    allCandidateData.forEach(entry => {
        keysToProcess.forEach(catKey => {
            if (entry[catKey]) {
                const data = entry[catKey];
                const total = data.Total || 0;
                totalSupply += total;
                supplyByPost[catKey] = (supplyByPost[catKey] || 0) + total;
                supplyByDisability['Visually Impaired'] += data.VisuallyImpaired || 0;
                supplyByDisability['Hearing Impairment'] += data.HearingImpairment || 0;
                supplyByDisability['LD'] += data.LD || 0;
                supplyByDisability['Others'] += data.Others || 0;
            }
        });
    });
    
    return { totalSupply, supplyByPost, supplyByDisability, totalRTIEntries: allCandidateData.length };
}

function renderKeyFindings() {
    try {
        const allRoster = processRosterData({ type: 'All' });
        const teachRoster = processRosterData({ type: 'Teaching' });
        const teachCand = processCandidateData({ type: 'Teaching' });
        const nonTeachRoster = processRosterData({ type: 'NonTeaching' });
        const nonTeachCand = processCandidateData({ type: 'NonTeaching' });

        document.getElementById('finding-1').innerHTML = 
            `<strong>The Data Illusion:</strong> <strong>${nonTeachCand.totalSupply.toLocaleString()}</strong> of the available candidates are for Non-Teaching posts. <br>For <strong>Teaching</strong> posts specifically, there is a shortage of qualified candidates compared to the owed posts.`;
            
        const unaccounted = allRoster.totalPostsOwed - allRoster.totalManagerAppointed - allRoster.totalReported;
        document.getElementById('finding-2').innerHTML = 
            `<strong>Action Gap:</strong> Of <strong>${allRoster.totalPostsOwed.toLocaleString()}</strong> owed, <strong>${allRoster.totalManagerAppointed.toLocaleString()}</strong> filled and <strong>${allRoster.totalReported.toLocaleString()}</strong> reported. <strong>${Math.max(0, Math.round(unaccounted)).toLocaleString()}</strong> posts are currently unaccounted for.`;

        document.getElementById('finding-3').innerHTML = 
            `<strong>Administrative Logjam:</strong> <strong>${allRoster.totalLimbo.toLocaleString()}</strong> total appointments are stuck in "Limbo" (Not Approved or Vacant).`;

    } catch (e) {
        console.error("Error rendering findings:", e);
        document.getElementById('finding-1').innerHTML = "Error loading findings.";
    }
}

// --- Chart Rendering ---
function destroyChart(name) { if (chartInstances[name]) chartInstances[name].destroy(); }
Chart.defaults.color = '#ccc';
Chart.defaults.borderColor = '#555';

function renderSupplyDemandChart(demand, supply) {
    const ctx = document.getElementById('supplyDemandChart').getContext('2d');
    destroyChart('supplyDemand');
    chartInstances.supplyDemand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Posts Owed', 'Candidates'],
            datasets: [{ data: [demand, supply], backgroundColor: [CHART_COLORS.red, CHART_COLORS.blue] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderActionOnOwedChart(dataObj) {
    const ctx = document.getElementById('actionOnOwedChart').getContext('2d');
    destroyChart('actionOnOwed');
    chartInstances.actionOnOwed = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(dataObj),
            datasets: [{ data: Object.values(dataObj), backgroundColor: [CHART_COLORS.green, CHART_COLORS.blue, CHART_COLORS.orange] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderCandidateSupplyChart(dataObj) {
    const ctx = document.getElementById('candidatePostChart').getContext('2d');
    destroyChart('candidateSupply');
    chartInstances.candidateSupply = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(dataObj),
            datasets: [{ data: Object.values(dataObj), backgroundColor: CHART_COLORS.blue }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderCandidateDisabilityChart(dataObj) {
    const ctx = document.getElementById('candidateDisabilityChart').getContext('2d');
    destroyChart('candidateDisability');
    chartInstances.candidateDisability = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(dataObj),
            datasets: [{ data: Object.values(dataObj), backgroundColor: [CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.green, CHART_COLORS.grey] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderVerificationChart(verified, total) {
    const ctx = document.getElementById('verificationChart').getContext('2d');
    destroyChart('verification');
    chartInstances.verification = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Verified', 'Pending'],
            datasets: [{ data: [verified, total - verified], backgroundColor: [CHART_COLORS.green, CHART_COLORS.grey] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// --- Search Logic ---
function populateSearchFilters() {
    const globalDatalist = document.getElementById('global-search-list');
    const auditorDatalist = document.getElementById('auditor-search-list');
    
    allRosterData.forEach(e => {
        const option1 = new Option(`${e.name_of_management} (Management)`);
        globalDatalist.appendChild(option1);
        
        const option2 = new Option(e.name_of_management);
        auditorDatalist.appendChild(option2);
    });
    
    allCandidateData.forEach(e => {
        const option = new Option(`${e.Office_Name} (Employment Office)`);
        globalDatalist.appendChild(option);
    });
}

function handleGlobalSearch(e) {
    const val = e.target.value;
    const mgmtContainer = document.getElementById('management-details-container');
    const candContainer = document.getElementById('candidate-details-container');
    const resultsRow = document.getElementById('search-results-row');

    let mgmtEntry = null, candEntry = null;

    if (val.includes("(Management)")) {
        mgmtEntry = allRosterData.find(m => m.name_of_management === val.replace(" (Management)", ""));
    } else if (val.includes("(Employment Office)")) {
        candEntry = allCandidateData.find(m => m.Office_Name === val.replace(" (Employment Office)", ""));
    } else {
        mgmtEntry = allRosterData.find(m => m.name_of_management === val);
        candEntry = allCandidateData.find(m => m.Office_Name === val);
    }

    mgmtContainer.style.display = 'none';
    candContainer.style.display = 'none';
    resultsRow.style.display = 'none';

    if (mgmtEntry) {
        renderManagementCard(mgmtEntry);
        mgmtContainer.style.display = 'block';
        resultsRow.style.display = 'flex';
    } else if (candEntry) {
        renderCandidateCard(candEntry);
        candContainer.style.display = 'block';
        resultsRow.style.display = 'flex';
    }
}

// --- Auditor Search Handler ---
function handleAuditorSearch(e) {
    const selectedName = e.target.value;
    const collapseEl = document.getElementById('auditorTableCollapse');

    // If search is empty, show ALL managements AGGREGATED
    if (!selectedName) {
        renderAllAuditorTables();
        new bootstrap.Collapse(collapseEl, { show: true });
        return;
    }

    const mgmtEntry = allRosterData.find(m => m.name_of_management === selectedName);

    if (mgmtEntry) {
        renderAuditorTable(mgmtEntry);
        new bootstrap.Collapse(collapseEl, { show: true });
    } else {
        const bsCollapse = bootstrap.Collapse.getInstance(collapseEl);
        if (bsCollapse) bsCollapse.hide();
    }
}

/**
 * Renders a SINGLE consolidated table summing up data from ALL managements.
 */
function renderAllAuditorTables() {
    const container = document.getElementById('auditor-table-body');
    let html = '';
    
    document.getElementById('auditor-mgmt-name').textContent = "Consolidated Report (All Managements)";
    
    // Initialize an object to hold the sums for each of the 7 categories
    // Index 1 to 7 matches the category numbers
    const sums = {};
    for (let i = 1; i <= 7; i++) {
        sums[i] = { 
            appo_2017: 0, 
            appo_after_2017: 0, 
            manager_appo: 0, 
            reported: 0, 
            not_approved: 0, 
            not_appointed: 0 
        };
    }

    // Loop through EVERY management and aggregate their data
    allRosterData.forEach(entry => {
        for (let i = 1; i <= 7; i++) {
            const catKey = `category_${String(i).padStart(2, '0')}`;
            if (entry[catKey] && entry[catKey].length > 0) {
                const d = entry[catKey][0];
                sums[i].appo_2017 += d.appo_2017 || 0;
                sums[i].appo_after_2017 += d.appo_after_2017 || 0;
                sums[i].manager_appo += d.manager_appo || 0;
                sums[i].reported += d.reported || 0;
                sums[i].not_approved += d.not_approved || 0;
                sums[i].not_appointed += d.not_appointed || 0;
            }
        }
    });

    // Now generate the table rows using the aggregated sums
    // We treat 'sums' like a single management entry for the helper function
    // But we need to adapt the helper slightly or just write the loop here.
    // Writing the loop here is safer to avoid object structure mismatches.

    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const d = sums[i];

        const pct3 = d.appo_2017 * 0.03;
        const pct4 = d.appo_after_2017 * 0.04;
        const owed = pct3 + pct4;
        const filled = d.manager_appo;
        
        const balance = Math.max(0, owed - filled);
        const balanceRounded = Math.ceil(balance);
        
        const notApproved = d.not_approved;
        const vacant = d.not_appointed;
        const totalLimbo = notApproved + vacant;
        const reported = d.reported;
        const pendingAction = Math.max(0, balanceRounded - reported);

        html += `
            <tr>
                <td>${catName}</td>
                <td>${d.appo_2017.toLocaleString()}</td>
                <td class="text-secondary">${pct3.toFixed(2)}</td>
                <td>${d.appo_after_2017.toLocaleString()}</td>
                <td class="text-secondary">${pct4.toFixed(2)}</td>
                <td class="fw-bold text-danger bg-subtle-danger">${owed.toFixed(2)}</td>
                <td class="fw-bold text-success bg-subtle-success">${filled.toLocaleString()}</td>
                <td class="fw-bold text-white bg-dark border-secondary">${balanceRounded.toLocaleString()}</td>
                <td>${notApproved.toLocaleString()}</td>
                <td>${vacant.toLocaleString()}</td>
                <td>${totalLimbo.toLocaleString()}</td>
                <td>${reported.toLocaleString()}</td>
                <td class="fw-bold text-warning">${pendingAction.toFixed(2)}</td>
            </tr>
        `;
    }
    
    container.innerHTML = html;
}

function renderAuditorTable(entry) {
    document.getElementById('auditor-mgmt-name').textContent = entry.name_of_management;
    document.getElementById('auditor-table-body').innerHTML = generateAuditorRows(entry);
}

/**
 * Helper to generate the HTML rows for a single management entry
 */
function generateAuditorRows(entry) {
    let html = '';
    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const catKey = `category_${String(i).padStart(2, '0')}`;
        let d = { appo_2017: 0, appo_after_2017: 0, manager_appo: 0, reported: 0, not_approved: 0, not_appointed: 0 };
        
        if (entry[catKey] && entry[catKey].length > 0) d = entry[catKey][0];

        const pct3 = (d.appo_2017 || 0) * 0.03;
        const pct4 = (d.appo_after_2017 || 0) * 0.04;
        const owed = pct3 + pct4;
        const filled = d.manager_appo || 0;
        
        const balance = Math.max(0, owed - filled);
        // ROUND UP LOGIC applied here
        const balanceRounded = Math.ceil(balance);
        
        const notApproved = d.not_approved || 0;
        const vacant = d.not_appointed || 0;
        const totalLimbo = notApproved + vacant;
        const reported = d.reported || 0;
        // Logic: Balance (Rounded) - Reported
        const pendingAction = Math.max(0, balanceRounded - reported);

        html += `
            <tr>
                <td>${catName}</td>
                <td>${d.appo_2017}</td>
                <td class="text-secondary">${pct3.toFixed(2)}</td>
                <td>${d.appo_after_2017}</td>
                <td class="text-secondary">${pct4.toFixed(2)}</td>
                <td class="fw-bold text-danger bg-subtle-danger">${owed.toFixed(2)}</td>
                <td class="fw-bold text-success bg-subtle-success">${filled}</td>
                <td class="fw-bold text-white bg-dark border-secondary">${balanceRounded}</td>
                <td>${notApproved}</td>
                <td>${vacant}</td>
                <td>${totalLimbo}</td>
                <td>${reported}</td>
                <td class="fw-bold text-warning">${pendingAction.toFixed(2)}</td>
            </tr>
        `;
    }
    return html;
}

// --- Render Card: Management (Simplified Table) ---
function renderManagementCard(entry) {
    let tOwed = 0, tFilled = 0, tNotApproved = 0, tVacant = 0;
    let html = `<thead class="table-light"><tr><th>Category</th><th>Owed</th><th>Filled</th><th>Backlog</th><th>Unreported</th><th>Vacant</th><th>Not Approved</th></tr></thead><tbody>`;

    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const catKey = `category_${String(i).padStart(2, '0')}`;
        let d = { appo_2017: 0, appo_after_2017: 0, manager_appo: 0, reported: 0, not_approved: 0, not_appointed: 0 };
        if (entry[catKey] && entry[catKey].length > 0) d = entry[catKey][0];

        const owed = (d.appo_2017 * 0.03) + (d.appo_after_2017 * 0.04);
        const filled = d.manager_appo || 0;
        
        const balance = Math.max(0, owed - filled);
        // ROUND UP LOGIC applied here too for consistency
        const backlog = Math.ceil(balance);
        
        const unreported = Math.max(0, backlog - (d.reported || 0));
        const vacant = d.not_appointed || 0;
        const notApproved = d.not_approved || 0;

        tOwed += owed; tFilled += filled; tNotApproved += notApproved; tVacant += vacant;

        html += `<tr>
            <td>${catName}</td>
            <td class="text-danger fw-bold">${owed.toFixed(2)}</td>
            <td class="text-success">${filled}</td>
            <td class="fw-bold">${backlog}</td>
            <td class="text-warning">${unreported.toFixed(2)}</td>
            <td class="text-muted">${vacant}</td>
            <td class="text-danger">${notApproved}</td>
        </tr>`;
    }
    html += '</tbody>';

    document.getElementById('management-name').textContent = entry.name_of_management;
    document.getElementById('mgmt-kpi-status').textContent = `${entry.verf_status[0]} / ${entry.verf_status[1]}`;
    document.getElementById('mgmt-kpi-owed').textContent = tOwed.toFixed(2);
    document.getElementById('mgmt-kpi-filled').textContent = tFilled;
    document.getElementById('mgmt-kpi-not-approved').textContent = tNotApproved;
    document.getElementById('mgmt-kpi-vacant').textContent = tVacant;
    document.getElementById('management-table').innerHTML = html;
}

// --- Render Card: Candidate ---
function renderCandidateCard(entry) {
    document.getElementById('office-name').textContent = entry.Office_Name;
    const ctx = document.getElementById('candidateOfficeChart').getContext('2d');
    destroyChart('candidate');
    
    const labels = ['NonTeaching', 'LPST', 'UPST', 'HST', 'HSST'];
    chartInstances.candidate = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Visually Impaired', data: labels.map(l => entry[l].VisuallyImpaired), backgroundColor: CHART_COLORS.blue },
                { label: 'Hearing Impairment', data: labels.map(l => entry[l].HearingImpairment), backgroundColor: CHART_COLORS.orange },
                { label: 'LD', data: labels.map(l => entry[l].LD), backgroundColor: CHART_COLORS.green },
                { label: 'Others', data: labels.map(l => entry[l].Others), backgroundColor: CHART_COLORS.grey },
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
    });
}

function getCategoryName(i) {
    return ['Primary (Cat 1)', 'High School (Cat 2)', 'Non-Teaching', 'HSST Sr.', 'HSST Jr.', 'VHST Sr.', 'VHST Jr.'][i-1] || `Cat ${i}`;
}