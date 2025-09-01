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
        const activities = processActivityData(records);

        renderActivityList(activities);
        initializeMap(tokenData.token, activities);

        setupEventListeners(activities);

    } catch (error) {
        console.error('Failed to initialize page:', error);
    } finally {
        hideLoader();
    }
}

function processActivityData(records) {
    return records.map(record => {
        const restaurantDetails = record.fields.ToidudDetails?.[0]?.fields;
        return {
            id: record.id,
            name: record.fields.Toit,
            restaurantName: restaurantDetails?.Nimetus || 'N/A',
            city: restaurantDetails?.Linn || 'N/A',
            country: restaurantDetails?.Riik || 'N/A',
            spend: record.fields.Kokku || 0,
            date: new Date(record.fields.Kuupäev),
            coordinates: restaurantDetails?.Coordinates,
            photoUrl: restaurantDetails?.Foto?.[0]?.thumbnails?.large?.url,
            emoji: record.fields.Emoji
        };
    });
}


function renderActivityList(activities) {
    const listElement = document.getElementById('restaurant-list');
    listElement.innerHTML = '';

    activities.forEach(a => {
        const item = document.createElement('div');
        item.className = 'bg-gray-800 p-4 rounded-lg flex items-center gap-4';
        item.innerHTML = `
            <img src="${a.photoUrl || 'https://via.placeholder.com/150'}" alt="${a.restaurantName}" class="w-20 h-20 rounded-md object-cover">
            <div>
                <h3 class="text-lg font-bold text-white">${a.emoji} ${a.name}</h3>
                <p class="text-sm text-gray-400">${a.restaurantName}</p>
                <div class="flex gap-4 mt-2">
                    <p class="text-sm text-gray-400">Spend: €${a.spend.toFixed(2)}</p>
                    <p class="text-sm text-gray-400">Date: ${a.date.toLocaleDateString()}</p>
                </div>
            </div>
        `;
        listElement.appendChild(item);
    });
}

function initializeMap(token, activities) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [24.7536, 59.4370],
        zoom: 1
    });

    const bounds = new mapboxgl.LngLatBounds();

    activities.forEach(a => {
        if (a.coordinates) {
            const [lat, lng] = a.coordinates.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            const popup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(`<h3>${a.name}</h3><p>${a.restaurantName}</p><p>€${a.spend.toFixed(2)}</p>`);

            new mapboxgl.Marker()
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

function setupEventListeners(activities) {
    const searchInput = document.getElementById('search-input');
    const sortBy = document.getElementById('sort-by');

    function filterAndSort() {
        const searchTerm = searchInput.value.toLowerCase();
        const sortValue = sortBy.value;

        let filtered = activities.filter(a => 
            a.name.toLowerCase().includes(searchTerm) ||
            a.restaurantName.toLowerCase().includes(searchTerm) ||
            a.city.toLowerCase().includes(searchTerm) ||
            a.country.toLowerCase().includes(searchTerm)
        );

        if (sortValue === 'date') {
            filtered.sort((a, b) => b.date - a.date);
        } else if (sortValue === 'avg-spend') {
            filtered.sort((a, b) => b.spend - a.spend);
        }

        renderActivityList(filtered);
    }

    searchInput.addEventListener('input', filterAndSort);
    sortBy.addEventListener('change', filterAndSort);
}


function showLoader() {
    const loader = document.getElementById('loader-container');
    if(loader) loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('loader-container');
    if(loader) loader.style.display = 'none';
}
