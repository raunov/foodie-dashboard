import { showLoader, hideLoader } from './utils/loader.js';
import { flattenDishes, groupDishesByEmoji } from './utils/dish-helpers.js';

let allDishes = [];
let filteredDishes = [];
const chartInstances = {};
let selectedEmojiKey = null;
let emojiCategoryViewMode = 'top';
let emojiCategorySearchQuery = '';
let emojiCategoryFiltersInitialized = false;
const CATEGORY_TOP_LIMIT = 24;

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    showLoader();
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
        allDishes = flattenDishes(records);
        filteredDishes = [...allDishes];

        renderSummary(allDishes);
        renderEmojiCategories(allDishes);
        setupEmojiCategoryFilters();
        renderSpendTypeBreakdown(allDishes);
        renderCharts(allDishes);
        renderTable(filteredDishes);
        setupSearch();
    } catch (error) {
        console.error('Failed to initialize dishes page:', error);
        const tableBody = document.getElementById('dish-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-red-400">Failed to load dishes data.</td></tr>`;
        }
    } finally {
        hideLoader();
    }
}

function renderSummary(dishes) {
    const totalDishesEl = document.getElementById('total-dishes');
    const uniqueDishesEl = document.getElementById('unique-dishes');
    const averageDishPriceEl = document.getElementById('average-dish-price');
    const topEmojiCategoryEl = document.getElementById('top-emoji-category');
    const emojiCategoryDetailsEl = document.getElementById('emoji-category-details');
    const topSplurgeDishEl = document.getElementById('top-splurge-dish');

    const totalDishes = dishes.length;
    const priceValues = dishes.filter(d => d.price > 0).map(d => d.price);
    const totalPrice = priceValues.reduce((sum, price) => sum + price, 0);
    const avgPrice = priceValues.length ? totalPrice / priceValues.length : 0;

    const uniqueDishNames = new Set(dishes.map(d => `${d.dishName}|${d.restaurant}`));
    const emojiGroups = groupDishesByEmoji(dishes);
    const topEmoji = emojiGroups[0];
    const runnerUpEmoji = emojiGroups[1];

    const mostExpensiveDish = dishes.reduce((maxDish, current) => {
        if (!maxDish || (current.price || 0) > (maxDish.price || 0)) {
            return current;
        }
        return maxDish;
    }, null);

    if (totalDishesEl) totalDishesEl.textContent = totalDishes.toLocaleString();
    if (uniqueDishesEl) uniqueDishesEl.textContent = uniqueDishNames.size.toLocaleString();
    if (averageDishPriceEl) averageDishPriceEl.textContent = formatCurrency(avgPrice);
    if (topEmojiCategoryEl) {
        if (topEmoji) {
            const dishLabel = topEmoji.count === 1 ? 'dish' : 'dishes';
            const shareLabel = formatPercentage(topEmoji.share);
            topEmojiCategoryEl.textContent = `${topEmoji.display} ${topEmoji.count} ${dishLabel}`;
            topEmojiCategoryEl.dataset.share = shareLabel;
        } else {
            topEmojiCategoryEl.textContent = '—';
            delete topEmojiCategoryEl.dataset.share;
        }
    }

    if (emojiCategoryDetailsEl) {
        if (topEmoji) {
            const shareLabel = formatPercentage(topEmoji.share);
            const avgPriceLabel = topEmoji.averagePrice ? formatCurrency(topEmoji.averagePrice) : '€0.00';
            const parts = [`${shareLabel} of dishes`, `Avg ${avgPriceLabel}`];
            if (runnerUpEmoji) {
                parts.push(`Runner-up: ${runnerUpEmoji.display} (${runnerUpEmoji.count})`);
            }
            emojiCategoryDetailsEl.textContent = parts.join(' · ');
        } else {
            emojiCategoryDetailsEl.textContent = 'Add emoji to your dishes to unlock category insights.';
        }
    }

    if (topSplurgeDishEl) {
        if (mostExpensiveDish) {
            const priceLabel = mostExpensiveDish.price ? formatCurrency(mostExpensiveDish.price) : '€0.00';
            const location = [mostExpensiveDish.restaurant, mostExpensiveDish.country].filter(Boolean).join(' • ');
            topSplurgeDishEl.textContent = `Top splurge: ${mostExpensiveDish.dishName} (${priceLabel})${location ? ` @ ${location}` : ''}`;
        } else {
            topSplurgeDishEl.textContent = 'Top splurge: —';
        }
    }
}

