export function flattenDishes(records) {
    const dishes = [];

    records.forEach((record, recordIndex) => {
        const fields = record?.fields || {};
        const dishDetails = Array.isArray(fields.ToidudDetails) ? fields.ToidudDetails : [];
        const photos = (fields.Photos || []).concat(fields.Attachments || []);
        const photoUrls = photos
            .map(item => item?.thumbnails?.small?.url || item?.thumbnails?.large?.url || item?.url)
            .filter(Boolean);

        dishDetails.forEach((dishRecord, index) => {
            const dishFields = dishRecord?.fields || {};
            const price = parseNumber(dishFields.Maksumus ?? dishFields.Price);
            const quantity = parseNumber(dishFields.kogus ?? dishFields.Kogus ?? 1) || 1;
            const totalCostCandidate = parseNumber(dishFields.Kogukulu ?? dishFields.Total);
            const totalCost = totalCostCandidate > 0 ? totalCostCandidate : (price || 0) * quantity;
            const dishName = dishFields.Toode || dishFields.Nimetus || 'Unknown dish';
            const restaurant = dishFields.Restoran || dishFields.Restaurant || fields.Nimetus || 'Unknown restaurant';
            const emoji = (dishFields.Emoji || fields.Emoji || '').toString().trim();

            dishes.push({
                id: record.id ? `${record.id}-${dishRecord?.id || index}` : `record-${recordIndex}-${dishRecord?.id || index}`,
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
                emoji,
                attachments: photoUrls
            });
        });
    });

    return dishes;
}

export function groupDishesByEmoji(dishes) {
    const groups = {};
    const totalDishes = dishes.length;
    const totalSpend = dishes.reduce((sum, dish) => sum + (dish.totalCost || 0), 0);

    dishes.forEach(dish => {
        const rawEmoji = typeof dish.emoji === 'string' ? dish.emoji.trim() : '';
        const key = rawEmoji || 'no-emoji';

        if (!groups[key]) {
            groups[key] = {
                key,
                emoji: rawEmoji,
                count: 0,
                totalSpend: 0,
                priceSum: 0,
                priceCount: 0,
                restaurants: new Set(),
                dishes: []
            };
        }

        const group = groups[key];
        group.count += 1;
        group.totalSpend += dish.totalCost || 0;
        group.dishes.push(dish);

        if (dish.price > 0) {
            group.priceSum += dish.price;
            group.priceCount += 1;
        }

        if (dish.restaurant) {
            group.restaurants.add(dish.restaurant);
        }
    });

    return Object.values(groups)
        .map(group => {
            const averagePrice = group.priceCount ? group.priceSum / group.priceCount : 0;
            const share = totalDishes ? (group.count / totalDishes) * 100 : 0;
            const spendShare = totalSpend ? (group.totalSpend / totalSpend) * 100 : 0;
            const hasEmoji = Boolean(group.emoji);

            return {
                key: group.key,
                emoji: group.emoji,
                display: hasEmoji ? group.emoji : '❓',
                label: hasEmoji ? group.emoji : 'No emoji',
                count: group.count,
                totalSpend: group.totalSpend,
                averagePrice,
                share,
                spendShare,
                restaurantCount: group.restaurants.size,
                hasEmoji,
                dishes: group.dishes
            };
        })
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.totalSpend !== a.totalSpend) return b.totalSpend - a.totalSpend;
            return a.label.localeCompare(b.label);
        });
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
