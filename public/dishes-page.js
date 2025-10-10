import { showLoader, hideLoader } from './utils/loader.js';

let allDishes = [];
let filteredDishes = [];
const chartInstances = {};

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

function flattenDishes(records) {
    const dishes = [];

    records.forEach(record => {
        const fields = record.fields || {};
        const dishDetails = Array.isArray(fields.ToidudDetails) ? fields.ToidudDetails : [];
        const photos = (fields.Photos || []).concat(fields.Attachments || []);
        const photoUrls = photos
            .map(item => item.thumbnails?.small?.url || item.thumbnails?.large?.url || item.url)
            .filter(Boolean);

        dishDetails.forEach((dishRecord, index) => {
            const dishFields = dishRecord?.fields || {};
            const price = parseNumber(dishFields.Maksumus ?? dishFields.Price);
            const quantity = parseNumber(dishFields.kogus ?? dishFields.Kogus ?? 1) || 1;
            const totalCostCandidate = parseNumber(dishFields.Kogukulu ?? dishFields.Total);
            const totalCost = totalCostCandidate > 0 ? totalCostCandidate : (price || 0) * quantity;
            const dishName = dishFields.Toode || dishFields.Nimetus || 'Unknown dish';
            const restaurant = dishFields.Restoran || dishFields.Restaurant || fields.Nimetus || 'Unknown restaurant';

            dishes.push({
                id: `${record.id}-${dishRecord?.id || index}`,
                dishName,
                restaurant,
                country: dishFields.Riik || fields.Riik || '—',
                city: dishFields.Linn || fields.Linn || '—',
                price,
                quantity,
                totalCost,
                spendType: fields['Spend Type'] || 'Unclassified',
                date: fields.Kuupäev ? new Date(fields.Kuupäev) : null,
                activityName: fields.Nimetus || 'Untitled bill',
                emoji: dishFields.Emoji || fields.Emoji || '',
                attachments: photoUrls
            });
        });
    });

    return dishes;
}

function parseNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9.\-]/g, '');
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function renderSummary(dishes) {
    const totalDishesEl = document.getElementById('total-dishes');
    const uniqueDishesEl = document.getElementById('unique-dishes');
    const averageDishPriceEl = document.getElementById('average-dish-price');
    const mostFrequentDishEl = document.getElementById('most-frequent-dish');
    const mostExpensiveDishEl = document.getElementById('most-expensive-dish');

    const totalDishes = dishes.length;
    const priceValues = dishes.filter(d => d.price > 0).map(d => d.price);
    const totalPrice = priceValues.reduce((sum, price) => sum + price, 0);
    const avgPrice = priceValues.length ? totalPrice / priceValues.length : 0;

    const uniqueDishNames = new Set(dishes.map(d => `${d.dishName}|${d.restaurant}`));

    const frequencyMap = dishes.reduce((acc, dish) => {
        const key = `${dish.dishName}|${dish.restaurant}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const mostFrequentEntry = Object.entries(frequencyMap).sort((a, b) => b[1] - a[1])[0];
    const mostFrequentDish = mostFrequentEntry ? mostFrequentEntry[0].split('|')[0] : '—';

    const mostExpensiveDish = dishes.reduce((maxDish, current) => {
        if (!maxDish || (current.price || 0) > (maxDish.price || 0)) {
            return current;
        }
        return maxDish;
    }, null);

    if (totalDishesEl) totalDishesEl.textContent = totalDishes.toLocaleString();
    if (uniqueDishesEl) uniqueDishesEl.textContent = uniqueDishNames.size.toLocaleString();
    if (averageDishPriceEl) averageDishPriceEl.textContent = formatCurrency(avgPrice);
    if (mostFrequentDishEl) mostFrequentDishEl.textContent = mostFrequentDish;
    if (mostExpensiveDishEl) {
        if (mostExpensiveDish) {
            const priceLabel = mostExpensiveDish.price ? formatCurrency(mostExpensiveDish.price) : '€0.00';
            const location = [mostExpensiveDish.restaurant, mostExpensiveDish.country].filter(Boolean).join(' • ');
            mostExpensiveDishEl.textContent = `Top splurge: ${mostExpensiveDish.dishName} (${priceLabel})${location ? ` @ ${location}` : ''}`;
        } else {
            mostExpensiveDishEl.textContent = 'Top splurge: —';
        }
    }
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
        const dateLabel = dish.date ? dish.date.toLocaleDateString() : '—';
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
