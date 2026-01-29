import { showLoader, hideLoader } from './utils/loader.js';
import { flattenDishes } from './utils/dish-helpers.js';

let currentPage = 1;
const itemsPerPage = 10;
let allActivities = [];
let currentActivities = [];
let restaurantStats = {};
let map;
const markers = {};

// Timer used to debounce user input for smoother searching
let debounceTimer;

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    showLoader();
    try {
        const [tokenResponse, airtableResponse] = await Promise.all([
            fetch('/api/mapbox'),
            fetch('/api/airtable')
        ]);

        if (tokenResponse.status === 401 || airtableResponse.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!tokenResponse.ok) throw new Error(`Failed to fetch Mapbox token: ${tokenResponse.status}`);
        if (!airtableResponse.ok) throw new Error(`HTTP error! status: ${airtableResponse.status}`);

        const tokenData = await tokenResponse.json();
        const airtableData = await airtableResponse.json();

        const records = airtableData.records || [];
        allActivities = processActivityData(records);
        allActivities.sort((a, b) => b.date - a.date);

        // Calculate restaurant stats
        const allDishes = flattenDishes(records);
        restaurantStats = calculateRestaurantStats(allDishes);

        currentActivities = [...allActivities];

        initializeMap(tokenData.token, allActivities);
        renderActivityList();
        setupEventListeners();

    } catch (error) {
        console.error('Failed to initialize page:', error);
    } finally {
        hideLoader();
    }
}

function getTrimmedStringField(source, fieldNames) {
    if (!source) return null;

    for (const fieldName of fieldNames) {
        const targetName = fieldName.toLowerCase();
        for (const [key, value] of Object.entries(source)) {
            if (key.toLowerCase() === targetName && typeof value === 'string') {
                const trimmedValue = value.trim();
                if (trimmedValue) {
                    return trimmedValue;
                }
            }
        }
    }

    return null;
}

function getNumericField(source, fieldNames) {
    if (!source) return null;

    for (const fieldName of fieldNames) {
        const targetName = fieldName.toLowerCase();
        for (const [key, value] of Object.entries(source)) {
            if (key.toLowerCase() === targetName) {
                const numericValue = Number(value);
                if (!Number.isNaN(numericValue)) {
                    return numericValue;
                }
            }
        }
    }

    return null;
}

function formatPriceLevel(priceLevel) {
    if (priceLevel == null) return null;

    const coerceLevel = level => {
        if (!Number.isFinite(level)) return null;
        const rounded = Math.round(level);
        if (rounded === 0) {
            return { display: 'Free', level: 0 };
        }
        if (rounded >= 1 && rounded <= 4) {
            return { display: '€'.repeat(rounded), level: rounded };
        }
        return null;
    };

    if (typeof priceLevel === 'number') {
        const numericResult = coerceLevel(priceLevel);
        if (numericResult) return numericResult;
    }

    const normalizedOriginal = priceLevel.toString().trim();
    if (!normalizedOriginal) return null;

    const numericValue = Number(normalizedOriginal);
    const numericResult = coerceLevel(numericValue);
    if (numericResult) return numericResult;

    const normalizedKey = normalizedOriginal
        .replace(/[-\s]+/g, '_')
        .toUpperCase();

    const enumLevels = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
        FREE: 0,
        INEXPENSIVE: 1,
        MODERATE: 2,
        EXPENSIVE: 3,
        VERY_EXPENSIVE: 4
    };

    const mappedLevel = enumLevels[normalizedKey];
    return mappedLevel == null ? null : coerceLevel(mappedLevel);
}

function processActivityData(records) {
    return records.map(record => {
        const restaurantDetails = record.fields.ToidudDetails?.[0]?.fields;
        const photos = record.fields.Photos || [];
        const attachments = record.fields.Attachments || [];

        const photoUrls = [
            ...photos.map(p => p.thumbnails?.large?.url),
            ...attachments.map(a => a.thumbnails?.large?.url)
        ].filter(Boolean);

        const googleMapsUri =
            getTrimmedStringField(restaurantDetails, ['googleMapsUri', 'googleMapsUrl']) ||
            getTrimmedStringField(record.fields, ['googleMapsUri', 'googleMapsUrl']);

        const displayName =
            getTrimmedStringField(restaurantDetails, ['GooglePlaceName']) ||
            getTrimmedStringField(record.fields, ['GooglePlaceName']) ||
            record.fields.Nimetus ||
            'N/A';

        const ratingRaw =
            getNumericField(restaurantDetails, ['GooglePlacesRating']) ??
            getNumericField(record.fields, ['GooglePlacesRating']);
        const rating = Number.isFinite(ratingRaw) && ratingRaw >= 0 && ratingRaw <= 5 ? ratingRaw : null;

        const priceLevelRaw =
            getTrimmedStringField(restaurantDetails, ['priceLevel']) ||
            getTrimmedStringField(record.fields, ['priceLevel']);

        const priceLevel = formatPriceLevel(priceLevelRaw);

        const visitComments = getTrimmedStringField(record.fields, ['Kommentaar', 'Kommentaarid', 'Notes', 'Märkmed', 'Comment']);

        return {
            id: record.id,
            name: displayName,
            restaurantName: restaurantDetails?.Nimetus,
            googleMapsUri,
            city: record.fields.Linn || 'N/A',
            country: record.fields.Riik || 'N/A',
            spend: record.fields.Kokku || 0,
            peopleCount: Number(record.fields.People) || null,
            date: new Date(record.fields.Kuupäev),
            added: new Date(record.createdTime),
            coordinates: record.fields.coordinates || (record.fields.lat_exif && record.fields.lon_exif ? `${record.fields.lat_exif},${record.fields.lon_exif}` : null),
            photoUrls: photoUrls,
            emoji: record.fields.Emoji || '',
            rating: rating,
            priceLevel,
            visitComments
        };
    });
}

