// --- Insight Calculation Functions ---

export function calculateTotalSpent(records) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const totals = {
        local: { mtd: 0, ytd: 0, rolling30d: 0 },
        travel: { mtd: 0, ytd: 0, rolling30d: 0 }
    };

    records.forEach(record => {
        const recordDate = new Date(record.fields.Kuupäev);
        const cost = record.fields.Kokku || 0;
        const type = record.fields['Spend Type'] === 'Local' ? 'local' : 'travel';

        if (recordDate >= thirtyDaysAgo) totals[type].rolling30d += cost;
        if (recordDate >= startOfMonth) totals[type].mtd += cost;
        if (recordDate >= startOfYear) totals[type].ytd += cost;
    });
    
    // Format to 2 decimal places
    for (const type in totals) {
        for (const period in totals[type]) {
            totals[type][period] = totals[type][period].toFixed(2);
        }
    }
    return totals;
}

export function calculateAverageAndMedianBill(localRecords, travelRecords) {
    const calculateStats = (recs) => {
        if (recs.length === 0) return { avg: 0, median: 0 };
        const costs = recs.map(r => r.fields.Kokku || 0).sort((a, b) => a - b);
        const sum = costs.reduce((a, b) => a + b, 0);
        const avg = sum / costs.length;
        
        const mid = Math.floor(costs.length / 2);
        const median = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
        
        return { avg: avg.toFixed(2), median: median.toFixed(2) };
    };

    return {
        local: calculateStats(localRecords),
        travel: calculateStats(travelRecords)
    };
}

export function calculateWeekdayProfile(records) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyTotals = Array(7).fill(0);
    const dailyCounts = Array(7).fill(0);

    records.forEach(record => {
        const dayIndex = new Date(record.fields.Kuupäev).getDay();
        dailyTotals[dayIndex] += record.fields.Kokku || 0;
        dailyCounts[dayIndex]++;
    });

    const dailyAverages = dailyTotals.map((total, i) => (dailyCounts[i] > 0 ? total / dailyCounts[i] : 0));

    return {
        labels: weekdays,
        data: dailyAverages.map(avg => avg.toFixed(2))
    };
}

export function calculateTimeOfDayMix(records) {
    const mix = { 'Lunch (10-15)': 0, 'Dinner (18-22)': 0, 'Late (22-03)': 0, 'Other': 0 };

    records.forEach(record => {
        if (!record.fields.created_exif) return;
        const hour = new Date(record.fields.created_exif).getHours();
        const cost = record.fields.Kokku || 0;

        if (hour >= 10 && hour < 15) mix['Lunch (10-15)'] += cost;
        else if (hour >= 18 && hour < 22) mix['Dinner (18-22)'] += cost;
        else if (hour >= 22 || hour < 3) mix['Late (22-03)'] += cost;
        else mix['Other'] += cost;
    });

    return {
        labels: Object.keys(mix),
        data: Object.values(mix).map(v => v.toFixed(2))
    };
}

export function calculateSeasonality(records) {
    const monthlyTotals = {};
    records.forEach(record => {
        const month = record.fields.Kuu; // "YY-MM"
        if (!month) return;
        monthlyTotals[month] = (monthlyTotals[month] || 0) + (record.fields.Kokku || 0);
    });

    const sortedMonths = Object.keys(monthlyTotals).sort();
    const monthlyData = sortedMonths.map(month => monthlyTotals[month]);

    // 3-month moving average
    const movingAverage = [];
    for (let i = 2; i < monthlyData.length; i++) {
        const avg = (monthlyData[i - 2] + monthlyData[i - 1] + monthlyData[i]) / 3;
        movingAverage.push(avg);
    }
    // Pad start with nulls to align chart
    const paddedMovingAverage = Array(2).fill(null).concat(movingAverage);

    return {
        labels: sortedMonths,
        datasets: [
            { label: 'Total Spend', data: monthlyData.map(d => d.toFixed(2)), tension: 0.1, borderColor: 'rgba(54, 162, 235, 1)' },
            { label: '3-Month Avg', data: paddedMovingAverage.map(d => d ? d.toFixed(2) : null), tension: 0.1, borderColor: 'rgba(255, 99, 132, 1)' }
        ]
    };
}

