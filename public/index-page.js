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
    let heatmapMode = 'count';

    function aggregateBills(bills) {
        const locations = {};
        bills.forEach(bill => {
            if (!bill.coordinates) return;
            const key = bill.coordinates;
            const amount = bill.Kokku || 0;
            if (!locations[key]) {
                locations[key] = { sum: 0, count: 0, coords: key };
            }
            locations[key].sum += amount;
            locations[key].count += 1;
        });

        const features = Object.values(locations).map(loc => {
            const [lat, lng] = loc.coords.split(',').map(Number);
            const avg = loc.count ? loc.sum / loc.count : 0;
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { avgPrice: avg, count: loc.count }
            };
        });

        return { type: 'FeatureCollection', features };
    }

    function getHeatmapWeight(mode) {
        if (mode === 'avgPrice') {
            return ['interpolate', ['linear'], ['get', 'avgPrice'], 0, 0, 100, 1];
        }
        return ['interpolate', ['linear'], ['get', 'count'], 0, 0, 10, 1];
    }

    function updateMap(bills) {
        if (!mapboxToken) {
            console.error('❌ Mapbox token not available. Cannot initialize map.');
            return;
        }

        const geojson = aggregateBills(bills);

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

            const heatmapSelect = document.getElementById('heatmap-type');
            if (heatmapSelect) {
                heatmapSelect.addEventListener('change', () => {
                    heatmapMode = heatmapSelect.value === 'price' ? 'avgPrice' : 'count';
                    if (map.getLayer('bills-heat')) {
                        map.setPaintProperty('bills-heat', 'heatmap-weight', getHeatmapWeight(heatmapMode));
                    }
                });
            }

            map.on('load', () => {
                map.addSource('bills', { type: 'geojson', data: geojson });
                map.addLayer({
                    id: 'bills-heat',
                    type: 'heatmap',
                    source: 'bills',
                    maxzoom: 15,
                    paint: {
                        'heatmap-weight': getHeatmapWeight(heatmapMode),
                        'heatmap-intensity': 1,
                        'heatmap-color': [
                            'interpolate', ['linear'], ['heatmap-density'],
                            0, 'rgba(0, 0, 255, 0)',
                            0.5, 'rgb(0, 255, 0)',
                            1, 'rgb(255, 0, 0)'
                        ],
                        'heatmap-radius': 20,
                        'heatmap-opacity': 0.8
                    }
                });
                fitBounds();
            });
        } else {
            if (map.isStyleLoaded() && map.getSource('bills')) {
                map.getSource('bills').setData(geojson);
                fitBounds();
            }
        }

        function fitBounds() {
            const bounds = new mapboxgl.LngLatBounds();
            geojson.features.forEach(f => bounds.extend(f.geometry.coordinates));
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
            }
        }
    }

    initializeDashboard();
});