function calculateRestaurantStats(dishes) {
    const stats = {};

    dishes.forEach(dish => {
        const restName = dish.restaurant;
        if (!restName || restName === 'Unknown restaurant') return;

        if (!stats[restName]) {
            stats[restName] = { dishCounts: {} };
        }

        const dishName = dish.dishName;
        stats[restName].dishCounts[dishName] = (stats[restName].dishCounts[dishName] || 0) + 1;
    });

    const result = {};
    for (const [restName, data] of Object.entries(stats)) {
        const sortedDishes = Object.entries(data.dishCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => name); // store just names

        result[restName] = sortedDishes;
    }
    return result;
}


function renderActivityList() {
    const listElement = document.getElementById('restaurant-list');
    listElement.innerHTML = '';

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedActivities = currentActivities.slice(startIndex, endIndex);

    paginatedActivities.forEach(a => {
        const item = document.createElement('div');
        item.className = 'bg-gray-800 p-4 rounded-lg flex flex-col gap-4';

        const galleryHTML = a.photoUrls.length > 0
            ? `<div class="flex overflow-x-auto gap-2 p-1">
                ${a.photoUrls.map(photoUrl => `
                    <img src="${photoUrl}" alt="${a.restaurantName}" class="w-24 h-24 rounded-md object-cover cursor-pointer flex-shrink-0 gallery-image">
                `).join('')}
            </div>`
            : `<div class="w-24 h-24 rounded-md bg-gray-700 flex items-center justify-center text-gray-500">No Image</div>`;

        const spendLabel = a.peopleCount && a.peopleCount > 0
            ? `Cost per person: €${(a.spend / a.peopleCount).toFixed(2)} 👤${a.peopleCount}`
            : `Total spend: €${a.spend.toFixed(2)}`;

        const locationLabel = a.restaurantName || a.name;
        const googleMapsLinkHtml = a.googleMapsUri
            ? `<a href="${a.googleMapsUri}" class="text-emerald-400 hover:text-emerald-300 flex items-center text-lg leading-none" target="_blank" rel="noopener noreferrer" aria-label="Open ${locationLabel} in Google Maps">📍<span class="sr-only">Open in Google Maps</span></a>`
            : '';

        const ratingHtml = Number.isFinite(a.rating)
            ? `<span class="flex items-center gap-1 text-sm text-yellow-300" aria-label="Rating ${a.rating.toFixed(1)} out of 5">⭐ ${a.rating.toFixed(1)}</span>`
            : '';

        const priceLevelHtml = a.priceLevel
            ? `<span class="text-sm text-emerald-300" aria-label="Price level ${a.priceLevel.level} out of 4">${a.priceLevel.display}</span>`
            : '';

        const hasMetaRow = Boolean(ratingHtml || priceLevelHtml);

        item.innerHTML = `
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <h3 class="text-lg font-bold text-white cursor-pointer" data-activity-id="${a.id}">${a.emoji} ${a.name}</h3>
                    ${googleMapsLinkHtml}
                </div>
                ${a.restaurantName ? `
                    <p class="text-sm text-gray-300">${a.restaurantName}</p>
                ` : ''}
                <p class="text-sm text-gray-400">${a.city}, ${a.country}</p>
                ${hasMetaRow ? `
                    <div class="flex flex-wrap items-center gap-3 mt-1">
                        ${ratingHtml}
                        ${priceLevelHtml}
                    </div>
                ` : ''}
                <div class="flex gap-4 mt-2">
                    <p class="text-sm text-gray-400">${spendLabel}</p>
                    <p class="text-sm text-gray-400">Date: ${a.date.toLocaleDateString()}</p>
                </div>
                
                ${(() => {
                const topDishes = restaurantStats[a.restaurantName];
                if (topDishes && topDishes.length > 0) {
                    return `
                        <div class="mt-3 text-sm">
                            <span class="text-yellow-400 font-medium">🏆 Favorites:</span>
                            <span class="text-gray-300 ml-1">${topDishes.join(', ')}</span>
                        </div>`;
                }
                return '';
            })()}

                ${a.visitComments ? `
                    <div class="mt-2 text-sm bg-gray-700/50 p-2 rounded border border-gray-600/50">
                        <span class="text-gray-400 font-medium">📝 Note:</span>
                        <span class="text-gray-300 italic ml-1">"${a.visitComments}"</span>
                    </div>
                ` : ''}

            </div>
            ${galleryHTML}
        `;

        item.addEventListener('click', () => focusMapOnActivity(a.id));

        const titleElement = item.querySelector(`h3[data-activity-id="${a.id}"]`);
        if (titleElement) {
            titleElement.addEventListener('click', (event) => {
                event.stopPropagation();
                focusMapOnActivity(a.id);
            });
        }
        listElement.appendChild(item);
    });

    updatePaginationControls();

    const firstActivityWithCoords = currentActivities.find(a => a.coordinates);
    if (firstActivityWithCoords) {
        focusMapOnActivity(firstActivityWithCoords.id);
    }
}

