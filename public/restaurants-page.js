import { showLoader, hideLoader } from './utils/loader.js';

let currentPage = 1;
const itemsPerPage = 10;
let allActivities = [];
let currentActivities = [];
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
        const rawActivities = processActivityData(records);
        allActivities = groupActivitiesByPlaceId(rawActivities);
        allActivities.sort((a, b) => (b.lastVisitDate || 0) - (a.lastVisitDate || 0));
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

function parseRatingText(value) {
    if (typeof value !== 'string') return {};

    const ratingMatch = value.match(/(\d+(?:[.,]\d+)?)/);
    const rating = ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null;

    const countMatch = value.match(/\(([\d\s.,]+)\)/);
    const count = countMatch ? Number(countMatch[1].replace(/[^\d]/g, '')) : null;

    return {
        rating: Number.isFinite(rating) ? rating : null,
        count: Number.isFinite(count) ? count : null
    };
}

function getRatingInfo(restaurantDetails, recordFields) {
    const sources = [restaurantDetails, recordFields].filter(Boolean);
    const ratingFieldNames = ['GooglePlacesRating', 'Hinnang', 'Rating'];
    const ratingCountFieldNames = [
        'GooglePlacesUserRatingsTotal',
        'GooglePlacesRatingCount',
        'GooglePlacesReviewsCount',
        'UserRatingsTotal',
        'UserRatingCount',
        'RatingCount',
        'HinnangCount',
        'Hinnanguid'
    ];

    let rating = null;
    let ratingCount = null;

    for (const source of sources) {
        rating = rating ?? getNumericField(source, ratingFieldNames);
        ratingCount = ratingCount ?? getNumericField(source, ratingCountFieldNames);

        for (const fieldName of ratingFieldNames) {
            const rawValue = source[fieldName];
            const parsed = parseRatingText(rawValue);
            rating = rating ?? parsed.rating;
            ratingCount = ratingCount ?? parsed.count;
        }
    }

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        rating = null;
    }

    if (!Number.isFinite(ratingCount) || ratingCount < 0) {
        ratingCount = null;
    }

    return { rating, ratingCount };
}

function formatPriceLevel(priceLevel) {
    if (typeof priceLevel !== 'string') return null;

    const normalizedKey = priceLevel
        .trim()
        .replace(/[-\s]+/g, '_')
        .toUpperCase();

    if (!normalizedKey) return null;

    const enumLevels = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4
    };

    const level = enumLevels[normalizedKey];
    if (level == null) return null;

    if (level === 0) {
        return { display: 'Free', level };
    }

    return { display: '€'.repeat(level), level };
}

function isLikelyAirtableRecordId(value) {
    return typeof value === 'string' && /^rec[a-zA-Z0-9]{14}$/.test(value.trim());
}

function extractDishNames(fields = {}) {
    const detailDishNames = Array.isArray(fields.ToidudDetails)
        ? fields.ToidudDetails
            .map(detail => {
                const detailFields = detail?.fields || {};
                return detailFields.Toode || detailFields.Nimetus || detailFields.Dish || detailFields.Name || '';
            })
            .map(name => (typeof name === 'string' ? name.trim() : ''))
            .filter(Boolean)
        : [];

    const linkedDishNames = Array.isArray(fields.Toidud)
        ? fields.Toidud
            .map(dish => (typeof dish === 'string' ? dish.trim() : ''))
            .filter(dish => dish && !isLikelyAirtableRecordId(dish))
        : [];

    return Array.from(new Set([...detailDishNames, ...linkedDishNames]));
}

function processActivityData(records) {
    return records.map(record => {
        const restaurantDetails = record.fields.ToidudDetails?.[0]?.fields;
        const dishes = extractDishNames(record.fields);
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

        const googlePlacesId =
            getTrimmedStringField(restaurantDetails, ['GooglePlacesId']) ||
            getTrimmedStringField(record.fields, ['GooglePlacesId']);

        const { rating, ratingCount } = getRatingInfo(restaurantDetails, record.fields);

        const priceLevelRaw =
            getTrimmedStringField(restaurantDetails, ['priceLevel']) ||
            getTrimmedStringField(record.fields, ['priceLevel']);

        const priceLevel = formatPriceLevel(priceLevelRaw);

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
            ratingCount,
            priceLevel,
            googlePlacesId,
            dishes
        };
    });
}

