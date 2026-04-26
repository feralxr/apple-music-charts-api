# Apple Music Charts API v2.0

Clean, reliable API for fetching Apple Music chart data using LD+JSON extraction.

## What Changed from v1

**v1 Problem**: Tried to intercept Apple Music API calls, but they weren't being made in Puppeteer.

**v2 Solution**: Extract data from `<script type="application/ld+json">` tags that Apple Music embeds directly in the HTML. This is Schema.org structured data that contains all track information.

## How It Works

1. Load Apple Music playlist page with Puppeteer
2. Find `<script type="application/ld+json">` tag
3. Parse the JSON-LD MusicPlaylist schema
4. Extract track data (name, artist, album, duration, URL, etc.)
5. Transform to clean API format

## Installation

```bash
npm install
```

## Usage

Start the server:
```bash
npm start
```

Test the API:
```bash
npm test
```

## Endpoints

### Get available charts
```
GET http://localhost:3001/
```

### Get Top 100 USA
```
GET http://localhost:3001/usa_daily
```

### Get Top 100 Global
```
GET http://localhost:3001/global_daily
```

## Response Format

```json
{
  "chart_name": "Top 100 USA",
  "chart_url": "https://music.apple.com/...",
  "total_tracks": 100,
  "extraction_method": "LD+JSON (Schema.org MusicPlaylist)",
  "timestamp": "2026-02-02T15:30:00.000Z",
  "data": [
    {
      "position": 1,
      "name": "Song Name",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration_ms": 232000,
      "apple_music_url": "https://music.apple.com/us/song/...",
      "song_id": "1234567890",
      "artwork_url": "https://...",
      "explicit": false,
      "isrc": "USRC12345678"
    }
  ]
}
```

## Why LD+JSON?

LD+JSON (JSON-LD) is linked data format based on Schema.org standards. Apple Music embeds this data for:
- SEO optimization
- Rich search results
- Social media previews
- Web crawlers

It's server-side rendered and always present, making it perfect for reliable scraping.

## Advantages

✅ **Always available** - Embedded in HTML, no API timing issues
✅ **Fast** - No waiting for XHR/Fetch calls
✅ **Reliable** - Same extraction method every time
✅ **Complete data** - Includes all track metadata
✅ **SEO standard** - Apple won't remove it (breaks SEO)

## Files

- `server.js` - Main API server
- `test.js` - Test script
- `package.json` - Dependencies
- `.env` - Configuration

## Technical Notes

**Extraction Method**: Parses `<script type="application/ld+json">` tags looking for `@type: "MusicPlaylist"` with a `track` array.

**Data Transformation**: Converts Schema.org MusicRecording format to simplified API format with position, name, artist, etc.

**Duration Parsing**: Converts ISO 8601 duration format (PT3M52S) to milliseconds.

**Browser**: Uses Puppeteer with stealth plugin to avoid detection.