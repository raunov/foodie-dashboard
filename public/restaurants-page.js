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
        const restaurants = processRestaurantData(records);

        renderRestaurantList(restaurants);
        initializeMap(tokenData.token, restaurants);

        setupEventListeners(restaurants);

    } catch (error) {
        console.error('Failed to initialize page:', error);
    } finally {
        hideLoader();
    }
}

function processRestaurantData(records) {
    const restaurantData = {};

    records.forEach(record => {
        const details = record.fields.ToidudDetails;
        if (!details) return;

        details.forEach(restaurant => {
            const id = restaurant.id;
            if (!restaurantData[id]) {
                restaurantData[id] = {
                    id: id,
                    name: restaurant.fields.Nimetus,
                    cuisine: restaurant.fields.Toit,
                    city: restaurant.fields.Linn,
                    country: restaurant.fields.Riik,
                    visits: 0,
                    totalSpend: 0,
                    avgSpend: 0,
                    lastVisit: new Date(0),
                    coordinates: restaurant.fields.Coordinates,
                    photoUrl: restaurant.fields.Foto?.[0]?.thumbnails?.large?.url
                };
            }
            restaurantData[id].visits++;
            restaurantData[id].totalSpend += record.fields.Kokku || 0;
            const visitDate = new Date(record.fields.Kuupäev);
            if (visitDate > restaurantData[id].lastVisit) {
                restaurantData[id].lastVisit = visitDate;
            }
        });
    });

    Object.values(restaurantData).forEach(r => {
        r.avgSpend = r.totalSpend / r.visits;
    });

    return Object.values(restaurantData);
}


function renderRestaurantList(restaurants) {
    const listElement = document.getElementById('restaurant-list');
    listElement.innerHTML = '';

    restaurants.forEach(r => {
        const item = document.createElement('div');
        item.className = 'bg-gray-800 p-4 rounded-lg flex items-center gap-4';
        item.innerHTML = `
            <img src="${r.photoUrl || 'https://via.placeholder.com/150'}" alt="${r.name}" class="w-20 h-20 rounded-md object-cover">
            <div>
                <h3 class="text-lg font-bold text-white">${r.name}</h3>
                <p class="text-sm text-gray-400">${r.cuisine}</p>
                <div class="flex gap-4 mt-2">
                    <p class="text-sm text-gray-400">Avg. Spend: €${r.avgSpend.toFixed(2)}</p>
                    <p class="text-sm text-gray-400">Visits: ${r.visits}</p>
                </div>
            </div>
        `;
        listElement.appendChild(item);
    });
}

function initializeMap(token, restaurants) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [24.7536, 59.4370],
        zoom: 1
    });

    const bounds = new mapboxgl.LngLatBounds();

    restaurants.forEach(r => {
        if (r.coordinates) {
            const [lat, lng] = r.coordinates.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            const popup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(`<h3>${r.name}</h3><p>${r.cuisine}</p>`);

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

function setupEventListeners(restaurants) {
    const searchInput = document.getElementById('search-input');
    const sortBy = document.getElementById('sort-by');

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = restaurants.filter(r => 
            r.name.toLowerCase().includes(searchTerm) ||
            r.city.toLowerCase().includes(searchTerm) ||
            r.country.toLowerCase().includes(searchTerm)
        );
        renderRestaurantList(filtered);
    });

    sortBy.addEventListener('change', () => {
        const sortValue = sortBy.value;
        let sorted = [...restaurants];
        if (sortValue === 'date') {
            sorted.sort((a, b) => b.lastVisit - a.lastVisit);
        } else if (sortValue === 'visits') {
            sorted.sort((a, b) => b.visits - a.visits);
        } else if (sortValue === 'avg-spend') {
            sorted.sort((a, b) => b.avgSpend - a.avgSpend);
        }
        renderRestaurantList(sorted);
    });
}


function showLoader() {
    const loader = document.getElementById('loader-container');
    if(loader) loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('loader-container');
    if(loader) loader.style.display = 'none';
}
