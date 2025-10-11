export function getTrimmedStringField(source, fieldNames) {
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

export function getNumericField(source, fieldNames) {
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

export function formatPriceLevel(priceLevel) {
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
        PRICE_LEVEL_UNSPECIFIED: null,
        FREE: 0,
        INEXPENSIVE: 1,
        MODERATE: 2,
        EXPENSIVE: 3,
        VERY_EXPENSIVE: 4,
        CHEAP: 1,
        AFFORDABLE: 2,
        PRICY: 3,
        LUXURY: 4
    };

    const mappedLevel = enumLevels[normalizedKey];
    if (mappedLevel == null) {
        return null;
    }

    return coerceLevel(mappedLevel);
}

const PRICE_LEVEL_FIELD_NAMES = [
    'priceLevel',
    'price_level',
    'Price Level',
    'GooglePlacesPriceLevel',
    'Google Places Price Level',
    'google_places_price_level',
    'GooglePriceLevel',
    'Google Price Level',
    'PriceLevel'
];

export function resolvePriceLevel(...sources) {
    for (const source of sources) {
        if (!source) continue;

        const numeric = getNumericField(source, PRICE_LEVEL_FIELD_NAMES);
        if (numeric != null) {
            const formattedNumeric = formatPriceLevel(numeric);
            if (formattedNumeric) {
                return formattedNumeric;
            }
        }

        const raw = getTrimmedStringField(source, PRICE_LEVEL_FIELD_NAMES);
        if (raw != null) {
            const formattedRaw = formatPriceLevel(raw);
            if (formattedRaw) {
                return formattedRaw;
            }
        }
    }

    return null;
}
