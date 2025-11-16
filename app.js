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

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Fetch timestamps first
    fetchTimestamps();
    
    // 2. Load all data
    loadAllData();
    
    // 3. Setup event listeners for filters
    document.getElementById('management-filter').addEventListener('change', handleManagementFilter);
    document.getElementById('candidate-filter').addEventListener('change', handleCandidateFilter);
});

/**
 * Fetches timestamps from GitHub API
 * Relies on config.js for repo URL
 */
async function fetchTimestamps() {
    try {
        const rosterCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=roster_data.json&per_page=1`);
        const rosterCommits = await rosterCommitResponse.json();
        if (rosterCommits && rosterCommits.length > 0) {
            const lastChange = new Date(rosterCommits[0].commit.author.date);
            document.getElementById('roster-update-time').textContent = lastChange.toLocaleString();
        }

        const candidateCommitResponse = await fetch(`${GITHUB_REPO_URL}/commits?path=candidates.json&per_page=1`);
        const candidateCommits = await candidateCommitResponse.json();
        if (candidateCommits && candidateCommits.length > 0) {
            const lastChange = new Date(candidateCommits[0].commit.author.date);
            document.getElementById('candidate-update-time').textContent = lastChange.toLocaleString();
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

        // Once data is loaded, render the dashboard
        renderGlobalDashboard();
        populateFilters();

    } catch (error) {
        console.error("Failed to load or process data:", error);
        alert("Error: Could not load data files.");
    }
}

// --- Global Dashboard Rendering ---

/**
 * Calculates and renders all global (non-filtered) charts and KPIs
 */
function renderGlobalDashboard() {
    // --- 1. Process Roster Data ---
    let totalVerified = 0;
    let totalSchools = 0;
    let totalLimbo = 0;
    let totalNotApproved = 0;
    let totalNotAppointed = 0;
    let totalManagerAppointed = 0;
    
    const categoryTotals = {
        'Category - 1 (Primary)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 2 (High School)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 3 (Non Teaching)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 4 (HSST Sr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 5 (HSST Jr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 6 (VHST Sr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 7 (VHST Jr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
    };

    allRosterData.forEach(entry => {
        totalVerified += entry.verf_status[0] || 0;
        totalSchools += entry.verf_status[1] || 0;

        for (let i = 1; i <= 7; i++) {
            const catKey = `category_${String(i).padStart(2, '0')}`;
            const catName = getCategoryName(i);
            
            if (entry[catKey] && entry[catKey].length > 0) {
                const data = entry[catKey][0];
                const notApproved = data.not_approved || 0;
                const notAppointed = data.not_appointed || 0;
                const managerAppo = data.manager_appo || 0;

                categoryTotals[catName].not_approved += notApproved;
                categoryTotals[catName].not_appointed += notAppointed;
                categoryTotals[catName].manager_appo += managerAppo;
                
                totalLimbo += notApproved + notAppointed;
                totalNotApproved += notApproved;
                totalNotAppointed += notAppointed;
                totalManagerAppointed += managerAppo;
            }
        }
    });

    // --- 2. Process Candidate Data ---
    let totalSupply = 0;
    allCandidateData.forEach(entry => {
        totalSupply += entry.NonTeaching.Total || 0;
        totalSupply += entry.LPST.Total || 0;
        totalSupply += entry.UPST.Total || 0;
        totalSupply += entry.HST.Total || 0;
        totalSupply += entry.HSST.Total || 0;
    });

    // --- 3. Render KPI Cards ---
    const totalDemand = totalManagerAppointed + totalNotApproved + totalNotAppointed;
    const verificationRate = totalSchools > 0 ? ((totalVerified / totalSchools) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-limbo').textContent = totalLimbo.toLocaleString();
    document.getElementById('kpi-total-supply').textContent = totalSupply.toLocaleString();
    document.getElementById('kpi-verification-rate').textContent = `${verificationRate}%`;
    document.getElementById('kpi-verification-count').textContent = `(${totalVerified} / ${totalSchools})`;
    document.getElementById('kpi-total-managements').textContent = allRosterData.length.toLocaleString();

    // --- 4. Render Charts ---
    renderSupplyDemandChart(totalDemand, totalSupply);
    renderVerificationChart(totalVerified, totalSchools);
    renderPostStatusChart(categoryTotals);
}

/**
 * Renders Chart: Supply vs. Demand
 */
function renderSupplyDemandChart(demand, supply) {
    const ctx = document.getElementById('supplyDemandChart').getContext('2d');
    if (chartInstances.supplyDemand) chartInstances.supplyDemand.destroy();
    chartInstances.supplyDemand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Posts (Demand)', 'Available Candidates (Supply)'],
            datasets: [{
                label: 'Count',
                data: [demand, supply],
                backgroundColor: [CHART_COLORS.red, CHART_COLORS.blue],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
    });
}

/**
 * Renders Chart: Verification Status (Donut)
 */
function renderVerificationChart(verified, total) {
    const ctx = document.getElementById('verificationChart').getContext('2d');
    if (chartInstances.verification) chartInstances.verification.destroy();
    chartInstances.verification = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Verified', 'Pending'],
            datasets: [{
                data: [verified, total - verified],
                backgroundColor: [CHART_COLORS.green, CHART_COLORS.darkgrey],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

/**
 * Renders Chart: Post Status Breakdown (Stacked Bar)
 */
function renderPostStatusChart(categoryData) {
    const ctx = document.getElementById('postStatusChart').getContext('2d');
    if (chartInstances.postStatus) chartInstances.postStatus.destroy();
    
    const labels = Object.keys(categoryData);
    chartInstances.postStatus = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Not Appointed',
                    data: labels.map(l => categoryData[l].not_appointed),
                    backgroundColor: CHART_COLORS.orange,
                },
                {
                    label: 'Not Approved',
                    data: labels.map(l => categoryData[l].not_approved),
                    backgroundColor: CHART_COLORS.red,
                },
                {
                    label: 'Manager Appointed',
                    data: labels.map(l => categoryData[l].manager_appo),
                    backgroundColor: CHART_COLORS.green,
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: { tooltip: { mode: 'index' } }
        }
    });
}

// --- Interactive Filter Logic ---

/**
 * Fills the <select> dropdowns with data
 */
function populateFilters() {
    const mgmtFilter = document.getElementById('management-filter');
    allRosterData
        .sort((a, b) => a.name_of_management.localeCompare(b.name_of_management))
        .forEach(entry => {
            const option = new Option(entry.name_of_management, entry.name_of_management);
            mgmtFilter.add(option);
        });

    const candFilter = document.getElementById('candidate-filter');
    allCandidateData
        .sort((a, b) => a.Office_Name.localeCompare(b.Office_Name))
        .forEach(entry => {
            const option = new Option(entry.Office_Name, entry.Office_Name);
            candFilter.add(option);
        });
}

/**
 * Handles selection from the Management dropdown
 */
function handleManagementFilter(e) {
    const selectedName = e.target.value;
    const container = document.getElementById('management-details-container');
    
    if (!selectedName) {
        container.style.display = 'none';
        return;
    }

    const entry = allRosterData.find(m => m.name_of_management === selectedName);
    if (!entry) return;

    // --- Calculate KPIs for this management ---
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

    // --- Populate fields ---
    document.getElementById('management-name').textContent = entry.name_of_management;
    document.getElementById('mgmt-kpi-status').textContent = `${entry.verf_status[0]} / ${entry.verf_status[1]}`;
    document.getElementById('mgmt-kpi-limbo').textContent = totalLimbo;
    document.getElementById('management-table').innerHTML = tableHtml;
    container.style.display = 'block';
}

/**
 * Handles selection from the Candidate Office dropdown
 */
function handleCandidateFilter(e) {
    const selectedName = e.target.value;
    const container = document.getElementById('candidate-details-container');

    if (!selectedName) {
        container.style.display = 'none';
        return;
    }

    const entry = allCandidateData.find(m => m.Office_Name === selectedName);
    if (!entry) return;

    // --- Render the chart for this office ---
    document.getElementById('office-name').textContent = `Office: ${entry.Office_Name}`;
    container.style.display = 'block';
    
    const ctx = document.getElementById('candidateOfficeChart').getContext('2d');
    if (chartInstances.candidate) chartInstances.candidate.destroy();
    
    const labels = ['NonTeaching', 'LPST', 'UPST', 'HST', 'HSST'];
    chartInstances.candidate = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Blind',
                    data: labels.map(l => entry[l].Blind),
                    backgroundColor: CHART_COLORS.blue,
                },
                {
                    label: 'Deaf',
                    data: labels.map(l => entry[l].Deaf),
                    backgroundColor: CHART_COLORS.orange,
                },
                {
                    label: 'Handicapped',
                    data: labels.map(l => entry[l].Handi),
                    backgroundColor: CHART_COLORS.green,
                },
                {
                    label: 'Others',
                    data: labels.map(l => entry[l].Others),
                    backgroundColor: CHART_COLORS.grey,
                },
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
    return names[index - 1];
}