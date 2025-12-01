import { showLoader, hideLoader } from './utils/loader.js';
import { flattenDishes, groupDishesByEmoji } from './utils/dish-helpers.js';

// --- State Management ---
const dishesState = {
    items: [],
    cursor: null,
    isLoading: false,
    hasMore: true,
    filterEmoji: null,
    totalStats: {
        count: 0,
        uniqueSpots: new Set(),
        totalSpend: 0
    }
};

// --- DOM Elements ---
const elements = {
    feed: document.getElementById('dish-feed'),
    loader: document.getElementById('feed-loader'),
    endMessage: document.getElementById('feed-end'),
    moodContainer: document.getElementById('mood-bubbles-container'),
    heroTotal: document.getElementById('hero-total-dishes'),
    heroUnique: document.getElementById('hero-unique-spots'),
    splurgeName: document.getElementById('splurge-name'),
    splurgePrice: document.getElementById('splurge-price'),
    splurgeLocation: document.getElementById('splurge-location'),
    recentObsessions: document.getElementById('recent-obsessions-list'),
    clearFiltersBtn: document.getElementById('clear-filters')
};

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    setupInfiniteScroll();
    setupFilters();
    await loadMoreDishes();
}

// --- Data Fetching ---
async function loadMoreDishes() {
    if (dishesState.isLoading || !dishesState.hasMore) return;

    dishesState.isLoading = true;
    // Show loader only if it's not the initial load (which has the global loader)
    if (dishesState.items.length > 0) {
        elements.loader.classList.remove('hidden');
    }

    try {
        const url = new URL('/api/airtable', window.location.origin);
        if (dishesState.cursor) {
            url.searchParams.set('cursor', dishesState.cursor);
        }

        const response = await fetch(url);
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        if (!response.ok) throw new Error('API Failed');

        const data = await response.json();
        const newRecords = data.records || [];
        const nextCursor = data.nextCursor;

        // Process new dishes
        const newDishes = flattenDishes(newRecords);

        // Update State
        dishesState.items = [...dishesState.items, ...newDishes];
        dishesState.cursor = nextCursor;
        dishesState.hasMore = !!nextCursor;

        // Update Stats (Accumulated)
        updateStats(newDishes);

        // Render
        renderDishFeed(newDishes);
        renderMoodBubbles(); // Re-render to update counts
        renderSidebarInsights();
        updateHeroStats();

    } catch (error) {
        console.error('Failed to load dishes:', error);
    } finally {
        dishesState.isLoading = false;
        elements.loader.classList.add('hidden');
        hideLoader(); // Hide global loader

        if (!dishesState.hasMore) {
            elements.endMessage.classList.remove('hidden');
        }
    }
}

function updateStats(newDishes) {
    dishesState.totalStats.count += newDishes.length;
    newDishes.forEach(d => {
        if (d.restaurant) dishesState.totalStats.uniqueSpots.add(d.restaurant);
        dishesState.totalStats.totalSpend += (d.totalCost || 0);
    });
}

// --- Rendering ---

function renderDishFeed(newDishes) {
    // If filtering is active, we might need to re-render the whole feed from state
    // But for infinite scroll, we usually just append. 
    // Simplified logic: If filter is active, we filter the *entire* state and re-render.
    // If no filter, we just append the new ones.

    if (dishesState.filterEmoji) {
        // Filter active: Clear and re-render all matching items
        elements.feed.innerHTML = '';
        const filtered = dishesState.items.filter(d => d.emoji === dishesState.filterEmoji);
        filtered.forEach(createDishCard);
    } else {
        // No filter: Append new items
        newDishes.forEach(createDishCard);
    }
}

function createDishCard(dish) {
    const card = document.createElement('div');
    card.className = 'glass-panel p-0 rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 group animate-fade-in';

    // Visual Header (Image or Gradient)
    const visualDiv = document.createElement('div');
    visualDiv.className = 'h-48 w-full bg-gray-800 relative overflow-hidden';

    if (dish.attachments && dish.attachments.length > 0) {
        const img = document.createElement('img');
        img.src = dish.attachments[0];
        img.className = 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-110';
        img.loading = 'lazy';
        visualDiv.appendChild(img);
    } else {
        // Fallback Gradient
        visualDiv.className += ' bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center';
        const emoji = document.createElement('span');
        emoji.textContent = dish.emoji || '🍽️';
        emoji.className = 'text-6xl transform group-hover:scale-110 transition-transform duration-300';
        visualDiv.appendChild(emoji);
    }

    // Price Tag
    const priceTag = document.createElement('div');
    priceTag.className = 'absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-sm font-semibold text-white border border-white/10';
    priceTag.textContent = formatCurrency(dish.price);
    visualDiv.appendChild(priceTag);

    card.appendChild(visualDiv);

    // Content Body
    const body = document.createElement('div');
    body.className = 'p-5';

    const title = document.createElement('h3');
    title.className = 'text-lg font-bold text-white mb-1 leading-tight group-hover:text-[var(--primary-color)] transition-colors';
    title.textContent = dish.dishName;
    body.appendChild(title);

    const restaurant = document.createElement('p');
    restaurant.className = 'text-sm text-[var(--text-secondary)] mb-3 flex items-center gap-1';
    restaurant.innerHTML = `<span class="material-symbols-outlined text-[16px]">storefront</span> ${dish.restaurant}`;
    body.appendChild(restaurant);

    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-700/50';

    const date = document.createElement('span');
    date.textContent = formatDate(dish.date);
    footer.appendChild(date);

    const location = document.createElement('span');
    location.textContent = dish.city !== '—' ? dish.city : dish.country;
    footer.appendChild(location);

    body.appendChild(footer);
    card.appendChild(body);

    elements.feed.appendChild(card);
}

