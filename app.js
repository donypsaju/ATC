// --- Global Data Store ---
let allRosterData = [];
let allCandidateData = [];
let chartInstances = {}; // To manage and destroy old charts

// --- Chart Colors (Bootstrap 5 Dark-Theme Friendly) ---
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
    'UPST': ['category_02'],
    'NonTeaching': ['category_03'],
    'HST': ['category_04'],
    'HSST': ['category_05', 'category_06', 'category_07'],
    'Primary': ['category_01', 'category_02'],
};
ROSTER_CATEGORY_MAP.Teaching = [
    ...ROSTER_CATEGORY_MAP.LPST, ...ROSTER_CATEGORY_MAP.UPST,
    ...ROSTER_CATEGORY_MAP.HST, ...ROSTER_CATEGORY_MAP.HSST
];
ROSTER_CATEGORY_MAP.All = [
    ...ROSTER_CATEGORY_MAP.Teaching, ...ROSTER_CATEGORY_MAP.NonTeaching
];

const CANDIDATE_CATEGORY_MAP = {
    'LPST': ['LPST'],
    'UPST': ['UPST'],
    'NonTeaching': ['NonTeaching'],
    'HST': ['HST'],
    'HSST': ['HSST'],
    'Primary': ['LPST', 'UPST'],
};
CANDIDATE_CATEGORY_MAP.Teaching = [
    ...CANDIDATE_CATEGORY_MAP.LPST, ...CANDIDATE_CATEGORY_MAP.UPST,
    ...CANDIDATE_CATEGORY_MAP.HST, ...CANDIDATE_CATEGORY_MAP.HSST
];
CANDIDATE_CATEGORY_MAP.All = [
    ...CANDIDATE_CATEGORY_MAP.Teaching, ...CANDIDATE_CATEGORY_MAP.NonTeaching
];

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    fetchTimestamps();
    loadAllData();
    setupFilterListeners();
});

/**
 * Fetches timestamps from GitHub API
 */
async function fetchTimestamps() {
    try {
        const rosterCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=roster_data.json&per_page=1`);
        const rosterCommits = await rosterCommitResponse.json();
        if (rosterCommits && rosterCommits.length > 0) {
            document.getElementById('roster-update-time').textContent = new Date(rosterCommits[0].commit.author.date).toLocaleString();
        }
        const candidateCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=candidates.json&per_page=1`);
        const candidateCommits = await candidateCommitResponse.json();
        if (candidateCommits && candidateCommits.length > 0) {
            document.getElementById('candidate-update-time').textContent = new Date(candidateCommits[0].commit.author.date).toLocaleString();
        }
    } catch (e) {
        console.error("Error fetching timestamps:", e);
        document.getElementById('roster-update-time').textContent = "Error";
        document.getElementById('candidate-update-time').textContent = "Error";
    }
}

/**
 * Loads both JSON data files and triggers rendering
 */
async function loadAllData() {
    try {
        const [rosterResponse, candidatesResponse] = await Promise.all([
            fetch('roster_data.json'),
            fetch('candidates.json')
        ]);
        allRosterData = await rosterResponse.json();
        allCandidateData = await candidatesResponse.json();

        document.getElementById('kpi-total-managements').textContent = allRosterData.length.toLocaleString();
        populateSearchFilters();
        updateDashboard(); // Initial render

    } catch (error) {
        console.error("Failed to load or process data:", error);
        if (typeof Chart === 'undefined') {
            alert("Error: Chart.js library is missing. Please check the index.html file.");
        } else {
            alert("Error: Could not load data files. Make sure roster_data.json and candidates.json exist.");
        }
    }
}

/**
 * Sets up listeners for all filters
 */
function setupFilterListeners() {
    // Main filter button group
    document.getElementById('filter-main').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const buttons = e.currentTarget.querySelectorAll('button');
            buttons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            const mainFilter = e.target.dataset.filter;
            const subFilterContainer = document.getElementById('sub-filter-container');
            subFilterContainer.style.display = (mainFilter === 'Teaching') ? 'block' : 'none';
            
            updateDashboard();
        }
    });
    
    // Sub-filter button group
    document.getElementById('filter-sub').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const buttons = e.currentTarget.querySelectorAll('button');
            buttons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });
    
    // Global search input
    document.getElementById('global-search').addEventListener('input', handleGlobalSearch);
}

/**
 * Main function to re-calculate and re-render the entire dashboard
 */
