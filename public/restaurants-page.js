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
        allActivities = processActivityData(records);
        allActivities.sort((a, b) => b.date - a.date);
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

function processActivityData(records) {
    return records.map(record => {
        const restaurantDetails = record.fields.ToidudDetails?.[0]?.fields;
        const photos = record.fields.Photos || record.fields.Attachments || [];
        const photoUrls = photos.map(p => p.thumbnails?.large?.url).filter(Boolean);

        return {
            id: record.id,
            name: record.fields.Nimetus || 'N/A',
            restaurantName: restaurantDetails?.Nimetus,
            city: record.fields.Linn || 'N/A',
            country: record.fields.Riik || 'N/A',
            spend: record.fields.Kokku || 0,
            date: new Date(record.fields.Kuupäev),
            added: new Date(record.createdTime),
            coordinates: record.fields.coordinates || (record.fields.lat_exif && record.fields.lon_exif ? `${record.fields.lat_exif},${record.fields.lon_exif}` : null),
            photoUrls: photoUrls,
            emoji: record.fields.Emoji || ''
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
        item.className = 'bg-gray-800 p-4 rounded-lg flex items-center gap-4 hover:bg-gray-700';

        const photoContainer = document.createElement('div');
        photoContainer.className = 'relative w-20 h-20';

        const image = document.createElement('img');
        image.src = a.photoUrls[0] || 'https://via.placeholder.com/150';
        image.alt = a.restaurantName;
        image.className = 'w-full h-full rounded-md object-cover';
        photoContainer.appendChild(image);

        if (a.photoUrls.length > 1) {
            const photoCounter = document.createElement('div');
            photoCounter.className = 'absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1.5 py-0.5 rounded';
            photoCounter.textContent = `+${a.photoUrls.length - 1}`;
            photoContainer.appendChild(photoCounter);
        }

        photoContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            openPhotoGallery(a.photoUrls, 0);
        });

        const textInfo = document.createElement('div');
        textInfo.innerHTML = `
            <h3 class="text-lg font-bold text-white">${a.emoji} ${a.name}</h3>
            <p class="text-sm text-gray-400">${a.city}, ${a.country}</p>
            <div class="flex gap-4 mt-2">
                <p class="text-sm text-gray-400">Spend: €${a.spend.toFixed(2)}</p>
                <p class="text-sm text-gray-400">Date: ${a.date.toLocaleDateString()}</p>
            </div>
        `;

        item.appendChild(photoContainer);
        item.appendChild(textInfo);
        item.addEventListener('click', () => focusMapOnActivity(a.id));
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
            if (a.spend > 75) markerColor = '#ef4444'; // Red for €€€
            else if (a.spend > 35) markerColor = '#f59e0b'; // Yellow for €€

            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = markerColor;
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';

            const popup = new mapboxgl.Popup({ 
                    offset: 25,
                    className: 'foodie-popup'
                })
                .setHTML(`<h3>${a.name}</h3><p>€${a.spend.toFixed(2)}</p>`);

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

function setupEventListeners() {
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

