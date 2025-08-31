// Vercel Serverless Function to provide the Mapbox public token to the client.
// This file must be placed in the /api directory.

const { isAuthenticated } = require('./utils/auth');

module.exports = (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const mapboxToken = process.env.MAPBOX_PUBLIC_TOKEN;

  if (!mapboxToken) {
    return res.status(500).json({ error: 'Mapbox token is not configured on the server.' });
  }

  res.status(200).json({ token: mapboxToken });
};