function updateDashboard() {
    const filter = getActiveFilter();
    
    const rosterStats = processRosterData(filter);
    const candidateStats = processCandidateData(filter);
    
    // --- Render KPI Cards (METRIC 1 & 2) ---
    const verificationRate = rosterStats.totalSchools > 0 ? ((rosterStats.totalVerified / rosterStats.totalSchools) * 100).toFixed(1) : 0;
    const filledPct = rosterStats.totalPostsOwed > 0 ? ((rosterStats.totalManagerAppointed / rosterStats.totalPostsOwed) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-owed').textContent = Math.round(rosterStats.totalPostsOwed).toLocaleString();
    document.getElementById('kpi-total-supply').textContent = candidateStats.totalSupply.toLocaleString();
    document.getElementById('kpi-total-entries').textContent = `(from ${candidateStats.totalRTIEntries} RTI entries)`; // Metric 1
    
    document.getElementById('kpi-total-filled').textContent = rosterStats.totalManagerAppointed.toLocaleString();
    document.getElementById('kpi-total-filled-pct').textContent = `(${filledPct}% of posts owed)`;
    
    document.getElementById('kpi-total-limbo').textContent = rosterStats.totalLimbo.toLocaleString();
    document.getElementById('kpi-verification-count').textContent = `(${rosterStats.totalVerified} / ${rosterStats.totalSchools} Schools Verified)`;


    // --- Render Charts ---
    renderSupplyDemandChart(rosterStats.totalPostsOwed, candidateStats.totalSupply);
    renderVerificationChart(rosterStats.totalVerified, rosterStats.totalSchools);
    // New logic for this chart:
    const postsUnaccounted = rosterStats.totalPostsOwed - rosterStats.totalManagerAppointed - rosterStats.totalReported;
    renderPostStatusChart({
        'Filled by Mgmt': rosterStats.totalManagerAppointed,
        'Reported to Exchange': rosterStats.totalReported,
        'Posts Unaccounted': Math.max(0, postsUnaccounted), // Ensure it's not negative
    });
    renderCandidateSupplyChart(candidateStats.supplyByPost);
    renderCandidateCategoryChart(candidateStats.supplyByDisability);

    // --- Render Key Findings (METRIC 3) ---
    renderKeyFindings(rosterStats, candidateStats);
}

/**
 * Reads the current filter buttons
 */
function getActiveFilter() {
    const mainFilterBtn = document.querySelector('#filter-main .btn.active');
    const main = mainFilterBtn ? mainFilterBtn.dataset.filter : 'All';
    
    let sub = 'All';
    if (main === 'Teaching') {
        const subFilterBtn = document.querySelector('#filter-sub .btn.active');
        sub = subFilterBtn ? subFilterBtn.dataset.filter : 'All';
    }

    if (main === 'Teaching' && sub !== 'All') return { type: sub }; // LPST, Primary, etc.
    return { type: main }; // All, Teaching, NonTeaching
}

/**
 * Processes roster_data.json based on the active filter
 * === THIS FUNCTION IS UPDATED (METRIC 2) ===
 */
function processRosterData(filter) {
    let totalVerified = 0, totalSchools = 0, totalLimbo = 0;
    let totalPostsOwed = 0, totalManagerAppointed = 0, totalReported = 0, totalNotApproved = 0;

    const keysToProcess = ROSTER_CATEGORY_MAP[filter.type] || [];
    
    allRosterData.forEach(entry => {
        // Verification status is always calculated, regardless of filter
        totalVerified += entry.verf_status[0] || 0;
        totalSchools += entry.verf_status[1] || 0;

        keysToProcess.forEach(catKey => {
            if (entry[catKey] && entry[catKey].length > 0) {
                const data = entry[catKey][0];
                
                // NEW: Calculate total owed posts (METRIC 2)
                const owedFrom2017 = (data.appo_2017 || 0) * 0.03;
                const owedAfter2017 = (data.appo_after_2017 || 0) * 0.04;
                totalPostsOwed += owedFrom2017 + owedAfter2017;

                // Other metrics
                totalManagerAppointed += data.manager_appo || 0;
                totalReported += data.reported || 0;
                totalLimbo += (data.not_approved || 0) + (data.not_appointed || 0);
                totalNotApproved += data.not_approved || 0;
            }
        });
    });
    
    return { 
        totalVerified, 
        totalSchools, 
        totalLimbo, 
        totalPostsOwed, 
        totalManagerAppointed, 
        totalReported,
        totalNotApproved
    };
}

/**
 * Processes candidates.json based on the active filter
 * === THIS FUNCTION IS UPDATED (METRIC 1) ===
 */
function processCandidateData(filter) {
    let totalSupply = 0;
    const supplyByPost = {};
    const supplyByDisability = {
        'Visually Impaired': 0,
        'Hearing Impairment': 0,
        'LD': 0,
        'Others': 0
    };
    
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
    
    // METRIC 1: Get total number of RTI entries
    const totalRTIEntries = allCandidateData.length;
    
    return { totalSupply, supplyByPost, supplyByDisability, totalRTIEntries };
}

/**
 * Populates the "Key Findings" card
 * === THIS FUNCTION IS NEW (METRIC 3) ===
 */
function renderKeyFindings(rosterStats, candidateStats) {
    const owed = Math.round(rosterStats.totalPostsOwed);
    const supply = candidateStats.totalSupply;
    const filled = rosterStats.totalManagerAppointed;
    const reported = rosterStats.totalReported;
    const notApproved = rosterStats.totalNotApproved;
    
    // The "Gap" = Posts Owed - Posts Filled - Posts Reported
    const unaccounted = Math.round(owed - filled - reported);
    
    // Finding 1: The Supply/Demand Mismatch
    document.getElementById('finding-1').innerHTML = 
        `There is a demand for <strong>${owed.toLocaleString()}</strong> legally-owed PWD posts, but only <strong>${supply.toLocaleString()}</strong> qualified candidates are available in the exchanges.`;
        
    // Finding 2: The Action Gap
    document.getElementById('finding-2').innerHTML = 
        `Of the ${owed.toLocaleString()} posts owed, <strong>${filled.toLocaleString()}</strong> have been filled and <strong>${reported.toLocaleString()}</strong> reported. <strong>${unaccounted.toLocaleString()} posts are unaccounted for.</strong>`;

    // Finding 3: The Consequence
    document.getElementById('finding-3').innerHTML = 
        `A total of <strong>${rosterStats.totalLimbo.toLocaleString()}</strong> appointments (for all candidates) are currently in limbo, stuck as "Not Approved" or "Not Appointed".`;
}


// --- Chart Rendering Functions ---

function destroyChart(name) {
    if (chartInstances[name]) chartInstances[name].destroy();
}

// Config for all charts
Chart.defaults.color = '#ccc';
Chart.defaults.borderColor = '#555';

function renderSupplyDemandChart(demand, supply) {
    const ctx = document.getElementById('supplyDemandChart').getContext('2d');
    destroyChart('supplyDemand');
    chartInstances.supplyDemand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Posts Owed (Demand)', 'Candidates (Supply)'],
            datasets: [{ data: [demand, supply], backgroundColor: [CHART_COLORS.red, CHART_COLORS.blue] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderVerificationChart(verified, total) {
    const ctx = document.getElementById('verificationChart').getContext('2d');
    destroyChart('verification');
    chartInstances.verification = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Verified', 'Pending'],
            datasets: [{ 
                label: 'Schools',
                data: [verified, total - verified], 
                backgroundColor: [CHART_COLORS.green, CHART_COLORS.grey] 
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: 'y' }
    });
}

function renderPostStatusChart(statusTotals) {
    const ctx = document.getElementById('postStatusChart').getContext('2d');
    destroyChart('postStatus');
    chartInstances.postStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusTotals),
            datasets: [{ data: Object.values(statusTotals), backgroundColor: [CHART_COLORS.green, CHART_COLORS.blue, CHART_COLORS.orange] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderCandidateSupplyChart(supplyByPost) {
    const ctx = document.getElementById('candidateSupplyChart').getContext('2d');
    destroyChart('candidateSupply');
    chartInstances.candidateSupply = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(supplyByPost),
            datasets: [{ data: Object.values(supplyByPost), backgroundColor: CHART_COLORS.blue }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderCandidateCategoryChart(supplyByDisability) {
    const ctx = document.getElementById('candidateCategoryChart').getContext('2d');
    destroyChart('candidateCategory');
    chartInstances.candidateCategory = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(supplyByDisability),
            datasets: [{ data: Object.values(supplyByDisability), backgroundColor: [CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.green, CHART_COLORS.grey] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// --- Interactive Search Filter Logic ---

function populateSearchFilters() {
    const datalist = document.getElementById('global-search-list');
    allRosterData.forEach(entry => {
        datalist.appendChild(new Option(entry.name_of_management, entry.name_of_management));
    });
    allCandidateData.forEach(entry => {
        datalist.appendChild(new Option(entry.Office_Name, entry.Office_Name));
    });
}

function handleGlobalSearch(e) {
    const selectedName = e.target.value;
    const resultsRow = document.getElementById('search-results-row');
    const mgmtContainer = document.getElementById('management-details-container');
    const candContainer = document.getElementById('candidate-details-container');

    const mgmtEntry = allRosterData.find(m => m.name_of_management === selectedName);
    const candEntry = allCandidateData.find(m => m.Office_Name === selectedName);

    mgmtContainer.style.display = 'none';
    candContainer.style.display = 'none';

    if (mgmtEntry) {
        renderManagementCard(mgmtEntry);
        mgmtContainer.style.display = 'block';
        resultsRow.style.display = 'flex';
    } else if (candEntry) {
        renderCandidateCard(candEntry);
        candContainer.style.display = 'block';
        resultsRow.style.display = 'flex';
    } else if (!selectedName) {
        resultsRow.style.display = 'none';
    }
}

/**
 * Populates the Management search result card
 * === THIS FUNCTION IS UPDATED (METRIC 2) ===
 */
function renderManagementCard(entry) {
    let totalLimbo = 0;
    let totalOwed = 0;
    let totalFilled = 0;
    let tableHtml = `
        <thead class="table-light">
            <tr>
                <th>Category</th>
                <th>Owed (Law)</th>
                <th>Filled (Mgmt)</th>
                <th>Reported</th>
                <th>Not Approved</th>
                <th>Not Appointed</th>
            </tr>
        </thead>
        <tbody>
    `;

    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const catKey = `category_${String(i).padStart(2, '0')}`;
        let row = { appo_2017: 0, appo_after_2017: 0, manager_appo: 0, reported: 0, not_approved: 0, not_appointed: 0 };
        
        if (entry[catKey] && entry[catKey].length > 0) {
            row = entry[catKey][0];
        }

        const owed = (row.appo_2017 * 0.03) + (row.appo_after_2017 * 0.04);
        totalOwed += owed;
        totalFilled += row.manager_appo || 0;
        totalLimbo += (row.not_approved || 0) + (row.not_appointed || 0);
        
        tableHtml += `
            <tr>
                <td>${catName}</td>
                <td>${owed.toFixed(2)}</td>
                <td>${row.manager_appo || 0}</td>
                <td>${row.reported || 0}</td>
                <td>${row.not_approved || 0}</td>
                <td>${row.not_appointed || 0}</td>
            </tr>
        `;
    }
    tableHtml += '</tbody>';

    document.getElementById('management-name').textContent = entry.name_of_management;
    document.getElementById('mgmt-kpi-status').textContent = `${entry.verf_status[0]} / ${entry.verf_status[1]}`;
    document.getElementById('mgmt-kpi-owed').textContent = totalOwed.toFixed(2);
    document.getElementById('mgmt-kpi-filled').textContent = totalFilled;
    document.getElementById('management-table').innerHTML = tableHtml;
}

/**
 * Renders the chart for the Candidate search result card
 */
function renderCandidateCard(entry) {
    document.getElementById('office-name').textContent = `Office: ${entry.Office_Name}`;
    
    const ctx = document.getElementById('candidateOfficeChart').getContext('2d');
    destroyChart('candidate');
    
    const labels = ['NonTeaching', 'LPST', 'UPST', 'HST', 'HSST'];
    chartInstances.candidate = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Visually Impaired', data: labels.map(l => entry[l].VisuallyImpaired), backgroundColor: CHART_COLORS.blue, },
                { label: 'Hearing Impairment', data: labels.map(l => entry[l].HearingImpairment), backgroundColor: CHART_COLORS.orange, },
                { label: 'LD', data: labels.map(l => entry[l].LD), backgroundColor: CHART_COLORS.green, },
                { label: 'Others', data: labels.map(l => entry[l].Others), backgroundColor: CHART_COLORS.grey, },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: { tooltip: { mode: 'index' } }
        }
    });
}

/**
* Helper to get simple category names
*/
function getCategoryName(index) {
    const simpleNames = ['LPST', 'UPST', 'Non-Teaching', 'HST', 'HSST', 'VHST Sr', 'VHST Jr'];
    return simpleNames[index - 1] || `Cat ${index}`;
}