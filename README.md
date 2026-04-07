# Instagram Data Visualizer

A desktop app to explore your Instagram data export locally and privately. Take control of your data, which **never leaves your computer.**

A project by [Journalism Relay Project](https://journalismrelay.org).

## What it does

- **Complete overview** of your Instagram account: likes, comments, followers, following, posts, stories, saved items, and more
- **Activity over time**: charts showing likes, comments, posts, stories, followers, and saved posts per month
- **Connections analysis**: who doesn't follow you back, who you don't follow back, close friends, blocked, unfollowed
- **Ads & tracking exposure**: see the thousands of advertisers who have your data, targeting categories Instagram assigns you, and which apps share your activity with Meta
- **Stories & interactions**: your stories, plus polls, emoji sliders, quizzes, and questions you've answered
- **Everything links back to Instagram**: liked posts, comments, profiles — all clickable
- **Supports both JSON and HTML exports**: JSON gives full data; HTML gives a limited overview
- **Multi-folder support**: if Instagram split your export into multiple zip files, select them all at once

## Privacy

- All processing happens locally on your machine
- No data is uploaded, sent, or stored anywhere
- The app makes zero network requests (Chart.js is bundled locally)
- Processed data goes to a temp directory and is deleted when you close the app
- [Privacy Policy](https://journalismrelay.org/privacy-policy)

## Download

Go to the [Releases](https://github.com/journalismrelay/instagram-data-visualizer/releases) page and download the installer for your operating system:

- **macOS**: `.dmg` (Intel and Apple Silicon)
- **Windows**: `.exe` installer or portable `.exe`
- **Linux**: `.AppImage` or `.deb`

## How to get your Instagram data

1. Go to [accountscenter.instagram.com](https://accountscenter.instagram.com/)
2. Click **Your information and permissions**
3. Click **Export your information** → **Create export**
4. Select your **Instagram profile** → **Export to device**
5. Set: Information **All data** · Date range **All time** · Format **JSON** (preferred; HTML also works) · Media quality **Any**
6. Submit and wait — Instagram will notify you when ready (up to 48h)
7. Download the file and **unzip it**
8. Open the app and select the **unzipped folder**

If your export came as multiple zip files, unzip them all and select all folders at once.

## Running from source

```bash
# Install dependencies
npm install

# Run the app
npm start

# Run with DevTools open (for development)
npm run dev
```

Requires [Node.js](https://nodejs.org/) 18+.

## Building from source

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build:all
```

Built apps are output to the `build/` folder.

## Customizing the look

All colors are CSS custom properties in [`src/renderer/style.css`](src/renderer/style.css):

```css
:root {
  --bg: #fafafa;           /* Page background */
  --card: #fff;            /* Card backgrounds */
  --border: #dbdbdb;       /* Borders */
  --text: #262626;         /* Primary text */
  --text-muted: #8e8e8e;   /* Secondary text */
  --accent: #0095f6;       /* Links, buttons */
}
```

The landing screen has its own stylesheet at [`src/renderer/landing.css`](src/renderer/landing.css).

## Project structure

```
src/
├── main/                  # Electron main process (Node.js)
│   ├── main.js            # App window, IPC handlers, lifecycle
│   ├── preload.js         # Secure IPC bridge
│   ├── processor.js       # Instagram data parser (JSON + HTML)
│   └── protocol.js        # Local HTTP server for data + media
└── renderer/              # App UI (HTML/CSS/JS)
    ├── index.html         # Landing screen + dashboard
    ├── app.js             # Dashboard logic
    ├── style.css          # Dashboard styles
    ├── landing.css        # Landing screen styles
    └── vendor/
        └── chart.umd.min.js
```

## How it works

1. You select your Instagram export folder(s)
2. The app auto-detects the data (works if you select the parent folder too)
3. `processor.js` parses all JSON/HTML files and generates optimized data
4. A local HTTP server (`127.0.0.1`, random port) serves the data and media
5. The dashboard renders everything with vanilla JS + Chart.js
6. When you close the app, temp files are deleted and the server stops

## Under the hood

Built with [Electron](https://www.electronjs.org/) for cross-platform desktop support. The UI is vanilla HTML, CSS, and JavaScript — no frontend frameworks. Charts are rendered with [Chart.js](https://www.chartjs.org/). Instagram data is parsed by a Node.js processor that handles both JSON and HTML export formats, with support for paginated files, carousel posts, and multi-folder merging with deduplication. Media files (photos, videos) are served through a local-only HTTP server bound to `127.0.0.1` that starts when you load your data and stops when you close the app. Builds are packaged with [electron-builder](https://www.electron.build/).

## Contributing

Issues and pull requests are welcome.

## License

[MIT](LICENSE)

## Disclaimer

This product was made with the assistance of [Claude Code](https://claude.com/product/claude-code).
