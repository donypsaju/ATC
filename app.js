// --- Global Data Store ---
let allRosterData = [];
let allCandidateData = [];
let chartInstances = {}; // To manage and destroy old charts

// --- Chart Colors ---
const CHART_COLORS = {
    red: 'rgb(255, 99, 132)',
    orange: 'rgb(255, 159, 64)',
    green: 'rgb(75, 192, 192)',
    blue: 'rgb(54, 162, 235)',
    purple: 'rgb(153, 102, 255)',
    grey: 'rgb(201, 203, 207)',
    darkgrey: 'rgb(101, 103, 107)'
};

// --- Category Mappings ---
const ROSTER_CATEGORY_MAP = {
    'LPST': ['category_01'],
    'UPST': ['category_02'], // Assuming UPST is cat 2
    'NonTeaching': ['category_03'],
    'HST': ['category_04'], // Assuming HST is cat 4 (HSST Sr.)
    'HSST': ['category_05', 'category_06', 'category_07'], // Assuming HSST is all others
    'Primary': ['category_01', 'category_02'],
};
ROSTER_CATEGORY_MAP.Teaching = [
    ...ROSTER_CATEGORY_MAP.LPST,
    ...ROSTER_CATEGORY_MAP.UPST,
    ...ROSTER_CATEGORY_MAP.HST,
    ...ROSTER_CATEGORY_MAP.HSST
];
ROSTER_CATEGORY_MAP.All = [
    ...ROSTER_CATEGORY_MAP.Teaching,
    ...ROSTER_CATEGORY_MAP.NonTeaching
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
    ...CANDIDATE_CATEGORY_MAP.LPST,
    ...CANDIDATE_CATEGORY_MAP.UPST,
    ...CANDIDATE_CATEGORY_MAP.HST,
    ...CANDIDATE_CATEGORY_MAP.HSST
];
CANDIDATE_CATEGORY_MAP.All = [
    ...CANDIDATE_CATEGORY_MAP.Teaching,
    ...CANDIDATE_CATEGORY_MAP.NonTeaching
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

        // Once data is loaded, populate static elements
        document.getElementById('kpi-total-managements').textContent = allRosterData.length.toLocaleString();
        populateSearchFilters();
        
        // Trigger the first dashboard render
        updateDashboard();

    } catch (error) {
        console.error("Failed to load or process data:", error);
        alert("Error: Could not load data files.");
    }
}

/**
 * Sets up listeners for all filters
 */
function setupFilterListeners() {
    document.getElementById('filter-main').addEventListener('change', () => {
        const mainFilter = document.getElementById('filter-main').value;
        const subFilterContainer = document.getElementById('sub-filter-container');
        
        // Show/hide sub-filter
        subFilterContainer.style.display = (mainFilter === 'Teaching') ? 'flex' : 'none';
        
        // Reset sub-filter when main changes
        if(mainFilter !== 'Teaching') {
             document.getElementById('filter-sub').value = "All";
        }
        
        updateDashboard();
    });
    
    document.getElementById('filter-sub').addEventListener('change', updateDashboard);
    
    // UPDATED: Use 'input' event for search-as-you-type feel
    document.getElementById('management-search').addEventListener('input', handleManagementSearch);
    document.getElementById('candidate-search').addEventListener('input', handleCandidateSearch);
}

/**
 * Main function to re-calculate and re-render the entire dashboard
 */
