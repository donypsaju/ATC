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
    initVisitorCounter(); 
});

// --- Visitor Counter ---
async function initVisitorCounter() {
    const counterElements = document.querySelectorAll('.visitor-count-display');
    const namespace = 'pwd-reservation-kerala-v1'; 
    const key = 'visits';
    
    try {
        const response = await fetch(`https://api.counterapi.dev/v1/${namespace}/${key}/up`);
        if (!response.ok) throw new Error('Counter API failed');
        const data = await response.json();
        counterElements.forEach(el => {
            el.textContent = data.count.toLocaleString();
        });
    } catch (e) {
        console.warn("Visitor counter failed:", e);
        counterElements.forEach(el => {
            el.textContent = "--"; 
        });
    }
}

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
        renderAllAuditorTables();
        const collapseEl = document.getElementById('auditorTableCollapse');
        new bootstrap.Collapse(collapseEl, { show: true });

        // Show guide modal on first load
        const myModal = new bootstrap.Modal(document.getElementById('projectInfoModal'));
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
    
    // AUDITOR Search Input Listeners
    const auditorInput = document.getElementById('auditor-search');
    auditorInput.addEventListener('input', handleAuditorSearch);
    auditorInput.addEventListener('change', handleAuditorSearch); 
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

    // NEW LOGIC: Calculate Non-Compliant Managements & Populate Modal
    let nonCompliantList = [];
    allRosterData.forEach(entry => {
        let totalAppointments = 0;
        for (let i = 1; i <= 7; i++) {
            const catKey = `category_${String(i).padStart(2, '0')}`;
            if (entry[catKey] && entry[catKey].length > 0) {
                const d = entry[catKey][0];
                totalAppointments += (d.appo_2017 || 0) + (d.appo_after_2017 || 0);
            }
        }
        if (totalAppointments === 0) {
            nonCompliantList.push(entry);
        }
    });
    document.getElementById('kpi-non-compliant').textContent = nonCompliantList.length.toLocaleString();
    populateNonCompliantModal(nonCompliantList); // Populate the modal list


    if (filter.type === 'All') {
        const nonTeachStats = processCandidateData({type: 'NonTeaching'});
        const nonTeachPct = Math.round((nonTeachStats.totalSupply / candidateStats.totalSupply) * 100);
        document.getElementById('kpi-supply-detail').textContent = `Caution: ${nonTeachPct}% are Non-Teaching Candidates`;
    } else {
        document.getElementById('kpi-supply-detail').textContent = filter.type;
    }

    renderSupplyDemandChart(rosterStats.totalPostsOwed, candidateStats.totalSupply);
    renderVerificationChart(rosterStats.totalVerified, rosterStats.totalSchools);
    
    const unaccounted = rosterStats.totalPostsOwed - rosterStats.totalReported;
    renderActionOnOwedChart({
        'Filled by Mgmt': rosterStats.totalManagerAppointed,
        'Reported to Exchange': rosterStats.totalReported,
        'Unaccounted': Math.max(0, unaccounted),
    });
    
    renderCandidateSupplyChart(candidateStats.supplyByPost);
    renderCandidateDisabilityChart(candidateStats.supplyByDisability);

    renderKeyFindings();
}

/**
 * Populates the Non-Compliant Modal List
 */