function renderRatingStars(rating) {
    if (!Number.isFinite(rating)) return '';

    const roundedRating = Math.round(rating * 2) / 2;
    const fullStars = Math.floor(roundedRating);
    const hasHalfStar = roundedRating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    const fullStarHtml = '★'.repeat(fullStars);
    const halfStarHtml = hasHalfStar ? '⯨' : '';
    const emptyStarHtml = '☆'.repeat(emptyStars);

    return `${fullStarHtml}${halfStarHtml}${emptyStarHtml}`;
}

function groupActivitiesByPlaceId(activities) {
    const groups = new Map();

    activities.forEach(activity => {
        const fallbackKey = `${(activity.name || 'unknown').toLowerCase()}::${(activity.city || 'unknown').toLowerCase()}`;
        const groupKey = activity.googlePlacesId || fallbackKey;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                id: groupKey,
                activities: []
            });
        }
        groups.get(groupKey).activities.push(activity);
    });

    return Array.from(groups.values()).map(group => {
        const sortedActivities = [...group.activities].sort((a, b) => b.date - a.date);
        const lastVisit = sortedActivities[0];
        const lastAdded = [...group.activities].sort((a, b) => b.added - a.added)[0];

        const ratings = group.activities
            .map(activity => activity.rating)
            .filter(rating => Number.isFinite(rating));
        const averageRating = ratings.length
            ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
            : null;
        const ratingActivity = sortedActivities.find(activity => Number.isFinite(activity.ratingCount));
        const ratingCount = ratingActivity?.ratingCount ?? null;

        const averageSpend = group.activities.length
            ? group.activities.reduce((sum, activity) => sum + (activity.spend || 0), 0) / group.activities.length
            : 0;

        const costPerPersonValues = group.activities
            .filter(activity => activity.peopleCount && activity.peopleCount > 0)
            .map(activity => activity.spend / activity.peopleCount);
        const averageCostPerPerson = costPerPersonValues.length
            ? costPerPersonValues.reduce((sum, value) => sum + value, 0) / costPerPersonValues.length
            : null;

        const representative = group.activities.find(activity => activity.photoUrls.length > 0 || activity.coordinates || activity.googleMapsUri) || lastVisit;

        return {
            id: group.id,
            name: lastVisit?.name || 'N/A',
            restaurantName: lastVisit?.restaurantName || null,
            googleMapsUri: representative?.googleMapsUri || null,
            city: lastVisit?.city || 'N/A',
            country: lastVisit?.country || 'N/A',
            coordinates: representative?.coordinates || null,
            photoUrls: representative?.photoUrls || [],
            emoji: lastVisit?.emoji || '',
            priceLevel: lastVisit?.priceLevel || null,
            visitCount: group.activities.length,
            averageRating,
            ratingCount,
            averageSpend,
            averageCostPerPerson,
            lastVisitDate: lastVisit?.date || null,
            lastAddedDate: lastAdded?.added || null,
            recentVisits: sortedActivities.slice(0, 3),
            activities: group.activities
        };
    });
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

        const summaryParts = [
            `${a.visitCount} visit${a.visitCount === 1 ? '' : 's'}`,
            Number.isFinite(a.averageRating) ? `Avg rating ${a.averageRating.toFixed(1)}` : null,
            Number.isFinite(a.averageCostPerPerson) ? `Avg cost €${a.averageCostPerPerson.toFixed(2)}/person` : null
        ].filter(Boolean);

        const summaryLabel = summaryParts.join(' · ');

        const locationLabel = a.restaurantName || a.name;
        const googleMapsLinkHtml = a.googleMapsUri
            ? `<a href="${a.googleMapsUri}" class="text-emerald-400 hover:text-emerald-300 flex items-center text-lg leading-none" target="_blank" rel="noopener noreferrer" aria-label="Open ${locationLabel} in Google Maps">📍<span class="sr-only">Open in Google Maps</span></a>`
            : '';

        const ratingCountLabel = Number.isFinite(a.ratingCount)
            ? `(${Number(a.ratingCount).toLocaleString()})`
            : '';
        const ratingStars = renderRatingStars(a.averageRating);
        const ratingHtml = Number.isFinite(a.averageRating)
            ? `<span class="flex items-center gap-1 text-sm text-yellow-300" aria-label="Average rating ${a.averageRating.toFixed(1)} out of 5">${a.averageRating.toFixed(1)} ${ratingStars} ${ratingCountLabel}</span>`
            : '';

        const priceLevelHtml = a.priceLevel
            ? `<span class="text-sm text-emerald-300" aria-label="Price level ${a.priceLevel.level} out of 4">${a.priceLevel.display}</span>`
            : '';

        const hasMetaRow = Boolean(ratingHtml || priceLevelHtml);

        const recentVisitsHtml = a.recentVisits.length
            ? `
                <div class="mt-2 text-sm text-gray-400">
                    <p class="font-semibold text-gray-300">Recent visits</p>
                    <ul class="list-disc list-inside space-y-1">
                        ${a.recentVisits.map(visit => {
                            const visitSpendLabel = visit.peopleCount && visit.peopleCount > 0
                                ? `€${(visit.spend / visit.peopleCount).toFixed(2)} 👤${visit.peopleCount}`
                                : `€${visit.spend.toFixed(2)}`;
                            const visitDishes = Array.isArray(visit.dishes) ? visit.dishes : [];
                            const maxDishesToShow = 3;
                            const visibleDishes = visitDishes.slice(0, maxDishesToShow);
                            const hiddenCount = Math.max(visitDishes.length - maxDishesToShow, 0);
                            const dishesLabel = visitDishes.length
                                ? `${visibleDishes.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount} more` : ''}`
                                : 'No dishes logged';

                            return `
                                <li>
                                    <div>${visit.date.toLocaleDateString()} · ${visitSpendLabel}</div>
                                    <div class="text-xs text-gray-500 ml-5">${dishesLabel}</div>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
            `
            : '';

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
                    <p class="text-sm text-gray-400">${summaryLabel}</p>
                </div>
                ${recentVisitsHtml}
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

    map.on('load', function() {
        map.resize();
    });

    const bounds = new mapboxgl.LngLatBounds();

    activities.forEach(a => {
        if (a.coordinates) {
            const [lat, lng] = a.coordinates.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            let markerColor = '#10b981'; // Green for €
            if (a.averageSpend > 75) markerColor = '#ef4444'; // Red for €€€
            else if (a.averageSpend > 35) markerColor = '#f59e0b'; // Yellow for €€

            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = markerColor;
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';

            const popupRatingLabel = Number.isFinite(a.averageRating)
                ? `Avg rating ${a.averageRating.toFixed(1)}${Number.isFinite(a.ratingCount) ? ` (${Number(a.ratingCount).toLocaleString()})` : ''}`
                : null;

            const popupParts = [
                `${a.visitCount} visit${a.visitCount === 1 ? '' : 's'}`,
                popupRatingLabel,
                Number.isFinite(a.averageCostPerPerson) ? `Avg cost €${a.averageCostPerPerson.toFixed(2)}/person` : null
            ].filter(Boolean);

            const popup = new mapboxgl.Popup({
                    offset: 25,
                    className: 'foodie-popup'
                })
                .setHTML(`<h3>${a.name}</h3><p>${popupParts.join(' · ')}</p>`);

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
            filtered.sort((a, b) => (b.lastVisitDate || 0) - (a.lastVisitDate || 0));
        } else if (sortValue === 'added') {
            filtered.sort((a, b) => (b.lastAddedDate || 0) - (a.lastAddedDate || 0));
        } else if (sortValue === 'avg-spend') {
            filtered.sort((a, b) => b.averageSpend - a.averageSpend);
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