function updateDashboard() {
    const filter = getActiveFilter();
    
    // 1. Process data based on filter
    const rosterStats = processRosterData(filter);
    const candidateStats = processCandidateData(filter);
    
    // 2. Render KPI Cards
    const verificationRate = rosterStats.totalSchools > 0 ? ((rosterStats.totalVerified / rosterStats.totalSchools) * 100).toFixed(1) : 0;
    
    document.getElementById('kpi-total-limbo').textContent = rosterStats.totalLimbo.toLocaleString();
    document.getElementById('kpi-total-supply').textContent = candidateStats.totalSupply.toLocaleString();
    document.getElementById('kpi-verification-rate').textContent = `${verificationRate}%`;
    document.getElementById('kpi-verification-count').textContent = `(${rosterStats.totalVerified} / ${rosterStats.totalSchools})`;

    // 3. Render Charts
    renderSupplyDemandChart(rosterStats.totalDemand, candidateStats.totalSupply);
    renderVerificationChart(rosterStats.totalVerified, rosterStats.totalSchools);
    renderPostStatusChart(rosterStats.categoryTotals);
    renderCandidateSupplyChart(candidateStats.supplyByPost);
    renderCandidateCategoryChart(candidateStats.supplyByDisability);
}

/**
 * Reads the current filter dropdowns
 */
function getActiveFilter() {
    const main = document.getElementById('filter-main').value; // All, Teaching, NonTeaching
    let sub = document.getElementById('filter-sub').value; // All, LPST, etc.
    
    // If main filter isn't Teaching, ignore sub-filter
    if (main !== 'Teaching') {
        sub = 'All'; // Treat as 'All'
    }
    
    // If sub-filter is 'All', the true filter is the main 'Teaching' one
    if (main === 'Teaching' && sub === 'All') {
         return { type: 'Teaching' };
    }
    
    // If a sub-filter is chosen, it's the most specific
    if (sub !== 'All') {
        return { type: sub }; // LPST, Primary, HST...
    }
    
    // Otherwise, it's the main filter
    return { type: main }; // All, NonTeaching
}

/**
 * Processes roster_data.json based on the active filter
 */