function updatePaginationControls() {
    const pageInfo = document.getElementById('page-info');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');

    const totalPages = Math.ceil(currentActivities.length / itemsPerPage);

    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
}

function initializeMap(token, activities) {
    mapboxgl.accessToken = token;
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [24.7536, 59.4370],
        zoom: 1
    });

    map.on('load', function () {
        map.resize();
    });

    const bounds = new mapboxgl.LngLatBounds();

    activities.forEach(a => {
        if (a.coordinates) {
            const [lat, lng] = a.coordinates.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            let markerColor = '#10b981'; // Green for €
            if (a.spend > 75) markerColor = '#ef4444'; // Red for €€€
            else if (a.spend > 35) markerColor = '#f59e0b'; // Yellow for €€

            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = markerColor;
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';

            const spendPopupLabel = a.peopleCount && a.peopleCount > 0
                ? `€${(a.spend / a.peopleCount).toFixed(2)} per person 👤${a.peopleCount}`
                : `€${a.spend.toFixed(2)}`;

            const popup = new mapboxgl.Popup({
                offset: 25,
                className: 'foodie-popup'
            })
                .setHTML(`<h3>${a.name}</h3><p>${spendPopupLabel}</p>`);

            markers[a.id] = new mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .setPopup(popup)
                .addTo(map);

            bounds.extend([lng, lat]);
        }
    });

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
    }
}

function focusMapOnActivity(activityId) {
    const marker = markers[activityId];
    if (marker) {
        map.flyTo({
            center: marker.getLngLat(),
            zoom: 15
        });
        marker.togglePopup();
    }
}

function initializeModal() {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const closeButton = document.getElementById('modal-close');

    const openModal = (imageUrl) => {
        modalImage.src = imageUrl;
        modal.classList.remove('hidden');
    };

    const closeModal = () => {
        modal.classList.add('hidden');
        modalImage.src = '';
    };

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Add event delegation for gallery images
    const restaurantList = document.getElementById('restaurant-list');
    restaurantList.addEventListener('click', (e) => {
        if (e.target.classList.contains('gallery-image')) {
            openModal(e.target.src);
        }
    });
}

function setupEventListeners() {
    initializeModal();
    const searchInput = document.getElementById('search-input');
    const clearButton = document.getElementById('clear-search');
    const sortBy = document.getElementById('sort-by');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');

    function filterAndSort() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const sortValue = sortBy.value;

        let filtered = allActivities.filter(a =>
            (a.name || '').toLowerCase().includes(searchTerm) ||
            (a.restaurantName || '').toLowerCase().includes(searchTerm) ||
            (a.city || '').toLowerCase().includes(searchTerm) ||
            (a.country || '').toLowerCase().includes(searchTerm)
        );

        if (sortValue === 'date') {
            filtered.sort((a, b) => b.date - a.date);
        } else if (sortValue === 'added') {
            filtered.sort((a, b) => b.added - a.added);
        } else if (sortValue === 'avg-spend') {
            filtered.sort((a, b) => b.spend - a.spend);
        }

        currentActivities = filtered;
        currentPage = 1;
        renderActivityList();
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(filterAndSort, 300);
    });
    sortBy.addEventListener('change', filterAndSort);

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        currentActivities = [...allActivities];
        currentPage = 1;
        renderActivityList();
    });

    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderActivityList();
        }
    });

    nextButton.addEventListener('click', () => {
        const totalPages = Math.ceil(currentActivities.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderActivityList();
        }
    });
}

