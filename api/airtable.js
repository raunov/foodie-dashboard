// Vercel Serverless Function to proxy Airtable requests.
// This file must be placed in the /api directory.

const fetch = require('node-fetch');

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_RESTAURANT_VIEW_ID } = process.env;
const TEGEVUSED_TABLE_NAME = 'Tegevused';
const RESTORAN_TABLE_NAME = 'Restoran';

// The exported function is the handler for the serverless function.
module.exports = async (req, res) => {
  // Ensure Airtable credentials are configured
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_RESTAURANT_VIEW_ID) {
    return res.status(500).json({ error: 'Airtable credentials are not fully configured on the server.' });
  }

  // 1. Fetch only "Restoran" activities from the "Tegevused" table using the specified view
  const tegevusedUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TEGEVUSED_TABLE_NAME}?view=${AIRTABLE_RESTAURANT_VIEW_ID}`;

  try {
    const tegevusedResponse = await fetch(tegevusedUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!tegevusedResponse.ok) {
      const errorData = await tegevusedResponse.text();
      console.error('Airtable API Error (Tegevused):', errorData);
      return res.status(tegevusedResponse.status).json({ error: `Airtable API error (Tegevused): ${tegevusedResponse.statusText}` });
    }

    const tegevusedData = await tegevusedResponse.json();
    const tegevusedRecords = tegevusedData.records || [];

    // 2. Extract linked "Restoran" record IDs
    const restoranRecordIds = tegevusedRecords.flatMap(record => record.fields.Toidud || []);

    if (restoranRecordIds.length === 0) {
      // No linked items, just return the filtered activities
      return res.status(200).json(tegevusedData);
    }

    // 3. Fetch linked records from the "Restoran" table
    // We need to batch the requests if there are many record IDs
    const fetchPromises = [];
    const batchSize = 100; // Airtable API limit for records per request using formula

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
    const combinedRecords = tegevusedRecords.map(tegevus => {
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

    // Set caching headers
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    
    // 5. Send the combined data back
    res.status(200).json({ records: combinedRecords });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch and process data from Airtable.' });
  }
};
