// Wait for the DOM to load before running the script
document.addEventListener("DOMContentLoaded", () => {
    loadData();
});

// Main function to fetch and process data
async function loadData() {
    try {
        // Fetch both data sources at the same time
        const [rosterResponse, candidatesResponse] = await Promise.all([
            fetch('roster_data.json'),
            fetch('candidates.json')
        ]);

        const rosterData = await rosterResponse.json();
        const candidateData = await candidatesResponse.json();

        // 1. Process Roster Data (The "Demand")
        const processedRoster = processRosterData(rosterData);
        
        // 2. Process Candidate Data (The "Supply")
        const processedCandidates = processCandidateData(candidateData);

        // 3. Render all visualizations
        renderSupplyDemandChart(processedRoster.totalAppointments, processedCandidates.totalCandidates);
        renderPostStatusChart(processedRoster.categories);
        
        // 4. Update summary text
        document.getElementById('verifiedCount').textContent = processedRoster.totalVerified;
        document.getElementById('totalSchoolCount').textContent = processedRoster.totalSchools;
        document.getElementById('notAppointedTotal').textContent = processedRoster.totalNotAppointed;

    } catch (error) {
        console.error("Failed to load or process data:", error);
        alert("Error: Could not load data files. Make sure 'roster_data.json' and 'candidates.json' exist.");
    }
}

/**
 * Processes roster_data.json
 * Calculates totals for charts and summary
 */
function processRosterData(data) {
    let totalVerified = 0;
    let totalSchools = 0;
    let totalAppointments = 0;
    let totalNotApproved = 0;
    let totalNotAppointed = 0;
    
    // An object to hold sums for each category
    const categories = {
        'Category - 1 (Primary)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 2 (High School)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 3 (Non Teaching)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 4 (HSST Sr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 5 (HSST Jr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 6 (VHST Sr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
        'Category - 7 (VHST Jr.)': { not_approved: 0, not_appointed: 0, manager_appo: 0 },
    };

    data.forEach(entry => {
        // Sum verification status
        totalVerified += entry.verf_status[0] || 0;
        totalSchools += entry.verf_status[1] || 0;

        // Loop through the 7 categories for each entry
        for (let i = 1; i <= 7; i++) {
            const catKey = `category_${String(i).padStart(2, '0')}`;
            const catName = getCategoryName(i); // Helper to get 'Category - 1 (Primary)'
            
            if (entry[catKey] && entry[catKey].length > 0) {
                const catData = entry[catKey][0];
                
                // Sum for Issue 03 & 04
                categories[catName].not_approved += catData.not_approved || 0;
                categories[catName].not_appointed += catData.not_appointed || 0;
                categories[catName].manager_appo += catData.manager_appo || 0;
                
                // Sum for Issue 01 (Demand)
                // "Demand" = total posts to be filled = manager_appo + not_approved + not_appointed
                const totalDemandForCat = (catData.manager_appo || 0) + (catData.not_approved || 0) + (catData.not_appointed || 0);
                totalAppointments += totalDemandForCat;
            }
        }
    });

    // Sum totals for the summary text
    totalNotAppointed = Object.values(categories).reduce((sum, cat) => sum + cat.not_appointed, 0);

    return { totalVerified, totalSchools, totalAppointments, totalNotAppointed, categories };
}

/**
 * Processes candidates.json
 * Calculates total available "Supply"
 */
function processCandidateData(data) {
    let totalCandidates = 0;
    
    data.forEach(entry => {
        // Sum the "Total" from all categories for each office
        totalCandidates += entry.NonTeaching.Total || 0;
        totalCandidates += entry.LPST.Total || 0;
        totalCandidates += entry.UPST.Total || 0;
        totalCandidates += entry.HST.Total || 0;
        totalCandidates += entry.HSST.Total || 0;
    });

    return { totalCandidates };
}

/**
 * Renders Chart 1: Supply vs Demand
 */
function renderSupplyDemandChart(demand, supply) {
    const ctx = document.getElementById('supplyDemandChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Posts (Demand)', 'Available Candidates (Supply)'],
            datasets: [{
                label: 'Count',
                data: [demand, supply],
                backgroundColor: [
                    'rgba(185, 0, 0, 0.6)', // Red for Demand
                    'rgba(0, 100, 150, 0.6)' // Blue for Supply
                ],
                borderColor: [
                    'rgba(185, 0, 0, 1)',
                    'rgba(0, 100, 150, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y', // Horizontal bar chart
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Supply of Candidates vs. Demand for Posts' }
            }
        }
    });
}

/**
 * Renders Chart 2: Post Status (Consequences)
 */
function renderPostStatusChart(categoryData) {
    const ctx = document.getElementById('postStatusChart').getContext('2d');
    
    const labels = Object.keys(categoryData);
    const notApprovedData = labels.map(l => categoryData[l].not_approved);
    const notAppointedData = labels.map(l => categoryData[l].not_appointed);
    const managerAppoData = labels.map(l => categoryData[l].manager_appo);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Not Appointed',
                    data: notAppointedData,
                    backgroundColor: 'rgba(255, 159, 64, 0.7)', // Orange
                },
                {
                    label: 'Not Approved',
                    data: notApprovedData,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)', // Red
                },
                {
                    label: 'Manager Appointed (Pending)',
                    data: managerAppoData,
                    backgroundColor: 'rgba(75, 192, 192, 0.7)', // Green
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true }, // Stack bars horizontally
                y: { stacked: true }  // Stack bars vertically
            },
            plugins: {
                title: { display: true, text: 'Status of Posts by Category (Consequences)' },
                tooltip: { mode: 'index' }
            }
        }
    });
}

// Helper to get category name from number
function getCategoryName(index) {
    const names = [
        'Category - 1 (Primary)', 'Category - 2 (High School)', 'Category - 3 (Non Teaching)',
        'Category - 4 (HSST Sr.)', 'Category - 5 (HSST Jr.)', 'Category - 6 (VHST Sr.)', 'Category - 7 (VHST Jr.)'
    ];
    return names[index - 1];
}