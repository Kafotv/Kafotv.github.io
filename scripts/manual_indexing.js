const { google } = require('googleapis');

async function run() {
    const url = process.env.INDEXING_URL;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    if (!url || !clientEmail || !privateKey) {
        console.error('Missing required environment variables');
        process.exit(1);
    }

    try {
        const jwtClient = new google.auth.JWT(
            clientEmail,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/indexing'],
            null
        );

        await jwtClient.authorize();

        const indexing = google.indexing({
            version: 'v3',
            auth: jwtClient,
        });

        console.log(`Sending indexing request for: ${url}`);

        const res = await indexing.urlNotifications.publish({
            requestBody: {
                url: url,
                type: 'URL_UPDATED',
            },
        });

        console.log('Success:', res.data);
    } catch (err) {
        console.error('Error:', err.message);
        if (err.response && err.response.data) {
            console.error('Details:', JSON.stringify(err.response.data, null, 2));
        }
        process.exit(1);
    }
}

run();
