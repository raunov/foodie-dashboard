// A simple Express server to proxy Airtable requests
// This keeps your API key secure on the server-side.

const express = require('express');
const fetch = require('node-fetch'); // Use require for CommonJS modules
const app = express();
const path = require('path');

// Load environment variables from a .env file during development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE_NAME = 'Tegevused'; // The table name from your schema

// The API endpoint that the front-end will call
app.get('/api/airtable', async (req, res) => {
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
      throw new Error(`Airtable API error: ${airtableResponse.statusText}`);
    }

    const data = await airtableResponse.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data from Airtable.' });
  }
});

// Serve the static HTML file
app.use(express.static(path.join(__dirname, '')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
