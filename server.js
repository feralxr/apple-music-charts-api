require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3001;

// Chart endpoints configuration
const CHART_ENDPOINTS = {
    'usa_daily': {
        url: 'https://music.apple.com/us/playlist/top-100-usa/pl.606afcbb70264d2eb2b51d8dbcfa6a12',
        name: 'Top 100 USA',
        type: 'playlist'
    },
    'global_daily': {
        url: 'https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31',
        name: 'Top 100 Global',
        type: 'playlist'
    }
};

let browser;

async function initBrowser() {
    if (!browser || !browser.isConnected()) {
        console.log('[INIT] Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browser;
}

// Helper function to transform track data
function transformTrack(track, index, htmlInfo = {}) {
    const urlMatch = track.url?.match(/\/song\/[^\/]+\/(\d+)/) || track['@id']?.match(/\/song\/[^\/]+\/(\d+)/);
    const songId = urlMatch ? urlMatch[1] : null;

    let durationSeconds = 0;
    if (track.duration) {
        const durationMatch = track.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (durationMatch) {
            const hours = parseInt(durationMatch[1] || 0);
            const minutes = parseInt(durationMatch[2] || 0);
            const seconds = parseInt(durationMatch[3] || 0);
            durationSeconds = hours * 3600 + minutes * 60 + seconds;
        }
    }

    let artist = htmlInfo.artist || 'Unknown Artist';
    if (!htmlInfo.artist && track.byArtist) {
        if (Array.isArray(track.byArtist)) {
            artist = track.byArtist.map(a => (typeof a === 'string' ? a : a.name || a['@id'] || 'Unknown')).join(', ');
        } else if (typeof track.byArtist === 'object') {
            artist = track.byArtist.name || track.byArtist['@id'] || 'Unknown Artist';
        } else if (typeof track.byArtist === 'string') {
            artist = track.byArtist;
        }

        if (artist.startsWith('http')) {
            const artistMatch = artist.match(/\/artist\/([^\/]+)\//);
            if (artistMatch) artist = decodeURIComponent(artistMatch[1].replace(/-/g, ' '));
        }
    }

    let album = htmlInfo.album || 'Unknown Album';
    if (!htmlInfo.album && track.inAlbum) {
        album = typeof track.inAlbum === 'object' ? track.inAlbum.name : track.inAlbum;
    }

    const artworkUrl = track.audio?.thumbnailUrl || track.image || track.inAlbum?.image || null;

    return {
        position: index + 1,
        name: track.name,
        artist: artist,
        album: album,
        duration_ms: durationSeconds * 1000,
        apple_music_url: track.url || track['@id'],
        song_id: songId,
        artwork_url: artworkUrl,
        explicit: track.isFamilyFriendly === false,
        isrc: track.isrcCode || null
    };
}

async function fetchAppleMusicChart(targetUrl, chartName) {
    const browserInstance = await initBrowser();
    const page = await browserInstance.newPage();

    let chartData = [];
    let extractionMethod = 'UNKNOWN';

    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`[LOADING] ${chartName}...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log(`[EXTRACTING] LD+JSON data...`);

        const ldJsonData = await page.evaluate(() => {
            const ldJsonScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const script of ldJsonScripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data['@type'] === 'MusicPlaylist' && data.track && Array.isArray(data.track)) {
                        return { success: true, type: 'playlist', playlist: data };
                    }
                    if (data['@type'] === 'ItemList' && data.itemListElement && Array.isArray(data.itemListElement)) {
                        return { success: true, type: 'itemlist', items: data.itemListElement.map(item => item.item || item) };
                    }
                } catch (e) { continue; }
            }
            return { success: false };
        });

        if (ldJsonData.success) {
            console.log(`[EXTRACTING] Artist/album data from HTML...`);
            const htmlData = await page.evaluate(() => {
                const songs = [];
                const songRows = document.querySelectorAll('.songs-list-row, [data-testid="track-list-item"]');
                songRows.forEach((row) => {
                    const artistEl = row.querySelector('.songs-list__col--secondary, [data-testid="track-artist"], .song-artist, .track-artist');
                    const albumEl = row.querySelector('.songs-list__col--album, [data-testid="track-album"], .song-album, .track-album');
                    songs.push({
                        artist: artistEl?.textContent?.trim() || null,
                        album: albumEl?.textContent?.trim() || null
                    });
                });
                return songs;
            });

            extractionMethod = 'LD+JSON (track data) + HTML (artist/album)';
            const rawTracks = ldJsonData.type === 'playlist' ? ldJsonData.playlist.track : ldJsonData.items;

            chartData = rawTracks.map((track, index) => transformTrack(track, index, htmlData[index]));
        } else {
            console.log(`[FAILED] Could not find LD+JSON data`);
            extractionMethod = 'FAILED';
        }
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        throw error;
    } finally {
        await page.close();
    }

    return {
        chart_name: chartName,
        chart_url: targetUrl,
        total_tracks: chartData.length,
        extraction_method: extractionMethod,
        timestamp: new Date().toISOString(),
        data: chartData
    };
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Apple Music Charts API',
        version: '2.0.0',
        endpoints: Object.keys(CHART_ENDPOINTS).map(key => ({
            endpoint: `/${key}`,
            name: CHART_ENDPOINTS[key].name
        }))
    });
});

app.get('/:chartId', async (req, res) => {
    const chartId = req.params.chartId;
    const chartConfig = CHART_ENDPOINTS[chartId];

    if (!chartConfig) {
        return res.status(404).json({ error: 'Chart not found' });
    }

    const startTime = Date.now();
    try {
        const result = await fetchAppleMusicChart(chartConfig.url, chartConfig.name);
        console.log(`[SUCCESS] ${chartId} in ${Date.now() - startTime}ms`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch chart data', message: error.message });
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    if (browser) await browser.close();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});