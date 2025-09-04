import {
    calculateTotalSpent,
    calculateAverageAndMedianBill,
    calculateWeekdayProfile,
    calculateTimeOfDayMix,
    calculateSeasonality,
    calculateSpendVolatility,
    calculateLocalVsTravelShare,
    calculateFamilyInvolvement,
    calculateStreaks,
    calculateWeekendEffect,
    calculateAttachmentCoverage,
    calculateCityMix,
    checkFirstBite,
    checkTallinnLoyalist,
    checkGlobeTaster,
    checkWeekendWarrior,
    checkBudgetNinja,
    checkConsistencyStreak,
    checkTravelPremiumCrusher,
    checkFamilyFeast,
    check500Month,
    checkPhotoHistorian
} from './utils/calculators.js';

document.addEventListener('DOMContentLoaded', () => {
    const insightsGrid = document.getElementById('insights-grid');
    if (insightsGrid) {
        fetchDataAndRender();
    }
});

async function fetchDataAndRender() {
    try {
        const response = await fetch('/api/airtable');
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }
        const data = await response.json();
        const records = data.records || [];

        // Once data is fetched, process and render it
        processAndRenderInsights(records);
        processAndRenderAchievements(records);

        // Hide the loader
        document.getElementById('loader-container').style.display = 'none';
    } catch (error) {
        console.error('Failed to fetch or render data:', error);
        document.getElementById('insights-grid').innerHTML = `<p class="text-red-500">Error loading data.</p>`;
        // Hide the loader even if there's an error
        document.getElementById('loader-container').style.display = 'none';
    }
}

