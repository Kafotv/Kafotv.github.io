// Vercel Serverless Function for Google Indexing API
// This function handles authentication and sends indexing requests to Google

const { google } = require('googleapis');

// Service Account credentials (you'll need to add these as environment variables in Vercel)
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Validate URL format
        if (!url.startsWith('https://kafotv.github.io/')) {
            return res.status(400).json({ error: 'Invalid URL domain' });
        }

        // Check if credentials are configured
        if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
            return res.status(500).json({
                error: 'Server configuration error: Missing credentials',
                hint: 'Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Vercel environment variables'
            });
        }

        // Create JWT client for authentication
        const jwtClient = new google.auth.JWT(
            SERVICE_ACCOUNT_EMAIL,
            null,
            PRIVATE_KEY,
            ['https://www.googleapis.com/auth/indexing'],
            null
        );

        // Authorize the client
        await jwtClient.authorize();

        // Create indexing service
        const indexing = google.indexing({
            version: 'v3',
            auth: jwtClient,
        });

        // Send indexing request
        const response = await indexing.urlNotifications.publish({
            requestBody: {
                url: url,
                type: 'URL_UPDATED',
            },
        });

        console.log('Indexing request sent:', url, response.data);

        return res.status(200).json({
            success: true,
            message: 'Indexing request sent successfully',
            url: url,
            response: response.data
        });

    } catch (error) {
        console.error('Indexing API error:', error);

        return res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || 'No additional details'
        });
    }
};