function populateNonCompliantModal(list) {
    // Sort by Total Schools (descending)
    list.sort((a, b) => {
        const schoolsA = a.verf_status[1] || 0;
        const schoolsB = b.verf_status[1] || 0;
        return schoolsB - schoolsA;
    });

    const tbody = document.getElementById('nc-table-body');
    let html = '';
    
    list.forEach(item => {
        const verified = item.verf_status[0] || 0;
        const total = item.verf_status[1] || 0;
        html += `
            <tr>
                <td>${item.name_of_management}</td>
                <td>${verified}</td>
                <td>${total}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;

    // Add search listener specific to this modal
    const searchInput = document.getElementById('nc-search');
    // Remove old listener to prevent duplicates if function called multiple times
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    newSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const text = row.cells[0].textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
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
                
                const grossOwed = ((data.appo_2017 || 0) * 0.03) + ((data.appo_after_2017 || 0) * 0.04);
                const filled = data.manager_appo || 0;
                const netOwed = Math.max(0, grossOwed - filled);
                
                totalPostsOwed += netOwed;
                totalManagerAppointed += filled;
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
            
        const unaccounted = allRoster.totalPostsOwed - allRoster.totalReported;
        document.getElementById('finding-2').innerHTML = 
            `<strong>Action Gap:</strong> Even after accounting for filled posts, <strong>${allRoster.totalPostsOwed.toLocaleString()}</strong> posts are still owed. Managements have reported <strong>${allRoster.totalReported.toLocaleString()}</strong> vacancies to exchanges.`;

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
            labels: ['Posts Owed (Net)', 'Candidates'],
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
    const auditorDatalist = document.getElementById('auditor-search-list');
    
    allRosterData.forEach(e => {
        const option2 = new Option(e.name_of_management);
        auditorDatalist.appendChild(option2);
    });
}

function handleGlobalSearch(e) {
    // Deprecated for now since search bar is removed from UI
}

// --- Auditor Search Handler ---
function handleAuditorSearch(e) {
    const selectedName = e.target.value;
    const collapseEl = document.getElementById('auditorTableCollapse');

    // FIX: Show all tables if search is empty or cleared
    if (!selectedName || selectedName.trim() === "") {
        renderAllAuditorTables();
        const bsCollapse = new bootstrap.Collapse(collapseEl, { toggle: false });
        bsCollapse.show();
        return;
    }

    const mgmtEntry = allRosterData.find(m => m.name_of_management === selectedName);

    if (mgmtEntry) {
        renderAuditorTable(mgmtEntry);
        const bsCollapse = new bootstrap.Collapse(collapseEl, { toggle: false });
        bsCollapse.show();
    } else {
        renderAllAuditorTables();
        const bsCollapse = new bootstrap.Collapse(collapseEl, { toggle: false });
        bsCollapse.show();
    }
}

function renderAllAuditorTables() {
    const container = document.getElementById('auditor-table-body');
    let html = '';
    
    document.getElementById('auditor-mgmt-name').textContent = "Consolidated Report (All Managements)";
    
    // Initialize aggregated sums
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

    // Aggregate
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

    // Render aggregated rows
    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const d = sums[i];

        const pct3 = d.appo_2017 * 0.03;
        const pct4 = d.appo_after_2017 * 0.04;
        const grossOwed = pct3 + pct4;
        const filled = d.manager_appo;
        
        const netOwed = Math.max(0, grossOwed - filled);
        const netOwedRounded = Math.ceil(netOwed);
        
        const notApproved = d.not_approved;
        const vacant = d.not_appointed;
        const totalLimbo = notApproved + vacant;
        const reported = d.reported;
        const pendingAction = Math.max(0, netOwedRounded - reported);

        html += `
            <tr>
                <td>${catName}</td>
                <td>${d.appo_2017.toLocaleString()}</td>
                <td class="text-secondary">${pct3.toFixed(2)}</td>
                <td>${d.appo_after_2017.toLocaleString()}</td>
                <td class="text-secondary">${pct4.toFixed(2)}</td>
                <td class="fw-bold text-danger bg-subtle-danger">${netOwed.toFixed(2)}</td>
                <td class="fw-bold text-success bg-subtle-success">${filled.toLocaleString()}</td>
                <td class="fw-bold text-white bg-dark border-secondary">${netOwedRounded.toLocaleString()}</td>
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

function generateAuditorRows(entry) {
    let html = '';
    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const catKey = `category_${String(i).padStart(2, '0')}`;
        let d = { appo_2017: 0, appo_after_2017: 0, manager_appo: 0, reported: 0, not_approved: 0, not_appointed: 0 };
        
        if (entry[catKey] && entry[catKey].length > 0) d = entry[catKey][0];

        const pct3 = (d.appo_2017 || 0) * 0.03;
        const pct4 = (d.appo_after_2017 || 0) * 0.04;
        const grossOwed = pct3 + pct4;
        const filled = d.manager_appo || 0;
        
        const netOwed = Math.max(0, grossOwed - filled);
        const netOwedRounded = Math.ceil(netOwed);
        
        const notApproved = d.not_approved || 0;
        const vacant = d.not_appointed || 0;
        const totalLimbo = notApproved + vacant;
        const reported = d.reported || 0;
        const pendingAction = Math.max(0, netOwedRounded - reported);

        html += `
            <tr>
                <td>${catName}</td>
                <td>${d.appo_2017}</td>
                <td class="text-secondary">${pct3.toFixed(2)}</td>
                <td>${d.appo_after_2017}</td>
                <td class="text-secondary">${pct4.toFixed(2)}</td>
                <td class="fw-bold text-danger bg-subtle-danger">${netOwed.toFixed(2)}</td>
                <td class="fw-bold text-success bg-subtle-success">${filled}</td>
                <td class="fw-bold text-white bg-dark border-secondary">${netOwedRounded}</td>
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

function getCategoryName(i) {
    return ['Primary (Cat 1)', 'High School (Cat 2)', 'Non-Teaching', 'HSST Sr.', 'HSST Jr.', 'VHST Sr.', 'VHST Jr.'][i-1] || `Cat ${i}`;
}