export function calculateSpendVolatility(records) {
    const dailySpends = {};
    records.forEach(record => {
        const date = record.fields.Kuupäev;
        dailySpends[date] = (dailySpends[date] || 0) + (record.fields.Kokku || 0);
    });

    const spends = Object.values(dailySpends);
    if (spends.length < 2) return { stdDev: '0.00', outlierDays: 0 };

    const mean = spends.reduce((a, b) => a + b, 0) / spends.length;
    const variance = spends.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / spends.length;
    const stdDev = Math.sqrt(variance);

    const zScoreThreshold = 2;
    const outlierDays = spends.filter(spend => ((spend - mean) / stdDev) > zScoreThreshold).length;

    return {
        stdDev: stdDev.toFixed(2),
        outlierDays: outlierDays
    };
}

export function calculateLocalVsTravelShare(localRecords, travelRecords) {
    const localCount = localRecords.length;
    const travelCount = travelRecords.length;
    const localValue = localRecords.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);
    const travelValue = travelRecords.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);

    const avgLocal = localCount > 0 ? localValue / localCount : 0;
    const avgTravel = travelCount > 0 ? travelValue / travelCount : 0;
    const travelPremium = avgLocal > 0 ? (avgTravel / avgLocal).toFixed(2) : 'N/A';

    return {
        labels: ['Local', 'Travel'],
        countData: [localCount, travelCount],
        valueData: [localValue.toFixed(2), travelValue.toFixed(2)],
        travelPremium
    };
}

export function calculateFamilyInvolvement(records) {
    const costsByFamilySize = {};
    const countsByFamilySize = {};

    records.filter(r => r.fields.Pere && r.fields.Pere.length > 1).forEach(record => {
        const familySize = record.fields.Pere.length;
        const costPerPerson = (record.fields.Kokku || 0) / familySize;
        
        costsByFamilySize[familySize] = (costsByFamilySize[familySize] || 0) + costPerPerson;
        countsByFamilySize[familySize] = (countsByFamilySize[familySize] || 0) + 1;
    });

    const avgCosts = {};
    for (const size in costsByFamilySize) {
        avgCosts[size] = (costsByFamilySize[size] / countsByFamilySize[size]).toFixed(2);
    }
    return avgCosts;
}