function renderEmojiCategories(dishes) {
    const container = document.getElementById('emoji-category-grid');
    const wrapper = document.getElementById('emoji-category-grid-wrapper');
    const helperEl = document.getElementById('emoji-category-helper');
    const countBadge = document.getElementById('emoji-category-count');
    if (!container) return;

    const emojiGroups = groupDishesByEmoji(dishes);
    const totalCount = emojiGroups.length;
    const totalLabel = totalCount === 1 ? 'category' : 'categories';

    if (!emojiGroups.length) {
        container.innerHTML = '';
        const emptyState = document.createElement('p');
        emptyState.className = 'text-sm text-[var(--text-secondary)]';
        emptyState.textContent = 'No emoji categories yet. Add emoji to your dishes to see them here.';
        container.appendChild(emptyState);
        if (countBadge) {
            countBadge.textContent = `0 ${totalLabel}`;
        }
        if (helperEl) {
            helperEl.textContent = '';
            helperEl.classList.add('hidden');
        }
        if (wrapper) {
            wrapper.classList.remove('max-h-[32rem]', 'overflow-y-auto', 'pr-1');
        }
        selectedEmojiKey = null;
        renderEmojiCategoryDetails(null);
        updateEmojiViewButtons();
        return;
    }

    if (!selectedEmojiKey || !emojiGroups.some(group => group.key === selectedEmojiKey)) {
        selectedEmojiKey = emojiGroups[0].key;
    }

    const query = emojiCategorySearchQuery.trim().toLowerCase();
    let filteredGroups = emojiGroups;
    if (query) {
        filteredGroups = emojiGroups.filter(group => matchesEmojiGroup(group, query));
    }

    const showingLimited = !query && emojiCategoryViewMode === 'top' && filteredGroups.length > CATEGORY_TOP_LIMIT;
    const displayGroups = showingLimited ? filteredGroups.slice(0, CATEGORY_TOP_LIMIT) : filteredGroups;

    if (displayGroups.length && !displayGroups.some(group => group.key === selectedEmojiKey)) {
        selectedEmojiKey = displayGroups[0].key;
    }

    container.innerHTML = '';

    if (!displayGroups.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'text-sm text-[var(--text-secondary)]';
        emptyMessage.textContent = query
            ? `No categories match “${emojiCategorySearchQuery}”.`
            : 'No categories available with the current view.';
        container.appendChild(emptyMessage);

        if (countBadge) {
            if (query) {
                countBadge.textContent = `0 matches · ${totalCount} total ${totalLabel}`;
            } else {
                countBadge.textContent = `0 of ${totalCount} ${totalLabel}`;
            }
        }

        if (helperEl) {
            helperEl.textContent = query
                ? "Try a different search to find the emoji mood you're after."
                : 'Switch to “All” to browse every emoji category.';
            helperEl.classList.remove('hidden');
        }

        if (wrapper) {
            wrapper.classList.remove('max-h-[32rem]', 'overflow-y-auto', 'pr-1');
        }

        selectedEmojiKey = null;
        renderEmojiCategoryDetails(null);
        updateEmojiViewButtons();
        return;
    }

    displayGroups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'bg-[var(--background-color)] p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--primary-color)] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.dataset.emojiKey = group.key;

        if (group.key === selectedEmojiKey) {
            card.classList.add('border-[var(--primary-color)]', 'bg-white/5', 'ring-2', 'ring-[var(--primary-color)]/40');
        }

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-3';

        const emojiWrapper = document.createElement('div');
        emojiWrapper.className = 'flex items-center gap-2';

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'text-3xl';
        emojiSpan.textContent = group.display;
        emojiWrapper.appendChild(emojiSpan);

        if (!group.hasEmoji) {
            const labelSpan = document.createElement('span');
            labelSpan.className = 'text-xs text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[var(--border-color)]';
            labelSpan.textContent = 'No emoji';
            emojiWrapper.appendChild(labelSpan);
        }

        header.appendChild(emojiWrapper);

        const countSpan = document.createElement('span');
        countSpan.className = 'text-sm text-[var(--text-secondary)]';
        const dishLabel = group.count === 1 ? 'dish' : 'dishes';
        countSpan.textContent = `${group.count} ${dishLabel}`;
        header.appendChild(countSpan);

        card.appendChild(header);

        const averagePrice = document.createElement('p');
        averagePrice.className = 'text-lg font-semibold text-white';
        averagePrice.textContent = formatCurrency(group.averagePrice);
        card.appendChild(averagePrice);

        const shareLine = document.createElement('p');
        shareLine.className = 'text-xs text-[var(--text-secondary)] mt-2';
        const shareLabel = formatPercentage(group.share);
        const restaurantLabel = group.restaurantCount === 1 ? 'restaurant' : 'restaurants';
        shareLine.textContent = `${shareLabel} of dishes · ${group.restaurantCount} ${restaurantLabel}`;
        card.appendChild(shareLine);

        const spendLine = document.createElement('p');
        spendLine.className = 'text-xs text-[var(--text-secondary)] mt-1';
        const spendShareLabel = formatPercentage(group.spendShare);
        spendLine.textContent = `Total spend: ${formatCurrency(group.totalSpend)} · ${spendShareLabel} of spend`;
        card.appendChild(spendLine);

        card.addEventListener('click', () => {
            if (selectedEmojiKey === group.key) return;
            selectedEmojiKey = group.key;
            renderEmojiCategories(dishes);
        });

        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                card.click();
            }
        });

        container.appendChild(card);
    });

    const shouldScroll = (emojiCategoryViewMode === 'all' || query) && filteredGroups.length > CATEGORY_TOP_LIMIT;
    if (wrapper) {
        if (shouldScroll) {
            wrapper.classList.add('max-h-[32rem]', 'overflow-y-auto', 'pr-1');
        } else {
            wrapper.classList.remove('max-h-[32rem]', 'overflow-y-auto', 'pr-1');
        }
    }

    if (countBadge) {
        if (query) {
            const matchLabel = filteredGroups.length === 1 ? 'match' : 'matches';
            countBadge.textContent = `${filteredGroups.length} ${matchLabel} · ${totalCount} total ${totalLabel}`;
        } else if (showingLimited) {
            countBadge.textContent = `Top ${displayGroups.length} of ${totalCount} ${totalLabel}`;
        } else {
            countBadge.textContent = `${displayGroups.length} of ${totalCount} ${totalLabel}`;
        }
    }

    if (helperEl) {
        let helperText = '';
        if (query) {
            helperText = `Showing matches for “${emojiCategorySearchQuery}”.`;
        } else if (showingLimited) {
            helperText = 'Showing your busiest emoji moods. Switch to “All” to browse everything.';
        } else if (shouldScroll) {
            helperText = 'Scroll to explore every emoji category.';
        }
        helperEl.textContent = helperText;
        helperEl.classList.toggle('hidden', !helperText);
    }

    const selectedGroup = emojiGroups.find(group => group.key === selectedEmojiKey) || null;
    renderEmojiCategoryDetails(selectedGroup);
    updateEmojiViewButtons();
}

