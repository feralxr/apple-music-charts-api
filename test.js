const http = require('http');

console.log('\n' + '='.repeat(60));
console.log('Testing Apple Music Charts API v2.0');
console.log('='.repeat(60) + '\n');

function testEndpoint(path, name) {
    return new Promise((resolve, reject) => {
        console.log(`Testing: ${name}`);
        console.log(`Endpoint: ${path}`);

        const startTime = Date.now();

        http.get(`http://localhost:3001${path}`, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const duration = Date.now() - startTime;

                try {
                    const parsed = JSON.parse(data);
                    console.log(`✅ Success in ${duration}ms`);

                    if (parsed.data) {
                        console.log(`   Tracks: ${parsed.data.length}`);
                        console.log(`   Method: ${parsed.extraction_method}`);

                        if (parsed.data.length > 0) {
                            const firstTrack = parsed.data[0];
                            console.log(`   First track: ${firstTrack.position}. ${firstTrack.artist} - ${firstTrack.name}`);
                        }
                    }

                    console.log('');
                    resolve(parsed);
                } catch (e) {
                    console.log(`❌ Failed to parse response: ${e.message}\n`);
                    reject(e);
                }
            });
        }).on('error', (e) => {
            console.log(`❌ Request failed: ${e.message}\n`);
            reject(e);
        });
    });
}

async function runTests() {
    try {
        // Test root endpoint
        await testEndpoint('/', 'Root endpoint');

        // Test USA Daily chart
        await testEndpoint('/usa_daily', 'Top 100 USA');

        // Test Global Daily chart  
        await testEndpoint('/global_daily', 'Top 100 Global');

        // await testEndpoint('/charts_songs', 'idk wtf this category is');
        console.log('='.repeat(60));
        console.log('All tests completed!');
        console.log('='.repeat(60) + '\n');

        process.exit(0);
    } catch (error) {
        console.error('Tests failed:', error);
        process.exit(1);
    }
}

// Wait a moment for server to be ready
setTimeout(runTests, 2000);