export function calculateStreaks(records) {
    if (records.length === 0) return { longestStreak: 0, longestGap: 0 };

    const dates = [...new Set(records.map(r => r.fields.Kuupäev).filter(Boolean))].sort();
    if (dates.length < 2) return { longestStreak: dates.length, longestGap: 0 };

    const timestamps = dates.map(d => new Date(d).getTime());
    
    let longestStreak = 1, currentStreak = 1;
    let longestGap = 0;

    for (let i = 1; i < timestamps.length; i++) {
        const diffDays = Math.round((timestamps[i] - timestamps[i-1]) / (1000 * 3600 * 24));
        if (diffDays === 1) {
            currentStreak++;
        } else {
            longestStreak = Math.max(longestStreak, currentStreak);
            currentStreak = 1;
            if (diffDays > 1) {
                longestGap = Math.max(longestGap, diffDays - 1);
            }
        }
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    return { longestStreak, longestGap };
}

export function calculateWeekendEffect(records) {
    let weekendSpend = 0, weekdaySpend = 0;
    let weekendCount = 0, weekdayCount = 0;

    records.forEach(record => {
        const day = new Date(record.fields.Kuupäev).getDay();
        const cost = record.fields.Kokku || 0;
        if (day === 0 || day === 6) { // Sun or Sat
            weekendSpend += cost;
            weekendCount++;
        } else {
            weekdaySpend += cost;
            weekdayCount++;
        }
    });

    const avgWeekend = weekendCount > 0 ? (weekendSpend / weekendCount) : 0;
    const avgWeekday = weekdayCount > 0 ? (weekdaySpend / weekdayCount) : 0;
    const deltaPercent = avgWeekday > 0 ? (((avgWeekend - avgWeekday) / avgWeekday) * 100) : 0;

    return {
        avgWeekend: avgWeekend.toFixed(2),
        avgWeekday: avgWeekday.toFixed(2),
        deltaPercent: deltaPercent.toFixed(2)
    };
}

export function calculateAttachmentCoverage(records) {
    const withAttachment = records.filter(r => r.fields.Attachments && r.fields.Attachments.length > 0);
    const withoutAttachment = records.filter(r => !r.fields.Attachments || r.fields.Attachments.length === 0);

    const coveragePercent = records.length > 0 ? (withAttachment.length / records.length) * 100 : 0;
    const sumWith = withAttachment.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);
    const sumWithout = withoutAttachment.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);

    return {
        coveragePercent: coveragePercent.toFixed(2),
        avgWith: (withAttachment.length > 0 ? sumWith / withAttachment.length : 0).toFixed(2),
        avgWithout: (withoutAttachment.length > 0 ? sumWithout / withoutAttachment.length : 0).toFixed(2)
    };
}

export function calculateCityMix(records) {
    const cityTotals = {};
    let totalSpend = 0;

    records.forEach(record => {
        const city = record.fields.Linn || 'Unknown';
        const cost = record.fields.Kokku || 0;
        cityTotals[city] = (cityTotals[city] || 0) + cost;
        totalSpend += cost;
    });

    const sortedCities = Object.entries(cityTotals).sort(([,a],[,b]) => b-a);
    const tallinnSpend = cityTotals['Tallinn'] || 0;
    const tallinnShare = totalSpend > 0 ? (tallinnSpend / totalSpend) * 100 : 0;

    return {
        top5: sortedCities.slice(0, 5),
        tallinnShare: tallinnShare.toFixed(2)
    };
}

// --- Achievement Checking Functions ---

export function checkFirstBite(records) {
    return records.length > 0;
}

export function checkTallinnLoyalist(records) {
    const localRecords = records
        .filter(r => r.fields['Spend Type'] === 'Local' && r.fields.Linn === 'Tallinn')
        .sort((a, b) => new Date(a.fields.Kuupäev) - new Date(b.fields.Kuupäev));

    if (localRecords.length < 20) return false;

    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    for (let i = 0; i <= localRecords.length - 20; i++) {
        const windowStart = new Date(localRecords[i].fields.Kuupäev);
        const windowEnd = new Date(localRecords[i + 19].fields.Kuupäev);
        if (windowEnd - windowStart <= ninetyDays) {
            return true;
        }
    }
    return false;
}

export function checkGlobeTaster(records) {
    const countries = new Set(records.map(r => r.fields.Riik).filter(Boolean));
    return countries.size >= 3;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return [d.getUTCFullYear(), weekNo];
}

export function checkWeekendWarrior(records) {
    const weekendBills = records.filter(r => {
        const day = new Date(r.fields.Kuupäev).getDay();
        return day === 0 || day === 6;
    });

    const uniqueWeeks = [...new Set(weekendBills.map(r => getWeekNumber(new Date(r.fields.Kuupäev)).join('-')))].sort();
    
    if (uniqueWeeks.length < 6) return false;

    let consecutiveCount = 1;
    for (let i = 1; i < uniqueWeeks.length; i++) {
        const [year1, week1] = uniqueWeeks[i-1].split('-').map(Number);
        const [year2, week2] = uniqueWeeks[i].split('-').map(Number);

        if (year1 === year2 && week2 === week1 + 1) {
            consecutiveCount++;
        } else if (year2 === year1 + 1 && week2 === 1 && week1 >= 52) { // Handle year change
            consecutiveCount++;
        } else {
            consecutiveCount = 1;
        }
        if (consecutiveCount >= 6) return true;
    }
    return false;
}