function setupEmojiCategoryFilters() {
    if (emojiCategoryFiltersInitialized) return;
    emojiCategoryFiltersInitialized = true;

    const searchInput = document.getElementById('emoji-category-search');
    const clearButton = document.getElementById('emoji-category-clear-search');
    const viewButtons = document.querySelectorAll('[data-emoji-view]');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            emojiCategorySearchQuery = searchInput.value.trim();
            renderEmojiCategories(allDishes);
        });

        searchInput.addEventListener('keydown', event => {
            if (event.key === 'Escape' && searchInput.value) {
                searchInput.value = '';
                emojiCategorySearchQuery = '';
                renderEmojiCategories(allDishes);
            }
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (!searchInput) return;
            if (!searchInput.value && !emojiCategorySearchQuery) return;
            searchInput.value = '';
            emojiCategorySearchQuery = '';
            renderEmojiCategories(allDishes);
            searchInput.focus();
        });
    }

    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.emojiView;
            if (!view || view === emojiCategoryViewMode) return;
            emojiCategoryViewMode = view;
            renderEmojiCategories(allDishes);
        });
    });

    updateEmojiViewButtons();
}

function updateEmojiViewButtons() {
    const buttons = document.querySelectorAll('[data-emoji-view]');
    buttons.forEach(button => {
        const view = button.dataset.emojiView;
        if (!view) return;
        const isActive = view === emojiCategoryViewMode;
        button.classList.toggle('bg-[var(--primary-color)]', isActive);
        button.classList.toggle('text-white', isActive);
        button.classList.toggle('shadow', isActive);
        button.classList.toggle('text-[var(--text-secondary)]', !isActive);
        button.classList.toggle('hover:text-white', !isActive);
    });
}

