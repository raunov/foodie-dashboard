// Vercel Serverless Function to proxy Airtable requests.
// This file must be placed in the /api directory.

const fetch = require('node-fetch');

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE_NAME = 'Tegevused'; // Your table name

// The exported function is the handler for the serverless function.
module.exports = async (req, res) => {
  // Ensure Airtable credentials are configured
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: 'Airtable credentials are not configured on the server.' });
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

  try {
    const airtableResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!airtableResponse.ok) {
      // Pass along the error from Airtable for better debugging
      const errorData = await airtableResponse.text();
      console.error('Airtable API Error:', errorData);
      return res.status(airtableResponse.status).json({ error: `Airtable API error: ${airtableResponse.statusText}` });
    }

    const data = await airtableResponse.json();
    
    // Set caching headers to allow Vercel to cache the response for a short time
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    
    // Send the data back to the front-end
    res.status(200).json(data);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data from Airtable.' });
  }
};