export function checkBudgetNinja(records) {
    const localRecords = records.filter(r => r.fields['Spend Type'] === 'Local');
    const monthlyAverages = {};

    localRecords.forEach(r => {
        const month = r.fields.Kuu; // "YY-MM"
        if (!monthlyAverages[month]) monthlyAverages[month] = { total: 0, count: 0 };
        monthlyAverages[month].total += r.fields.Kokku || 0;
        monthlyAverages[month].count++;
    });

    const sortedMonths = Object.keys(monthlyAverages).sort();
    if (sortedMonths.length < 8) return false; // Need at least 6 months for avg + 2 to check

    for (let i = 7; i < sortedMonths.length; i++) {
        const prev6Months = sortedMonths.slice(i - 7, i - 1);
        let total6mo = 0, count6mo = 0;
        prev6Months.forEach(m => {
            total6mo += monthlyAverages[m].total;
            count6mo += monthlyAverages[m].count;
        });
        const avg6mo = count6mo > 0 ? total6mo / count6mo : 0;
        const targetAvg = avg6mo * 0.85;

        const month1Avg = monthlyAverages[sortedMonths[i-1]].total / monthlyAverages[sortedMonths[i-1]].count;
        const month2Avg = monthlyAverages[sortedMonths[i]].total / monthlyAverages[sortedMonths[i]].count;

        if (month1Avg <= targetAvg && month2Avg <= targetAvg) {
            return true;
        }
    }
    return false;
}

export function checkConsistencyStreak(records) {
    const streaks = calculateStreaks(records); // Re-use the streak logic
    return streaks.longestStreak >= 10;
}

export function checkTravelPremiumCrusher(records) {
    // This is a simplified check. A real implementation might need to group by trips.
    // For now, we check if the overall travel average is within 10% of local.
    const localRecords = records.filter(r => r.fields['Spend Type'] === 'Local');
    const travelRecords = records.filter(r => r.fields['Spend Type'] === 'Travel');
    
    if (localRecords.length === 0 || travelRecords.length === 0) return false;

    const localValue = localRecords.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);
    const travelValue = travelRecords.reduce((sum, r) => sum + (r.fields.Kokku || 0), 0);
    const avgLocal = localValue / localRecords.length;
    const avgTravel = travelValue / travelRecords.length;

    return avgTravel <= avgLocal * 1.10;
}

export function checkFamilyFeast(records) {
    return records.some(r => {
        const familySize = r.fields.Pere ? r.fields.Pere.length : 0;
        if (familySize < 4) return false;
        const costPerPerson = (r.fields.Kokku || 0) / familySize;
        return costPerPerson <= 15;
    });
}

export function check500Month(records) {
    const monthlyTotals = {};
    records.forEach(record => {
        const month = record.fields.Kuu;
        if (!month) return;
        monthlyTotals[month] = (monthlyTotals[month] || 0) + (record.fields.Kokku || 0);
    });
    return Object.values(monthlyTotals).some(total => total >= 500);
}

export function checkPhotoHistorian(records) {
    const monthlyPhotoStats = {};
    records.forEach(r => {
        const month = r.fields.Kuu;
        if (!month) return;
        if (!monthlyPhotoStats[month]) monthlyPhotoStats[month] = { total: 0, withPhoto: 0 };
        monthlyPhotoStats[month].total++;
        if (r.fields.Attachments && r.fields.Attachments.length > 0) {
            monthlyPhotoStats[month].withPhoto++;
        }
    });

    return Object.values(monthlyPhotoStats).some(stats => {
        if (stats.total === 0) return false;
        return (stats.withPhoto / stats.total) >= 0.6;
    });
}
