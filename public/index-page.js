import {
    calculateSeasonality,
    calculateCityMix,
    calculateWeekendEffect,
    checkFirstBite,
    checkGlobeTaster,
    checkWeekendWarrior,
    checkFamilyFeast
} from './utils/calculators.js';
import { showLoader, hideLoader } from './utils/loader.js';

document.addEventListener('DOMContentLoaded', function() {
    // Only run this script on the main page by checking for a unique element
    if (!document.getElementById('foodie-map')) {
        return;
    }

    let mapboxToken = '';

    async function initializeDashboard() {
        showLoader();
        try {
            // First, fetch the Mapbox token
            console.log('🔑 Fetching Mapbox token...');
            const tokenResponse = await fetch('/api/mapbox');
            if (tokenResponse.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!tokenResponse.ok) {
                throw new Error(`Failed to fetch Mapbox token: ${tokenResponse.status}`);
            }
            const tokenData = await tokenResponse.json();
            mapboxToken = tokenData.token;
            console.log('✅ Mapbox token received.');

            // Then, fetch the Airtable data
            console.log('🔍 Fetching data from /api/airtable...');
            const airtableResponse = await fetch('/api/airtable');
            console.log('📡 API Response status:', airtableResponse.status);
            
            if (airtableResponse.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!airtableResponse.ok) {
                throw new Error(`HTTP error! status: ${airtableResponse.status}`);
            }
            const data = await airtableResponse.json();
            console.log('📦 Raw API data:', data);

            if (data && data.records) {
                const bills = data.records.map(r => r.fields);
                console.log('💰 Processed bills data:', bills);
                
                updateDashboard(bills);
            } else {
                console.error("❌ No records found in API response.");
            }
        } catch (error) {
            console.error('❌ Failed to initialize dashboard:', error);
        } finally {
            hideLoader();
        }
    }

    function updateDashboard(bills) {
        updateStats(bills);
        updateInsights(bills);
        updateAchievements(bills);
        updateMap(bills);
    }

    function updateStats(bills) {
        const totalSpent = bills.reduce((sum, bill) => sum + (bill.Kokku || 0), 0);
        const billsTracked = bills.length;
        const averageBill = billsTracked > 0 ? totalSpent / billsTracked : 0;

        document.getElementById('total-spent').textContent = `€${totalSpent.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('average-bill').textContent = `€${averageBill.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('bills-tracked').textContent = billsTracked;
    }

    function updateInsights(bills) {
        const records = bills.map(b => ({ fields: b }));

        // 1. Most Adventurous Month
        const seasonality = calculateSeasonality(records);
        const topMonthData = seasonality.labels.reduce((top, month, i) => {
            const spend = seasonality.datasets[0].data[i];
            if (spend > top.spend) return { month, spend };
            return top;
        }, { month: 'N/A', spend: 0 });
        document.getElementById('most-adventurous-month').textContent = topMonthData.month;

        // 2. Countries Visited
        const countries = new Set(records.map(r => r.fields.Riik).filter(Boolean));
        document.getElementById('new-cuisines-tried').textContent = `${countries.size} Countries`;

        // 3. Weekend vs Weekday
        const weekendEffect = calculateWeekendEffect(records);
        document.getElementById('average-tuesday-meal').textContent = `Weekend: ${weekendEffect.avgWeekend}€`;
        document.querySelector('#average-tuesday-meal').previousElementSibling.textContent = 'Avg. Weekend Bill';

        // 4. Top City
        const cityMix = calculateCityMix(records);
        const topCity = cityMix.top5.length > 0 ? cityMix.top5[0][0] : 'N/A';
        document.getElementById('most-ordered-dish').textContent = topCity;
        document.querySelector('#most-ordered-dish').previousElementSibling.textContent = 'Top City';
    }

    function updateAchievements(bills) {
        const records = bills.map(b => ({ fields: b }));
        const achievements = [
            { name: 'First Bite', unlocked: checkFirstBite(records), icon: 'restaurant' },
            { name: 'Globe Taster', unlocked: checkGlobeTaster(records), icon: 'public' },
            { name: 'Weekend Warrior', unlocked: checkWeekendWarrior(records), icon: 'sports_esports' },
            { name: 'Family Feast', unlocked: checkFamilyFeast(records), icon: 'groups' }
        ];

        const grid = document.getElementById('achievements-grid');
        grid.innerHTML = ''; // Clear existing

        const unlockedAchievements = achievements.filter(a => a.unlocked);

        unlockedAchievements.slice(0, 3).forEach(ach => {
            const div = document.createElement('div');
            div.className = 'flex flex-col items-center justify-center p-4 bg-gray-800 rounded-lg text-center aspect-square group cursor-pointer hover:bg-gray-700 transition-colors';
            div.innerHTML = `
                <span class="material-symbols-outlined text-4xl text-yellow-400 group-hover:animate-bounce">${ach.icon}</span>
                <p class="text-sm font-semibold text-white mt-2">${ach.name}</p>
            `;
            grid.appendChild(div);
        });
        
        const linkToSpending = document.createElement('a');
        linkToSpending.href = 'spending.html';
        linkToSpending.className = 'flex flex-col items-center justify-center p-4 bg-gray-800 rounded-lg text-center aspect-square group cursor-pointer border-2 border-dashed border-gray-600 hover:bg-gray-700 transition-colors';
        linkToSpending.innerHTML = `<span class="material-symbols-outlined text-4xl text-gray-500">arrow_forward</span><p class="text-sm font-semibold text-gray-400 mt-2">See All</p>`;
        grid.appendChild(linkToSpending);
    }

    let map;
    function updateMap(bills) {
        if (!mapboxToken) {
            console.error('❌ Mapbox token not available. Cannot initialize map.');
            return;
        }

        if (!map) {
            mapboxgl.accessToken = mapboxToken;
            map = new mapboxgl.Map({
                container: 'foodie-map',
                style: 'mapbox://styles/mapbox/dark-v11',
                center: [24.7536, 59.4370],
                zoom: 12
            });

            const fullscreenBtn = document.getElementById('fullscreen-btn');
            const mapContainer = document.getElementById('map-container');
            const originalParent = document.getElementById('map-card-content');

            fullscreenBtn.addEventListener('click', () => {
                const isFullscreen = mapContainer.classList.toggle('fullscreen-map');
                document.body.classList.toggle('body-no-scroll', isFullscreen);

                if (isFullscreen) {
                    document.body.appendChild(mapContainer);
                } else {
                    originalParent.appendChild(mapContainer);
                }
                
                const icon = fullscreenBtn.querySelector('.material-symbols-outlined');
                icon.textContent = isFullscreen ? 'fullscreen_exit' : 'fullscreen';

                setTimeout(() => map.resize(), 10); 
            });
        }

        if (map.markers) {
            map.markers.forEach(marker => marker.remove());
        }
        map.markers = [];

        const validBills = bills.filter(bill => bill.coordinates);
        if (validBills.length === 0) return;

        const bounds = new mapboxgl.LngLatBounds();

        validBills.forEach(bill => {
            const [lat, lng] = bill.coordinates.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            const restaurantName = bill.Nimetus || 'Unknown Restaurant';
            const dishName = bill.Toit || 'Dish';
            const emoji = bill.Emoji || '🍽️';
            const amount = bill.Kokku || 0;
            const date = bill.Kuupäev ? new Date(bill.Kuupäev).toLocaleDateString('et-EE') : 'N/A';

            let markerColor = '#10b981'; // Green for €
            if (amount > 75) markerColor = '#ef4444'; // Red for €€€
            else if (amount > 35) markerColor = '#f59e0b'; // Yellow for €€

            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = markerColor;
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';

            const popupElement = document.createElement('div');
            popupElement.innerHTML = `
                <h3>${emoji} ${dishName}</h3>
                <p><strong>${restaurantName}</strong></p>
                <p>€${amount.toFixed(2)} on ${date}</p>
            `;

            const popup = new mapboxgl.Popup({ 
                    offset: 25,
                    className: 'foodie-popup'
                })
                .setDOMContent(popupElement);

            const marker = new mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .setPopup(popup)
                .addTo(map);
            
            map.markers.push(marker);
            bounds.extend([lng, lat]);
        });

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }
    }

    initializeDashboard();
});
