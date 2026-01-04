// Vercel Serverless Function to proxy Airtable requests.
// This file must be placed in the /api directory.

const fetch = require('node-fetch');
const { isAuthenticated } = require('./utils/auth');

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_RESTAURANT_VIEW_ID } = process.env;
const TEGEVUSED_TABLE_NAME = 'Tegevused';
const RESTORAN_TABLE_NAME = 'Restoran';

// The exported function is the handler for the serverless function.
module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Ensure Airtable credentials are configured
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_RESTAURANT_VIEW_ID) {
    return res.status(500).json({ error: 'Airtable credentials are not fully configured on the server.' });
  }

  // Get cursor from query parameters for pagination
  const { cursor } = req.query;

  // 1. Fetch one page of "Restoran" activities from the "Tegevused" table
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TEGEVUSED_TABLE_NAME}?view=${AIRTABLE_RESTAURANT_VIEW_ID}&pageSize=24`;
  const tegevusedUrl = cursor ? `${baseUrl}&offset=${cursor}` : baseUrl;

  try {
    // Parallel Fetch: If first page, also fetch global stats (lightweight)
    const promises = [
      fetch(tegevusedUrl, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } })
    ];

    if (!cursor) {
      // Fetch ALL Tegevused (IDs and Nimetus only) for stats
      // We use a separate recursive function or loop here to get all IDs
      // Note: We use 'fields' to minimize data transfer
      const statsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TEGEVUSED_TABLE_NAME}?view=${AIRTABLE_RESTAURANT_VIEW_ID}&fields%5B%5D=Toidud&fields%5B%5D=Nimetus`;
      promises.push(fetchAllTegevused(statsUrl, AIRTABLE_API_KEY));
    }

    const [tegevusedResponse, statsData] = await Promise.all(promises);

    if (!tegevusedResponse.ok) {
      const errorData = await tegevusedResponse.text();
      console.error('Airtable API Error (Tegevused):', errorData);
      return res.status(tegevusedResponse.status).json({ error: `Airtable API error (Tegevused): ${tegevusedResponse.statusText}` });
    }

    const tegevusedData = await tegevusedResponse.json();
    const tegevusedRecords = tegevusedData.records || [];
    const nextCursor = tegevusedData.offset;

    // 2. Extract linked "Restoran" record IDs from this page only
    const restoranRecordIds = [...new Set(tegevusedRecords.flatMap(record => record.fields.Toidud || []))];

    let combinedRecords = [];
    if (restoranRecordIds.length > 0) {
      // 3. Fetch linked records from the "Restoran" table
      const fetchPromises = [];
      const batchSize = 100;

      for (let i = 0; i < restoranRecordIds.length; i += batchSize) {
        const batchIds = restoranRecordIds.slice(i, i + batchSize);
        const formula = `OR(${batchIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
        const restoranUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESTORAN_TABLE_NAME}?filterByFormula=${encodeURIComponent(formula)}`;

        fetchPromises.push(fetch(restoranUrl, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
        }).then(response => {
          if (!response.ok) throw new Error(`Airtable API error (Restoran): ${response.statusText}`);
          return response.json();
        }));
      }

      const restoranResults = await Promise.all(fetchPromises);
      const restoranRecords = restoranResults.flatMap(result => result.records);
      const restoranRecordsById = restoranRecords.reduce((acc, record) => {
        acc[record.id] = record;
        return acc;
      }, {});

      // 4. Combine the data
      combinedRecords = tegevusedRecords.map(tegevus => {
        const linkedRestoranIds = tegevus.fields.Toidud || [];
        const linkedRestoranDetails = linkedRestoranIds.map(id => restoranRecordsById[id]).filter(Boolean);
        return {
          ...tegevus,
          fields: {
            ...tegevus.fields,
            ToidudDetails: linkedRestoranDetails,
          },
        };
      });
    } else {
      combinedRecords = tegevusedRecords;
    }

    // Set caching headers
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');

    // 5. Send response with stats if available
    const responsePayload = { records: combinedRecords, nextCursor };
    if (statsData) {
      responsePayload.stats = statsData;
    }

    res.status(200).json(responsePayload);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch and process data from Airtable.' });
  }
};

// Helper to fetch all pages for stats (lightweight)
async function fetchAllTegevused(url, apiKey) {
  let allRecords = [];
  let offset = null;
  do {
    const pageUrl = offset ? `${url}&offset=${offset}` : url;
    const response = await fetch(pageUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) break;
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  // Calculate stats
  const totalDishes = allRecords.reduce((sum, r) => sum + (r.fields.Toidud?.length || 0), 0);
  const uniqueSpots = new Set(allRecords.map(r => r.fields.Nimetus).filter(Boolean)).size;

  return { totalDishes, uniqueSpots };
}