function processAndRenderInsights(records) {
    const insightsGrid = document.getElementById('insights-grid');
    insightsGrid.innerHTML = ''; // Clear previous content

    // Filter records for calculations
    const localRecords = records.filter(r => r.fields['Spend Type'] === 'Local');
    const travelRecords = records.filter(r => r.fields['Spend Type'] === 'Travel');

    const insights = [
        { title: 'Total Spent', value: `Local: ${calculateTotalSpent(records).local.ytd}€ (YTD) <br>Travel: ${calculateTotalSpent(records).travel.ytd}€ (YTD)`, icon: 'paid', color: 'var(--primary-color)', description: 'Total amount spent year-to-date (YTD) for local and travel categories.' },
        { title: 'Average Bill', value: `Local: ${calculateAverageAndMedianBill(localRecords, travelRecords).local.avg}€<br>Travel: ${calculateAverageAndMedianBill(localRecords, travelRecords).travel.avg}€`, icon: 'monitoring', color: 'var(--accent-purple)', description: 'The average cost of a single restaurant bill, separated by local and travel.' },
        { title: 'Weekday Profile', chartId: 'weekdayProfileChart', type: 'bar', data: calculateWeekdayProfile(records), icon: 'calendar_month', color: 'var(--accent-blue)', description: 'Average spending for each day of the week.' },
        { title: 'Time-of-day Mix', chartId: 'timeOfDayChart', type: 'pie', data: calculateTimeOfDayMix(records), icon: 'schedule', color: 'var(--accent-yellow)', description: 'A breakdown of spending by time of day: Breakfast (06-10), Lunch (10-15), Dinner (18-22), and Late Night (22-03).' },
        { title: 'Seasonality & Trend', chartId: 'seasonalityChart', type: 'line', data: calculateSeasonality(records), icon: 'trending_up', color: 'var(--primary-color)', colSpan: 'lg:col-span-2', description: 'Monthly total spend and a 3-month moving average to show trends over time.' },
        { title: 'Spend Volatility', value: `Std Dev: ${calculateSpendVolatility(records).stdDev}€<br>Outlier Days: ${calculateSpendVolatility(records).outlierDays}`, icon: 'warning', color: 'var(--accent-red)', description: 'Measures how much your daily spending varies. A higher value means more unpredictable spending. Outlier days are unusually high spending days.' },
        { title: 'Spend Share (€)', chartId: 'spendShareValueChart', type: 'pie', data: { labels: calculateLocalVsTravelShare(localRecords, travelRecords).labels, data: calculateLocalVsTravelShare(localRecords, travelRecords).valueData }, icon: 'public', color: 'var(--accent-purple)', description: 'The share of total spending between local and travel categories.' },
        { title: 'Travel Premium', value: `${calculateLocalVsTravelShare(localRecords, travelRecords).travelPremium}x`, icon: 'flight_takeoff', color: 'var(--accent-blue)', description: 'The ratio of your average travel bill to your average local bill. A value of 1.5x means you spend 50% more on average when traveling.' },
        { title: 'Avg. Cost per Person', value: Object.entries(calculateFamilyInvolvement(records)).map(([size, avg]) => `${size}p: ${avg}€`).join('<br>') || 'N/A', icon: 'groups', color: 'var(--accent-yellow)', description: 'The average cost per person when dining with family members.' },
        { title: 'Dining Streaks', value: `Streak: ${calculateStreaks(records).longestStreak} days<br>Gap: ${calculateStreaks(records).longestGap} days`, icon: 'local_fire_department', color: 'var(--accent-red)', description: 'The longest streak of consecutive days with a restaurant bill, and the longest gap without one.' },
        { title: 'Weekend Effect', value: `Δ ${calculateWeekendEffect(records).deltaPercent}%`, icon: 'deck', color: 'var(--primary-color)', description: 'The percentage difference in average spending between weekends (Sat-Sun) and weekdays (Mon-Fri).' },
        { title: 'Photo Coverage', value: `${calculateAttachmentCoverage(records).coveragePercent}%`, icon: 'attachment', color: 'var(--accent-purple)', description: 'The percentage of your bills that have a photo attached.' },
        { title: 'Top Travel City', value: (calculateCityMix(records, 'Tallinn').top5[0] || ['N/A'])[0], icon: 'flight', color: 'var(--accent-blue)', description: 'The city where you have spent the most money while traveling (excluding Tallinn).' },
    ];

    const chartInsights = [];

    insights.forEach(insight => {
        if (insight.type) { // It's a chart
            insightsGrid.innerHTML += createInsightCard(insight.title, `<canvas id="${insight.chartId}"></canvas>`, true, insight.icon, insight.color, insight.colSpan);
            chartInsights.push(insight);
        } else { // It's text
            insightsGrid.innerHTML += createInsightCard(insight.title, insight.value, false, insight.icon, insight.color, insight.colSpan);
        }
    });

    initTooltips();

    // Render charts and animations after a short delay to ensure DOM is updated
    setTimeout(() => {
        chartInsights.forEach(insight => {
            if (insight.type === 'bar') renderBarChart(insight.chartId, insight.title, insight.data.labels, insight.data.data);
            if (insight.type === 'pie') renderPieChart(insight.chartId, insight.title, insight.data.labels, insight.data.data);
            if (insight.type === 'line') renderLineChart(insight.chartId, insight.title, insight.data.labels, insight.data.datasets);
        });
        animateCountUp();
    }, 0);
}

function processAndRenderAchievements(records) {
    const achievementsGrid = document.getElementById('achievements-grid');
    achievementsGrid.innerHTML = ''; // Clear previous content

    const achievements = [
        { name: 'First Bite', desc: 'First restaurant bill', unlocked: checkFirstBite(records), icon: 'restaurant' },
        { name: 'Tallinn Loyalist', desc: '≥20 local bills in 90 days', unlocked: checkTallinnLoyalist(records), icon: 'location_city' },
        { name: 'Globe Taster', desc: 'Bills in ≥3 countries', unlocked: checkGlobeTaster(records), icon: 'public' },
        { name: 'Weekend Warrior', desc: 'Bills on 6 consecutive weekends', unlocked: checkWeekendWarrior(records), icon: 'sports_esports' },
        { name: 'Budget Ninja', desc: '2 months avg. bill ≤ 6-mo avg -15%', unlocked: checkBudgetNinja(records), icon: 'savings' },
        { name: 'Consistency Streak', desc: '10+ consecutive days with a bill', unlocked: checkConsistencyStreak(records), icon: 'event_repeat' },
        { name: 'Travel Premium Crusher', desc: 'A trip where avg travel bill was cheap', unlocked: checkTravelPremiumCrusher(records), icon: 'flight_takeoff' },
        { name: 'Family Feast', desc: 'A bill for ≥4 people at ≤15€/person', unlocked: checkFamilyFeast(records), icon: 'groups' },
        { name: '€500 Month', desc: 'Spend ≥€500 in a single month', unlocked: check500Month(records), icon: 'euro_symbol' },
        { name: 'Photo Historian', desc: '≥60% of bills have photos in a month', unlocked: checkPhotoHistorian(records), icon: 'photo_camera' }
    ];

    achievements.forEach(ach => {
        achievementsGrid.innerHTML += createAchievementBadge(ach.name, ach.desc, ach.unlocked, ach.icon);
    });
}

