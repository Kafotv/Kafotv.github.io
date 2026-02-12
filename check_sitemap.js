const fs = require('fs');
const path = require('path');

try {
    const content = fs.readFileSync('sitemap.xml', 'utf8');
    console.log('File length:', content.length);
    console.log('First 50 chars:', content.substring(0, 50));

    // Check for weird start
    if (content.charCodeAt(0) === 0xFEFF) {
        console.log('BOM detected!');
    } else {
        console.log('No BOM detected.');
    }

    // Basic regex check for structure
    const urlMatches = content.match(/<url>/g);
    console.log('Number of <url> tags:', urlMatches ? urlMatches.length : 0);

    const locMatches = content.match(/<loc>https:\/\/kafotv\.github\.io\/.*?<\/loc>/g);
    console.log('Number of valid <loc> tags:', locMatches ? locMatches.length : 0);

} catch (err) {
    console.error('Error:', err);
}
