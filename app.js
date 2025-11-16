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

// --- Category Mappings (More accurate) ---
// Note: This mapping is based on your data. You may need to adjust which categories map to which post.
// "LPST" = Cat 1 (Primary)
// "UPST" = Cat 2 (High School)
// "NonTeaching" = Cat 3
// "HST" = Cat 4 (HSST Sr.) -> This is a guess, adjust if wrong
// "HSST" = Cat 5, 6, 7

const ROSTER_CATEGORY_MAP = {
    'LPST': ['category_01'],
    'UPST': ['category_02'],
    'NonTeaching': ['category_03'],
    'HST': ['category_04'], // Guess: HSST Sr.
    'HSST': ['category_05', 'category_06', 'category_07'], // Guess: HSST Jr, VHST Sr, VHST Jr
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
        // Alert the user if Chart.js is missing, as that was the previous error
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
            // Update active state
            const buttons = e.currentTarget.querySelectorAll('button');
            buttons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            // Show/hide sub-filter
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
    
    // Render KPI Cards
    const verificationRate = rosterStats.totalSchools > 0 ? ((rosterStats.totalVerified / rosterStats.totalSchools) * 100).toFixed(1) : 0;
    
    document.getElementById('kpi-total-limbo').textContent = rosterStats.totalLimbo.toLocaleString();
    document.getElementById('kpi-total-supply').textContent = candidateStats.totalSupply.toLocaleString();
    document.getElementById('kpi-verification-rate').textContent = `${verificationRate}%`;
    document.getElementById('kpi-verification-count').textContent = `(${rosterStats.totalVerified} / ${rosterStats.totalSchools})`;

    // Render Charts
    renderSupplyDemandChart(rosterStats.totalDemand, candidateStats.totalSupply);
    renderVerificationChart(rosterStats.totalVerified, rosterStats.totalSchools);
    renderPostStatusChart(rosterStats.categoryTotals);
    renderCandidateSupplyChart(candidateStats.supplyByPost);
    renderCandidateCategoryChart(candidateStats.supplyByDisability);
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
 */
function processRosterData(filter) {
    let totalVerified = 0, totalSchools = 0, totalLimbo = 0, totalDemand = 0;
    const keysToProcess = ROSTER_CATEGORY_MAP[filter.type] || [];
    
    const categoryTotals = {
        'Not Appointed': 0,
        'Not Approved': 0,
        'Manager Appointed': 0
    };

    allRosterData.forEach(entry => {
        totalVerified += entry.verf_status[0] || 0;
        totalSchools += entry.verf_status[1] || 0;

        keysToProcess.forEach(catKey => {
            if (entry[catKey] && entry[catKey].length > 0) {
                const data = entry[catKey][0];
                const notApproved = data.not_approved || 0;
                const notAppointed = data.not_appointed || 0;
                const managerAppo = data.manager_appo || 0;

                categoryTotals['Not Appointed'] += notAppointed;
                categoryTotals['Not Approved'] += notApproved;
                categoryTotals['Manager Appointed'] += managerAppo;
                
                totalLimbo += notApproved + notAppointed;
                totalDemand += notApproved + notAppointed + managerAppo;
            }
        });
    });
    
    return { totalVerified, totalSchools, totalLimbo, totalDemand, categoryTotals };
}

/**
 * Processes candidates.json based on the active filter
 * === THIS FUNCTION IS UPDATED ===
 */
function processCandidateData(filter) {
    let totalSupply = 0;
    const supplyByPost = {};
    
    // Initialize the object with the new display labels
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
                
                // --- THIS IS THE CHANGE ---
                // Map the new JSON keys (Visually_Impaired) to the display keys
                supplyByDisability['Visually Impaired'] += data.Visually_Impaired || 0;
                supplyByDisability['Hearing Impairment'] += data.Hearing_Impairment || 0;
                supplyByDisability['LD'] += data.LD || 0;
                supplyByDisability['Others'] += data.Others || 0;
            }
        });
    });
    
    return { totalSupply, supplyByPost, supplyByDisability };
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
            labels: ['Posts (Demand)', 'Candidates (Supply)'],
            datasets: [{ data: [demand, supply], backgroundColor: [CHART_COLORS.red, CHART_COLORS.blue] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
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

function renderPostStatusChart(categoryTotals) {
    const ctx = document.getElementById('postStatusChart').getContext('2d');
    destroyChart('postStatus');
    chartInstances.postStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryTotals),
            datasets: [{ data: Object.values(categoryTotals), backgroundColor: [CHART_COLORS.orange, CHART_COLORS.red, CHART_COLORS.green] }]
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
        type: 'bar',
        data: {
            labels: Object.keys(supplyByDisability), // Already the new labels
            datasets: [{ data: Object.values(supplyByDisability), backgroundColor: [CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.green, CHART_COLORS.grey] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// --- Interactive Search Filter Logic ---

/**
 * Fills the single <datalist> for global search
 */
function populateSearchFilters() {
    const datalist = document.getElementById('global-search-list');
    
    allRosterData.forEach(entry => {
        const option = new Option(entry.name_of_management, entry.name_of_management);
        datalist.appendChild(option);
    });

    allCandidateData.forEach(entry => {
        const option = new Option(entry.Office_Name, entry.Office_Name);
        datalist.appendChild(option);
    });
}

/**
 * Handles input from the global search bar
 */
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
 */
function renderManagementCard(entry) {
    let totalLimbo = 0;
    let tableHtml = `
        <thead class="table-light">
            <tr>
                <th>Category</th>
                <th>Manager Appointed</th>
                <th>Not Approved</th>
                <th>Not Appointed</th>
            </tr>
        </thead>
        <tbody>
    `;

    for (let i = 1; i <= 7; i++) {
        const catName = getCategoryName(i);
        const catKey = `category_${String(i).padStart(2, '0')}`;
        let row = { not_approved: 0, not_appointed: 0, manager_appo: 0 };
        
        if (entry[catKey] && entry[catKey].length > 0) {
            row = entry[catKey][0];
            totalLimbo += (row.not_approved || 0) + (row.not_appointed || 0);
        }
        
        tableHtml += `
            <tr>
                <td>${catName}</td>
                <td>${row.manager_appo || 0}</td>
                <td>${row.not_approved || 0}</td>
                <td>${row.not_appointed || 0}</td>
            </tr>
        `;
    }
    tableHtml += '</tbody>';

    document.getElementById('management-name').textContent = entry.name_of_management;
    document.getElementById('mgmt-kpi-status').textContent = `${entry.verf_status[0]} / ${entry.verf_status[1]}`;
    document.getElementById('mgmt-kpi-limbo').textContent = totalLimbo;
    document.getElementById('management-table').innerHTML = tableHtml;
}

/**
 * Renders the chart for the Candidate search result card
 * === THIS FUNCTION IS UPDATED ===
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
                // --- THIS IS THE CHANGE ---
                // Update the labels and data keys
                { label: 'Visually Impaired', data: labels.map(l => entry[l].Visually_Impaired), backgroundColor: CHART_COLORS.blue, },
                { label: 'Hearing Impairment', data: labels.map(l => entry[l].Hearing_Impairment), backgroundColor: CHART_COLORS.orange, },
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