function processRosterData(filter) {
    let totalVerified = 0, totalSchools = 0, totalLimbo = 0, totalDemand = 0;
    
    // Get the roster category keys to process (e.g., ['category_01', 'category_02'])
    const keysToProcess = ROSTER_CATEGORY_MAP[filter.type];
    
    // Reset category totals object
    const categoryTotals = {
        'Not Appointed': 0,
        'Not Approved': 0,
        'Manager Appointed': 0
    };

    allRosterData.forEach(entry => {
        // Verification status is always calculated, regardless of filter
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
 */
function processCandidateData(filter) {
    let totalSupply = 0;
    const supplyByPost = {}; // For candidate supply chart
    const supplyByDisability = { 'Blind': 0, 'Deaf': 0, 'Handi': 0, 'Others': 0 };
    
    // Get the candidate category keys to process (e.g., ['LPST', 'UPST'])
    const keysToProcess = CANDIDATE_CATEGORY_MAP[filter.type];

    allCandidateData.forEach(entry => {
        keysToProcess.forEach(catKey => {
            if (entry[catKey]) {
                const data = entry[catKey];
                const total = data.Total || 0;
                
                totalSupply += total;
                
                // Add to supply by post (for chart)
                supplyByPost[catKey] = (supplyByPost[catKey] || 0) + total;
                
                // Add to supply by disability (for chart)
                supplyByDisability.Blind += data.Blind || 0;
                supplyByDisability.Deaf += data.Deaf || 0;
                supplyByDisability.Handi += data.Handi || 0;
                supplyByDisability.Others += data.Others || 0;
            }
        });
    });
    
    return { totalSupply, supplyByPost, supplyByDisability };
}

// --- Chart Rendering Functions ---

function destroyChart(name) {
    if (chartInstances[name]) chartInstances[name].destroy();
}

function renderSupplyDemandChart(demand, supply) {
    const ctx = document.getElementById('supplyDemandChart').getContext('2d');
    destroyChart('supplyDemand');
    chartInstances.supplyDemand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Posts (Demand)', 'Available Candidates (Supply)'],
            datasets: [{
                data: [demand, supply],
                backgroundColor: [CHART_COLORS.red, CHART_COLORS.blue],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
    });
}

function renderVerificationChart(verified, total) {
    const ctx = document.getElementById('verificationChart').getContext('2d');
    destroyChart('verification');
    chartInstances.verification = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Verified', 'Pending'],
            datasets: [{
                data: [verified, total - verified],
                backgroundColor: [CHART_COLORS.green, CHART_COLORS.darkgrey],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderPostStatusChart(categoryTotals) {
    const ctx = document.getElementById('postStatusChart').getContext('2d');
    destroyChart('postStatus');
    chartInstances.postStatus = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(categoryTotals),
            datasets: [{
                data: Object.values(categoryTotals),
                backgroundColor: [CHART_COLORS.orange, CHART_COLORS.red, CHART_COLORS.green],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderCandidateSupplyChart(supplyByPost) {
    const ctx = document.getElementById('candidateSupplyChart').getContext('2d');
    destroyChart('candidateSupply');
    chartInstances.candidateSupply = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(supplyByPost),
            datasets: [{
                data: Object.values(supplyByPost),
                backgroundColor: [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.purple, CHART_COLORS.orange, CHART_COLORS.grey],
            }]
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
            datasets: [{
                data: Object.values(supplyByDisability),
                backgroundColor: [CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.green, CHART_COLORS.grey],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// --- Interactive Search Filter Logic ---

/**
 * Fills the <datalist> elements for searching
 */
function populateSearchFilters() {
    const mgmtDatalist = document.getElementById('management-list');
    allRosterData
        .sort((a, b) => a.name_of_management.localeCompare(b.name_of_management))
        .forEach(entry => {
            const option = new Option(entry.name_of_management, entry.name_of_management);
            mgmtDatalist.appendChild(option);
        });

    const candDatalist = document.getElementById('candidate-list');
    allCandidateData
        .sort((a, b) => a.Office_Name.localeCompare(b.Office_Name))
        .forEach(entry => {
            const option = new Option(entry.Office_Name, entry.Office_Name);
            candDatalist.appendChild(option);
        });
}

/**
 * Handles selection from the Management search
 */
function handleManagementSearch(e) {
    const selectedName = e.target.value;
    const container = document.getElementById('management-details-container');
    const entry = allRosterData.find(m => m.name_of_management === selectedName);

    if (!entry) {
        container.style.display = 'none';
        return;
    }
    
    let totalLimbo = 0;
    let tableHtml = `
        <thead>
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
        const catKey = `category_${String(i).padStart(2, '0')}`;
        const catName = getCategoryName(i);
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
    container.style.display = 'block';
}

/**
 * Handles selection from the Candidate Office search
 */
function handleCandidateSearch(e) {
    const selectedName = e.target.value;
    const container = document.getElementById('candidate-details-container');
    const entry = allCandidateData.find(m => m.Office_Name === selectedName);

    if (!entry) {
        container.style.display = 'none';
        return;
    }

    document.getElementById('office-name').textContent = `Office: ${entry.Office_Name}`;
    container.style.display = 'block';
    
    const ctx = document.getElementById('candidateOfficeChart').getContext('2d');
    destroyChart('candidate');
    
    const labels = ['NonTeaching', 'LPST', 'UPST', 'HST', 'HSST'];
    chartInstances.candidate = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Blind', data: labels.map(l => entry[l].Blind), backgroundColor: CHART_COLORS.blue, },
                { label: 'Deaf', data: labels.map(l => entry[l].Deaf), backgroundColor: CHART_COLORS.orange, },
                { label: 'Handicapped', data: labels.map(l => entry[l].Handi), backgroundColor: CHART_COLORS.green, },
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

// --- Helper Functions ---
function getCategoryName(index) {
    const names = [
        'Category - 1 (Primary)', 'Category - 2 (High School)', 'Category - 3 (Non Teaching)',
        'Category - 4 (HSST Sr.)', 'Category - 5 (HSST Jr.)', 'Category - 6 (VHST Sr.)', 'Category - 7 (VHST Jr.)'
    ];
    // This is a guess from your old data. Update this if the names are wrong.
    const simpleNames = ['LPST', 'UPST', 'Non-Teaching', 'HSST Sr', 'HSST Jr', 'VHST Sr', 'VHST Jr'];
    return simpleNames[index - 1] || `Category ${index}`;
}