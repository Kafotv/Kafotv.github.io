const fs = require('fs');
const https = require('https');

const BASE_URL = 'https://kafotv.github.io';
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/shwo90s/databases/(default)/documents/movies?pageSize=1000';

async function fetchMovies() {
    return new Promise((resolve, reject) => {
        https.get(FIRESTORE_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const movies = json.documents || [];
                    resolve(movies.map(doc => {
                        const parts = doc.name.split('/');
                        return parts[parts.length - 1];
                    }));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log('Fetching movies...');
        const movieIds = await fetchMovies();
        console.log(`Found ${movieIds.length} movies.`);

        const staticPages = [
            '/',
            '/kids.html',
            '/movies.html'
        ];

        const allUrls = [
            ...staticPages.map(p => `${BASE_URL}${p}`),
            ...movieIds.map(id => `${BASE_URL}/movies.html?id=${id}`)
        ];

        // 1. Generate sitemap.xml
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${allUrls.map(url => `    <url>
        <loc>${url}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>daily</changefreq>
        <priority>${url.includes('id=') ? '0.7' : '1.0'}</priority>
    </url>`).join('\n')}
</urlset>`;

        // 2. Generate sitemap-index.xml (Proper Index Format)
        const indexContent = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
        <loc>${BASE_URL}/sitemap-main.xml</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    </sitemap>
</sitemapindex>`;

        // 3. Generate sitemap.txt
        const txtContent = allUrls.join('\n');

        fs.writeFileSync('sitemap-main.xml', xmlContent);
        fs.writeFileSync('sitemap-index.xml', indexContent);
        fs.writeFileSync('sitemap.txt', txtContent);

        console.log('Sitemaps updated successfully!');
    } catch (e) {
        console.error('Error generating sitemaps:', e);
        process.exit(1);
    }
}

run();
