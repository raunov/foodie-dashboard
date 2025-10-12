import {
    calculateSeasonality,
    calculateCityMix,
    calculateWeekendEffect,
    calculateLocalVsTravelShare,
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
        updateFavorites(bills);
        updateMap(bills);
    }

    function updateStats(bills) {
        const totalSpent = bills.reduce((sum, bill) => sum + (bill.Kokku || 0), 0);
        const billsTracked = bills.length;
        const averageBill = billsTracked > 0 ? totalSpent / billsTracked : 0;

        document.getElementById('total-spent').textContent = `€${totalSpent.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('average-bill').textContent = `€${averageBill.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('bills-tracked').textContent = billsTracked;

        const uniquePlaceIds = new Set();
        let missingPlaceIdCount = 0;

        bills.forEach(bill => {
            const detailPlaceId = Array.isArray(bill?.ToidudDetails)
                ? bill.ToidudDetails
                    .map(detail => detail?.fields?.GooglePlacesId)
                    .find(id => typeof id === 'string' && id.trim())
                : undefined;

            const normalizedDetailPlaceId = typeof detailPlaceId === 'string' ? detailPlaceId.trim() : undefined;
            const billLevelPlaceId = typeof bill?.GooglePlacesId === 'string' ? bill.GooglePlacesId.trim() : undefined;

            const placeId = normalizedDetailPlaceId || billLevelPlaceId;

            if (placeId) {
                uniquePlaceIds.add(placeId.trim());
            } else {
                missingPlaceIdCount += 1;
            }
        });

        const uniqueRestaurantCount = uniquePlaceIds.size + missingPlaceIdCount;
        const uniqueRestaurantNode = document.getElementById('unique-restaurants');
        const uniqueRestaurantMessageNode = document.getElementById('unique-restaurants-message');

        if (uniqueRestaurantNode) {
            uniqueRestaurantNode.textContent = uniqueRestaurantCount.toLocaleString('et-EE');
        }

        if (uniqueRestaurantMessageNode) {
            uniqueRestaurantMessageNode.textContent = uniqueRestaurantCount > 0
                ? (uniqueRestaurantCount === 1 ? 'One tasty stop so far.' : 'Keep discovering new favorites!')
                : 'Add a bill to discover new favorites!';
        }
    }

    function updateFavorites(bills) {
        const stats = calculateFavoriteStats(bills);

        const favouriteTypeNode = document.getElementById('favourite-restaurant-type');
        if (favouriteTypeNode) {
            if (stats.topType) {
                const visitLabel = stats.topType.count === 1 ? 'visit' : 'visits';
                favouriteTypeNode.textContent = `${stats.topType.label} (${stats.topType.count} ${visitLabel})`;
            } else {
                favouriteTypeNode.textContent = 'Not enough data yet';
            }
        }

        const priceBreakdownList = document.getElementById('price-level-breakdown');
        if (priceBreakdownList) {
            priceBreakdownList.innerHTML = '';

            if (stats.priceBreakdown.length === 0) {
                const emptyState = document.createElement('li');
                emptyState.className = 'text-[var(--text-secondary)]';
                emptyState.textContent = 'No price information yet.';
                priceBreakdownList.appendChild(emptyState);
            } else {
                stats.priceBreakdown.forEach(entry => {
                    const label = entry.label && entry.label !== entry.display
                        ? `${entry.display} · ${entry.label}`
                        : entry.display;
                    const li = document.createElement('li');
                    li.className = 'flex items-center justify-between gap-4';
                    li.innerHTML = `
                        <span>${label}</span>
                        <span class="text-xs text-[var(--text-secondary)]">${entry.count} (${entry.percentage.toFixed(0)}%)</span>
                    `;
                    priceBreakdownList.appendChild(li);
                });
            }
        }

        const topRestaurantsList = document.getElementById('top-restaurants-list');
        if (topRestaurantsList) {
            topRestaurantsList.innerHTML = '';

            if (stats.topRestaurants.length === 0) {
                const emptyState = document.createElement('li');
                emptyState.className = 'text-[var(--text-secondary)]';
                emptyState.textContent = 'Add more visits to see your favourites.';
                topRestaurantsList.appendChild(emptyState);
            } else {
                stats.topRestaurants.forEach(restaurant => {
                    const visitsLabel = restaurant.count === 1 ? 'visit' : 'visits';
                    const metaParts = [];
                    if (restaurant.primaryType) metaParts.push(restaurant.primaryType.label);
                    if (restaurant.priceLevel) metaParts.push(restaurant.priceLevel.display);

                    const statusClassMap = {
                        CLOSED_PERMANENTLY: 'bg-rose-500/20 text-rose-300',
                        CLOSED_TEMPORARILY: 'bg-amber-500/20 text-amber-300',
                        OPERATIONAL: 'bg-emerald-500/20 text-emerald-300'
                    };

                    const statusHtml = restaurant.businessStatus
                        ? `<span class="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${statusClassMap[restaurant.businessStatus.raw] || 'bg-gray-800 text-[var(--text-secondary)]'}">${restaurant.businessStatus.label}</span>`
                        : '';

                    const li = document.createElement('li');
                    li.className = 'bg-[var(--background-color)]/60 rounded-lg px-3 py-2 border border-transparent hover:border-[var(--border-color)] transition-colors';
                    li.innerHTML = `
                        <div class="flex items-center justify-between text-white font-semibold">
                            <span>${restaurant.name}</span>
                            <span class="text-sm text-[var(--accent-yellow)]">${restaurant.count} ${visitsLabel}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] mt-1">
                            ${metaParts.length ? `<span>${metaParts.join(' • ')}</span>` : ''}
                            ${statusHtml}
                        </div>
                    `;
                    topRestaurantsList.appendChild(li);
                });
            }
        }
    }

    function calculateFavoriteStats(bills) {
        const typeCounts = new Map();
        const priceLevelCounts = new Map();
        const placeStats = new Map();

        bills.forEach(bill => {
            const place = extractPlaceDetails(bill);
            if (!place) return;

            if (place.primaryType) {
                const key = place.primaryType.raw.toUpperCase();
                const existing = typeCounts.get(key) || { count: 0, label: place.primaryType.label };
                existing.count += 1;
                if (!existing.label && place.primaryType.label) {
                    existing.label = place.primaryType.label;
                }
                typeCounts.set(key, existing);
            }

            if (place.priceLevel) {
                const key = place.priceLevel.level != null ? String(place.priceLevel.level) : place.priceLevel.display;
                const existing = priceLevelCounts.get(key) || {
                    count: 0,
                    level: place.priceLevel.level,
                    display: place.priceLevel.display,
                    label: place.priceLevel.label
                };
                existing.count += 1;
                if (!existing.display && place.priceLevel.display) {
                    existing.display = place.priceLevel.display;
                }
                if (!existing.label && place.priceLevel.label) {
                    existing.label = place.priceLevel.label;
                }
                priceLevelCounts.set(key, existing);
            }

            if (place.googlePlacesId) {
                const existing = placeStats.get(place.googlePlacesId) || {
                    id: place.googlePlacesId,
                    name: place.name,
                    count: 0,
                    totalSpend: 0,
                    priceLevel: place.priceLevel || null,
                    primaryType: place.primaryType || null,
                    businessStatus: place.businessStatus || null,
                    businessStatusPriority: place.businessStatus ? businessStatusPriority(place.businessStatus.raw) : Infinity
                };

                existing.count += 1;
                existing.totalSpend += Number(bill.Kokku) || 0;

                if (!existing.name && place.name) existing.name = place.name;
                if (!existing.priceLevel && place.priceLevel) existing.priceLevel = place.priceLevel;
                if (!existing.primaryType && place.primaryType) existing.primaryType = place.primaryType;

                const newStatusPriority = place.businessStatus ? businessStatusPriority(place.businessStatus.raw) : Infinity;
                if (newStatusPriority < existing.businessStatusPriority) {
                    existing.businessStatus = place.businessStatus;
                    existing.businessStatusPriority = newStatusPriority;
                } else if (!existing.businessStatus && place.businessStatus) {
                    existing.businessStatus = place.businessStatus;
                    existing.businessStatusPriority = newStatusPriority;
                }

                placeStats.set(place.googlePlacesId, existing);
            }
        });

        const typeEntries = Array.from(typeCounts.values());
        typeEntries.sort((a, b) => b.count - a.count);
        const topType = typeEntries[0] || null;

        const priceEntries = Array.from(priceLevelCounts.values());
        priceEntries.sort((a, b) => {
            const levelA = a.level != null ? a.level : Infinity;
            const levelB = b.level != null ? b.level : Infinity;
            if (levelA !== levelB) return levelA - levelB;
            return b.count - a.count;
        });
        const totalPriceObservations = priceEntries.reduce((sum, entry) => sum + entry.count, 0);
        const priceBreakdown = priceEntries.map(entry => ({
            ...entry,
            percentage: totalPriceObservations > 0 ? (entry.count / totalPriceObservations) * 100 : 0
        }));

        const topRestaurants = Array.from(placeStats.values())
            .map(({ businessStatusPriority: _priority, ...rest }) => rest)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return b.totalSpend - a.totalSpend;
            })
            .slice(0, 3);

        return { topType, priceBreakdown, topRestaurants };
    }

    function businessStatusPriority(rawStatus) {
        const priorities = {
            CLOSED_PERMANENTLY: 0,
            CLOSED_TEMPORARILY: 1,
            OPERATIONAL: 2
        };
        return rawStatus && rawStatus in priorities ? priorities[rawStatus] : Infinity;
    }

    function extractPlaceDetails(bill) {
        if (!bill) return null;

        const detailFields = Array.isArray(bill.ToidudDetails)
            ? bill.ToidudDetails
                .map(detail => detail?.fields || null)
                .find(fields => {
                    const placeId = getTrimmedStringField(fields, ['GooglePlacesId']);
                    return typeof placeId === 'string' && placeId;
                }) || null
            : null;

        const sources = [detailFields, bill].filter(Boolean);

        const googlePlacesId = sources
            .map(src => getTrimmedStringField(src, ['GooglePlacesId']))
            .find(Boolean);

        if (!googlePlacesId) {
            return null;
        }

        const name = sources
            .map(src => getTrimmedStringField(src, ['GooglePlaceName', 'Nimetus', 'Name']))
            .find(Boolean) || 'Unknown spot';

        const primaryTypeRaw = sources
            .map(src => getTrimmedStringField(src, ['primaryType', 'PrimaryType']))
            .find(value => value != null);
        const primaryType = formatPrimaryType(primaryTypeRaw);

        const priceLevelRaw = sources
            .map(src => getFieldCaseInsensitive(src, ['priceLevel']))
            .find(value => value !== undefined && value !== null && value !== '');
        const priceLevel = normalizePriceLevel(priceLevelRaw);

        const businessStatusRaw = sources
            .map(src => getTrimmedStringField(src, ['businessStatus', 'businesStatus']))
            .find(value => value != null);
        const businessStatus = formatBusinessStatus(businessStatusRaw);

        return {
            googlePlacesId,
            name,
            primaryType,
            priceLevel,
            businessStatus
        };
    }

    function getFieldCaseInsensitive(source, fieldNames) {
        if (!source) return undefined;
        const lookup = fieldNames.map(name => name.toLowerCase());
        for (const [key, value] of Object.entries(source)) {
            if (lookup.includes(key.toLowerCase())) {
                return value;
            }
        }
        return undefined;
    }

    function getTrimmedStringField(source, fieldNames) {
        const value = getFieldCaseInsensitive(source, fieldNames);
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed || null;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
        return null;
    }

    function formatPrimaryType(type) {
        if (!type) return null;
        const raw = type.toString().trim();
        if (!raw) return null;
        const label = raw
            .replace(/[_-]+/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
        return { raw, label };
    }

    function formatBusinessStatus(status) {
        if (!status) return null;
        const raw = status.toString().trim();
        if (!raw) return null;
        const normalized = raw.toUpperCase().replace(/\s+/g, '_');
        const label = normalized
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
        return { raw: normalized, label };
    }

    function normalizePriceLevel(priceLevel) {
        if (priceLevel == null) return null;

        const coerceLevel = (level) => {
            if (!Number.isFinite(level)) return null;
            const rounded = Math.round(level);
            if (rounded <= 0) {
                return { level: 0, display: 'Free', label: 'Free' };
            }
            if (rounded >= 1 && rounded <= 4) {
                const labels = {
                    1: 'Inexpensive',
                    2: 'Moderate',
                    3: 'Expensive',
                    4: 'Splurge'
                };
                return { level: rounded, display: '€'.repeat(rounded), label: labels[rounded] || '€'.repeat(rounded) };
            }
            return null;
        };

        if (typeof priceLevel === 'number') {
            const numeric = coerceLevel(priceLevel);
            if (numeric) return numeric;
        }

        const normalizedOriginal = priceLevel.toString().trim();
        if (!normalizedOriginal) return null;

        const numericValue = Number(normalizedOriginal);
        if (!Number.isNaN(numericValue)) {
            const numeric = coerceLevel(numericValue);
            if (numeric) return numeric;
        }

        if (/^[€$]+$/.test(normalizedOriginal)) {
            const level = normalizedOriginal.length;
            const coerced = coerceLevel(level);
            if (coerced) return coerced;
        }

        const normalizedKey = normalizedOriginal.replace(/[-\s]+/g, '_').toUpperCase();
        const enumMap = {
            PRICE_LEVEL_FREE: 0,
            PRICE_LEVEL_INEXPENSIVE: 1,
            PRICE_LEVEL_MODERATE: 2,
            PRICE_LEVEL_EXPENSIVE: 3,
            PRICE_LEVEL_VERY_EXPENSIVE: 4
        };

        if (normalizedKey in enumMap) {
            const coerced = coerceLevel(enumMap[normalizedKey]);
            if (coerced) return coerced;
        }

        return null;
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
        const formatEuroValue = (value) => Number.isFinite(value)
            ? `€${value.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '—';
        const weekendCard = document.getElementById('average-tuesday-meal');
        if (weekendCard) {
            const labelNode = weekendCard.previousElementSibling;
            if (labelNode) {
                labelNode.textContent = 'Weekend vs Weekday Spend';
            }

            const weekendValueNode = weekendCard.querySelector('[data-role="weekend-value"]');
            if (weekendValueNode) {
                weekendValueNode.textContent = `Weekend: ${formatEuroValue(weekendEffect.avgWeekend)}`;
            }

            const weekdayValueNode = weekendCard.querySelector('[data-role="weekday-value"]');
            if (weekdayValueNode) {
                weekdayValueNode.textContent = `Weekday: ${formatEuroValue(weekendEffect.avgWeekday)}`;
            }

            const deltaBadge = weekendCard.querySelector('[data-role="delta-badge"]');
            if (deltaBadge) {
                const colorClasses = [
                    'bg-emerald-500/20',
                    'text-emerald-300',
                    'bg-rose-500/20',
                    'text-rose-300',
                    'bg-[var(--accent-blue)]/20',
                    'text-[var(--accent-blue)]'
                ];
                deltaBadge.classList.remove(...colorClasses);

                if (Number.isFinite(weekendEffect.deltaPercent)) {
                    const deltaValue = weekendEffect.deltaPercent;
                    const sign = deltaValue > 0 ? '+' : deltaValue < 0 ? '' : '';
                    deltaBadge.textContent = `Δ ${sign}${deltaValue.toFixed(1)}%`;

                    if (deltaValue > 0) {
                        deltaBadge.classList.add('bg-emerald-500/20', 'text-emerald-300');
                    } else if (deltaValue < 0) {
                        deltaBadge.classList.add('bg-rose-500/20', 'text-rose-300');
                    } else {
                        deltaBadge.classList.add('bg-[var(--accent-blue)]/20', 'text-[var(--accent-blue)]');
                    }

                    deltaBadge.classList.remove('hidden');
                } else {
                    deltaBadge.textContent = 'Δ —';
                    deltaBadge.classList.add('hidden');
                }
            }
        }

        // 4. Local vs Travel Spend
        const localRecords = records.filter(r => r.fields['Spend Type'] === 'Local');
        const travelRecords = records.filter(r => r.fields['Spend Type'] === 'Travel');
        const localTravelSummary = calculateLocalVsTravelShare(localRecords, travelRecords);
        const localTravelNode = document.getElementById('local-travel-summary');
        if (localTravelNode) {
            const [localValueRaw, travelValueRaw] = localTravelSummary.valueData || [];
            const toEuro = (value) => {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue)) {
                    return '€0.00';
                }
                return `€${numericValue.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };

            localTravelNode.textContent = `${toEuro(localValueRaw)} Local / ${toEuro(travelValueRaw)} Travel`;
        }

        // 5. Top City
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