// --- Charting Functions ---

function renderBarChart(canvasId, label, labels, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: 'rgba(22, 163, 74, 0.6)',
                borderColor: 'rgba(22, 163, 74, 1)',
                borderWidth: 1
            }]
        },
        options: {
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                y: { beginAtZero: true, ticks: { color: 'white' }, grid: { color: '#374151' } },
                x: { ticks: { color: 'white' }, grid: { color: '#374151' } }
            }
        }
    });
}

function renderPieChart(canvasId, title, labels, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: title,
                data: data,
                backgroundColor: ['#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#10b981'],
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', labels: { color: 'white' } } }
        }
    });
}

function renderLineChart(canvasId, title, labels, datasets) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets.map((ds, i) => ({
                ...ds,
                borderColor: i === 0 ? 'var(--primary-color)' : 'var(--accent-purple)',
                backgroundColor: i === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                fill: true,
            }))
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                y: { beginAtZero: true, ticks: { color: 'white' }, grid: { color: '#374151' } },
                x: { ticks: { color: 'white' }, grid: { color: '#374151' } }
            }
        }
    });
}


// --- Helper functions for creating UI elements ---

function createInsightCard(title, value, isChart = false, icon = 'info', color = 'var(--primary-color)', colSpan = '', description = '') {
    const isNumeric = !isChart && !isNaN(parseFloat(value));
    const valueHtml = isChart 
        ? value 
        : `<div class="text-3xl font-bold text-white mt-4 font-poppins" ${isNumeric ? `data-countup="${parseFloat(value)}"` : ''}>${isNumeric ? '0' : value}</div>`;

    const tooltipHtml = description
        ? `<div class="tooltip-container" tabindex="0" role="button">
               <span class="material-symbols-outlined">info</span>
               <span class="tooltip-text">${description}</span>
           </div>`
        : '';

    const card = `
        <div class="bg-[var(--card-color)] p-6 rounded-2xl border border-[var(--border-color)] hover:border-[${color}] transition-all duration-300 transform hover:-translate-y-1 ${colSpan} relative">
            ${tooltipHtml}
            <div class="flex items-center gap-4 mb-2">
                <div class="p-2 rounded-full" style="background-color: ${color}33;">
                    <span class="material-symbols-outlined" style="color: ${color};">${icon}</span>
                </div>
                <h3 class="text-lg font-semibold text-white">${title}</h3>
            </div>
            ${valueHtml}
        </div>
    `;
    return card;
}

function createAchievementBadge(name, description, unlocked = false, icon = 'military_tech') {
    const badge = `
        <div class="flex flex-col items-center justify-center p-4 bg-[var(--background-color)] rounded-lg text-center aspect-square group cursor-pointer hover:bg-gray-700 transition-colors ${unlocked ? '' : 'achievement-locked'}">
            <span class="material-symbols-outlined text-4xl ${unlocked ? 'text-yellow-400' : 'text-gray-500'} group-hover:animate-bounce">${icon}</span>
            <p class="text-sm font-semibold ${unlocked ? 'text-white' : 'text-gray-400'} mt-2">${name}</p>
            <p class="text-xs text-gray-500">${description}</p>
        </div>
    `;
    return badge;
}

function initTooltips() {
    document.querySelectorAll('.tooltip-container').forEach(container => {
        container.addEventListener('click', () => {
            container.classList.toggle('active');
        });
    });
}

// --- Animation Helper ---
function animateCountUp() {
    const counters = document.querySelectorAll('[data-countup]');
    const speed = 100; // Adjust for faster/slower animation

    counters.forEach(counter => {
        const target = +counter.getAttribute('data-countup');
        const updateCount = () => {
            const count = +counter.innerText;
            const inc = target / speed;

            if (count < target) {
                counter.innerText = Math.ceil(count + inc);
                setTimeout(updateCount, 10);
            } else {
                counter.innerText = target.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        };
        updateCount();
    });
}
