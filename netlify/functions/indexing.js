// Netlify Serverless Function for Google Indexing API
const { google } = require('googleapis');

// Service Account credentials from environment variables
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle preflight request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { url } = JSON.parse(event.body);

        if (!url) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'URL is required' })
            };
        }

        // Validate URL format
        if (!url.startsWith('https://kafotv.github.io/')) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid URL domain' })
            };
        }

        // Check if credentials are configured
        if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Server configuration error: Missing credentials',
                    hint: 'Please configure environment variables'
                })
            };
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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Indexing request sent successfully',
                url: url,
                response: response.data
            })
        };

    } catch (error) {
        console.error('Indexing API error:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.response?.data || 'No additional details'
            })
        };
    }
};