function matchesEmojiGroup(group, query) {
    if (!query) return true;
    const baseValues = [group.display, group.label, group.emoji].filter(Boolean);
    if (baseValues.some(value => value.toLowerCase().includes(query))) {
        return true;
    }
    return group.dishes.some(dish => {
        return [dish.dishName, dish.restaurant]
            .filter(Boolean)
            .some(value => value.toLowerCase().includes(query));
    });
}

function renderEmojiCategoryDetails(group) {
    const container = document.getElementById('emoji-category-detail');
    const titleEl = document.getElementById('emoji-category-detail-title');
    const metaEl = document.getElementById('emoji-category-detail-meta');
    const listBody = document.getElementById('emoji-category-detail-list');

    if (!container || !titleEl || !metaEl || !listBody) return;

    if (!group) {
        container.classList.add('hidden');
        titleEl.textContent = 'Select an emoji category';
        metaEl.textContent = 'Click a card to see all dishes for that emoji.';
        listBody.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');

    const dishLabel = group.count === 1 ? 'dish' : 'dishes';
    titleEl.textContent = `${group.display} · ${group.count} ${dishLabel}`;

    const shareLabel = formatPercentage(group.share);
    const spendShareLabel = formatPercentage(group.spendShare);
    const averagePriceLabel = group.averagePrice ? formatCurrency(group.averagePrice) : '€0.00';
    metaEl.textContent = `${shareLabel} of dishes · ${spendShareLabel} of spend · Avg price ${averagePriceLabel}`;

    const rows = group.dishes
        .slice()
        .sort((a, b) => {
            const dateA = a.date instanceof Date && !Number.isNaN(a.date.getTime()) ? a.date.getTime() : 0;
            const dateB = b.date instanceof Date && !Number.isNaN(b.date.getTime()) ? b.date.getTime() : 0;
            if (dateB !== dateA) return dateB - dateA;
            const totalDiff = (b.totalCost || 0) - (a.totalCost || 0);
            if (totalDiff !== 0) return totalDiff;
            return (b.price || 0) - (a.price || 0);
        })
        .map(dish => {
            const dateLabel = formatDate(dish.date);
            return `
                <tr class="hover:bg-gray-800/60 transition-colors">
                    <td class="px-4 py-3 whitespace-nowrap text-white">${dish.emoji ? `${dish.emoji} ` : ''}${escapeHtml(dish.dishName)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-300">${escapeHtml(dish.restaurant)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dateLabel}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dish.price ? formatCurrency(dish.price) : '—'}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dish.totalCost ? formatCurrency(dish.totalCost) : '—'}</td>
                </tr>
            `;
        })
        .join('');

    listBody.innerHTML = rows || '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No dishes recorded for this emoji.</td></tr>';
}

function renderSpendTypeBreakdown(dishes) {
    const container = document.getElementById('spend-type-breakdown');
    if (!container) return;

    const totals = dishes.reduce((acc, dish) => acc + (dish.totalCost || 0), 0);
    const spendTypeMap = dishes.reduce((acc, dish) => {
        const key = dish.spendType || 'Unclassified';
        if (!acc[key]) {
            acc[key] = { count: 0, priceSum: 0, priceCount: 0, totalCost: 0 };
        }
        acc[key].count += 1;
        acc[key].totalCost += dish.totalCost || 0;
        if (dish.price > 0) {
            acc[key].priceSum += dish.price;
            acc[key].priceCount += 1;
        }
        return acc;
    }, {});

    if (Object.keys(spendTypeMap).length === 0) {
        container.innerHTML = '<p class="text-gray-400">No dishes available to calculate breakdown.</p>';
        return;
    }

    container.innerHTML = '';
    Object.entries(spendTypeMap).forEach(([type, stats]) => {
        const avgPrice = stats.priceCount ? stats.priceSum / stats.priceCount : 0;
        const share = totals ? (stats.totalCost / totals) * 100 : 0;
        const card = document.createElement('div');
        card.className = 'bg-[var(--background-color)] p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--primary-color)] transition-colors';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-white text-lg font-semibold">${type}</h3>
                <span class="text-sm text-[var(--text-secondary)]">${stats.count} dishes</span>
            </div>
            <p class="text-2xl font-bold text-[var(--accent-blue)]">${formatCurrency(avgPrice)}</p>
            <p class="text-sm text-[var(--text-secondary)] mt-2">${share.toFixed(1)}% of dish spend</p>
        `;
        container.appendChild(card);
    });
}

function renderCharts(dishes) {
    renderCountryChart(dishes);
    renderPriceTierChart(dishes);
    renderMonthlyTrendChart(dishes);
}

function renderCountryChart(dishes) {
    const ctx = document.getElementById('countryPriceChart');
    if (!ctx) return;
    if (chartInstances.country) {
        chartInstances.country.destroy();
    }

    const countryStats = dishes.reduce((acc, dish) => {
        if (!dish.country || dish.country === '—' || !dish.price) return acc;
        const key = dish.country;
        if (!acc[key]) {
            acc[key] = { priceSum: 0, count: 0 };
        }
        acc[key].priceSum += dish.price;
        acc[key].count += 1;
        return acc;
    }, {});

    const ranked = Object.entries(countryStats)
        .map(([country, stats]) => ({ country, avg: stats.priceSum / stats.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 8);

    if (!ranked.length) {
        ctx.parentElement.innerHTML += '<p class="text-gray-400">Not enough data to show country comparison.</p>';
        return;
    }

    chartInstances.country = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ranked.map(item => item.country),
            datasets: [{
                label: 'Average price',
                data: ranked.map(item => Number(item.avg.toFixed(2))),
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: 'white', callback: value => `€${value}` },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: 'white' },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}

function renderPriceTierChart(dishes) {
    const ctx = document.getElementById('priceTierChart');
    if (!ctx) return;
    if (chartInstances.tiers) {
        chartInstances.tiers.destroy();
    }

    const tiers = {
        '€ (≤15)': 0,
        '€€ (15-35)': 0,
        '€€€ (>35)': 0
    };

    dishes.forEach(dish => {
        const price = dish.price || 0;
        if (price <= 15) tiers['€ (≤15)'] += 1;
        else if (price <= 35) tiers['€€ (15-35)'] += 1;
        else tiers['€€€ (>35)'] += 1;
    });

    const hasData = Object.values(tiers).some(count => count > 0);
    if (!hasData) {
        ctx.parentElement.innerHTML += '<p class="text-gray-400">Not enough price data for tiers.</p>';
        return;
    }

    chartInstances.tiers = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(tiers),
            datasets: [{
                label: 'Dishes',
                data: Object.values(tiers),
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: 'white' }
                }
            }
        }
    });
}

function renderMonthlyTrendChart(dishes) {
    const ctx = document.getElementById('monthlyTrendChart');
    if (!ctx) return;
    if (chartInstances.monthly) {
        chartInstances.monthly.destroy();
    }

    const monthlyStats = dishes.reduce((acc, dish) => {
        if (!dish.date || !dish.price) return acc;
        const key = `${dish.date.getFullYear()}-${String(dish.date.getMonth() + 1).padStart(2, '0')}`;
        if (!acc[key]) {
            acc[key] = { priceSum: 0, count: 0 };
        }
        acc[key].priceSum += dish.price;
        acc[key].count += 1;
        return acc;
    }, {});

    const sortedKeys = Object.keys(monthlyStats).sort();
    if (!sortedKeys.length) {
        ctx.parentElement.innerHTML += '<p class="text-gray-400">Not enough dated dishes for trend analysis.</p>';
        return;
    }

    const labels = sortedKeys;
    const averages = labels.map(key => monthlyStats[key].priceSum / monthlyStats[key].count);

    // Calculate 3-month moving average
    const movingAverage = averages.map((value, index, arr) => {
        if (index < 2) return null;
        const slice = arr.slice(index - 2, index + 1);
        const avg = slice.reduce((sum, val) => sum + val, 0) / slice.length;
        return avg;
    });

    chartInstances.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Average dish price',
                    data: averages.map(value => Number(value.toFixed(2))),
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    tension: 0.3
                },
                {
                    label: '3-month moving average',
                    data: movingAverage.map(value => (value ? Number(value.toFixed(2)) : null)),
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    tension: 0.3
                }
            ]
        },
        options: {
            plugins: {
                legend: {
                    labels: { color: 'white' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: 'white', callback: value => `€${value}` },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: 'white' },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}

function renderTable(dishes) {
    const tableBody = document.getElementById('dish-table-body');
    if (!tableBody) return;

    if (!dishes.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">No dishes match your filters.</td></tr>';
        return;
    }

    const rows = dishes.map(dish => {
        const dateLabel = formatDate(dish.date);
        return `
            <tr class="hover:bg-gray-800/60 transition-colors">
                <td class="px-4 py-3 whitespace-nowrap text-white">${dish.emoji ? `${dish.emoji} ` : ''}${escapeHtml(dish.dishName)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${escapeHtml(dish.restaurant)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${escapeHtml(dish.country || '—')}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dateLabel}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dish.price ? formatCurrency(dish.price) : '—'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dish.quantity}</td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">${dish.totalCost ? formatCurrency(dish.totalCost) : '—'}</td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;
}

function setupSearch() {
    const searchInput = document.getElementById('dish-search');
    const clearButton = document.getElementById('clear-dish-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            filteredDishes = [...allDishes];
        } else {
            filteredDishes = allDishes.filter(dish => {
                return [dish.dishName, dish.restaurant, dish.country]
                    .filter(Boolean)
                    .some(value => value.toLowerCase().includes(query));
            });
        }
        renderTable(filteredDishes);
    });

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            filteredDishes = [...allDishes];
            renderTable(filteredDishes);
        });
    }
}

function formatCurrency(value) {
    if (!Number.isFinite(value)) return '€0.00';
    return `€${value.toLocaleString('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentage(value) {
    if (!Number.isFinite(value) || value <= 0) return '0%';
    if (value < 0.1) return '<0.1%';
    return `${value.toFixed(1)}%`;
}

function formatDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toLocaleDateString('et-EE', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('et-EE', { year: 'numeric', month: 'short', day: 'numeric' });
        }
    }
    return '—';
}

function escapeHtml(value) {
    if (value == null) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