function renderMoodBubbles() {
    // Group all loaded items by emoji
    const groups = groupDishesByEmoji(dishesState.items);
    // Take top 15
    const topGroups = groups.slice(0, 15);

    elements.moodContainer.innerHTML = '';

    topGroups.forEach(group => {
        if (!group.hasEmoji) return;

        const btn = document.createElement('button');
        const isActive = dishesState.filterEmoji === group.emoji;

        btn.className = `flex items-center gap-2 px-4 py-2 rounded-full border transition-all whitespace-nowrap snap-start ${isActive
                ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white shadow-lg shadow-emerald-500/20'
                : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
            }`;

        btn.innerHTML = `<span class="text-xl">${group.emoji}</span> <span class="text-sm font-medium capitalize">${getEmojiLabel(group.emoji)}</span> <span class="text-xs opacity-60 ml-1">${group.count}</span>`;

        btn.onclick = () => toggleFilter(group.emoji);
        elements.moodContainer.appendChild(btn);
    });
}

function renderSidebarInsights() {
    // 1. Top Splurge
    const splurgeDish = dishesState.items.reduce((max, curr) => (curr.price > (max.price || 0) ? curr : max), {});
    if (splurgeDish.dishName) {
        elements.splurgeName.textContent = splurgeDish.dishName;
        elements.splurgePrice.textContent = formatCurrency(splurgeDish.price);
        elements.splurgeLocation.textContent = splurgeDish.restaurant;
    }

    // 2. Recent Obsessions (Top restaurants in loaded data)
    const restCounts = {};
    dishesState.items.forEach(d => {
        restCounts[d.restaurant] = (restCounts[d.restaurant] || 0) + 1;
    });
    const sortedRest = Object.entries(restCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    elements.recentObsessions.innerHTML = sortedRest.map(([name, count]) => `
        <li class="flex items-center justify-between group cursor-pointer">
            <span class="text-gray-300 group-hover:text-white transition-colors">${name}</span>
            <span class="text-xs bg-gray-800 px-2 py-1 rounded-full text-[var(--text-secondary)]">${count}</span>
        </li>
    `).join('');
}

function updateHeroStats() {
    elements.heroTotal.textContent = dishesState.totalStats.count.toLocaleString();
    elements.heroUnique.textContent = dishesState.totalStats.uniqueSpots.size.toLocaleString();
}

// --- Interactions ---

function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !dishesState.isLoading && dishesState.hasMore) {
            loadMoreDishes();
        }
    }, { rootMargin: '200px' });

    observer.observe(elements.loader);
}

function setupFilters() {
    elements.clearFiltersBtn.addEventListener('click', () => toggleFilter(null));
}

function toggleFilter(emoji) {
    if (dishesState.filterEmoji === emoji) {
        dishesState.filterEmoji = null; // Toggle off
    } else {
        dishesState.filterEmoji = emoji;
    }

    // Update UI
    elements.clearFiltersBtn.classList.toggle('hidden', !dishesState.filterEmoji);
    renderMoodBubbles(); // Re-render buttons to update active state

    // Re-render feed
    elements.feed.innerHTML = '';
    const itemsToShow = dishesState.filterEmoji
        ? dishesState.items.filter(d => d.emoji === dishesState.filterEmoji)
        : dishesState.items;

    itemsToShow.forEach(createDishCard);
}

// --- Helpers ---

function formatCurrency(value) {
    return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function formatDate(dateObj) {
    if (!dateObj) return '';
    const now = new Date();
    const diffTime = Math.abs(now - dateObj);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return 'Today';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getEmojiLabel(emoji) {
    // Simple map for demo, could be expanded
    const map = {
        '🍕': 'Pizza', '🍔': 'Burger', '🍣': 'Sushi', '🥗': 'Salad',
        '🍝': 'Pasta', '☕': 'Coffee', '🍰': 'Dessert', '🌮': 'Taco',
        '🥩': 'Steak', '🍜': 'Noodle', '🍚': 'Rice', '🥪': 'Sandwich'
    };
    return map[emoji] || 'Dish';
}
