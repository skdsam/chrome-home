# Chrome Home 🏠✨

![Main Preview](screenshots/main-preview.png)

**Chrome Home** replaces Chrome's new-tab page with a customisable homepage for search, saved websites, music, notes, tasks, and Pip, your interactive desktop companion.

## Recent changes

- **Pip quick-entry buttons:** choose **Add to-do** or **Add quick note**, type your text, and press Enter or the add button. Choose **Chat** to return to normal requests.
- **Natural addition commands:** Pip can add tasks, append quick notes, create shortcuts, and save links to My Sites. Missing website addresses prompt a follow-up; duplicate URLs are detected within each collection.
- **Spotify matching corrected:** artist names and playlist intent are preserved. Ambiguous names and playlists offer choices with creator information. Failed searches keep the current music instead of substituting an unrelated playlist.
- **Spotify favourites and personal playlists:** save selections by Spotify ID, search the signed-in playlist library, and open exact Spotify links or URIs. Older searches cannot overwrite newer selections.
- **Focus Mode removed:** its button, command-menu action, page-hiding styles, and Pip reactions have been removed. The clock, daily intention field, and 25-minute timer remain.

## Homepage at a glance

| Area | What you can do |
| --- | --- |
| Search | Search with Google, DuckDuckGo, Bing, Brave, or Ecosia. |
| Clock and daily intention | See the time and date, set a daily intention, and use the 25-minute timer. |
| Shortcuts | Add, edit, remove, and reorder website cards; add cards through Pip. |
| My Sites | Keep a separate collection of named links; add them through the panel or Pip. |
| Top Sites | Access frequently visited websites. |
| Spotify | Search artists, songs, albums, playlists, genres/moods, and personal playlists; save favourites and use the embedded player. |
| To-do list | Add tasks, mark them complete, and clear completed items. |
| Quick Notes | Keep multiple notes, edit and format them, and append text through Pip. |
| Sports | View football, American football, and basketball scores. |
| Tech News | Browse technology news feeds. |
| GitHub Repos | Browse repository information. |
| Blender Dev | View Blender development updates. |
| Movies | Browse movie information. |
| AI sidebar | Open configured AI services alongside the homepage. |
| Pip | Chat, manage widgets, save items, search bookmarks, and optionally use local AI or web lookup. |
| Settings | Adjust appearance, backgrounds, avatar behaviour, sidebar options, optional Chrome Sync, and data import/export. |

---

## 📸 Screenshots

These existing screenshots may show an earlier layout; the feature descriptions reflect the current homepage.

| Widgets & Productivity | Image Background Mode |
|---|---|
| ![Widgets](screenshots/widgets-preview.png) | ![Background Mode](screenshots/dark-mode-preview.png) |

---

## 🌟 Visual Excellence

*   **Glassmorphism Design:** A sleek, semi-transparent UI that feels light and modern.
*   **Interactive Cursor Trail:** A smooth, responsive "mouse tail" effect that follows your cursor.
*   **Dynamic Backgrounds:** Choose between:
    *   **Weather-Driven:** The background changes colors and adds effects (Rain, Snow, Clouds) based on your real-time local weather.
    *   **Unsplash Integration:** High-quality photography that rotates on a customizable timer.
    *   **Interactive WebGL Gradients:** Smooth, pulsing patterns with a high-performance interactive shader. Includes tools to view color swatches and export palettes to JSON, CSV, or CSS.
*   **Premium Typography:** Utilizing *Outfit* and *Inter* fonts for a professional look.

## 🛠️ Productivity Suite

*   **Smart Shortcuts Grid:** Manage your most-visited sites with a beautiful, hover-animated icon grid. Supports **Drag-and-Drop Reordering** for a fully custom layout.
*   **Self-Managed "My Sites":** A dedicated panel for your favorite links with integrated reordering support.
*   **Integrated AI Sidebar:** Instant access to your favorite AI tools like Gemini, ChatGPT, Claude, and Perplexity without leaving your tab.
*   **Customizable Widgets:**
    *   🎵 **Spotify Player:** Control your music directly from the home page.
    *   🏀 **Live Sports Scores:** Track matches for **Football (Soccer)**, **American Football (NFL/NCAAF)**, and **Basketball (NBA/NCAAB)**.
    *   📰 **Tech News Feed:** Stay updated with the latest from Hacker News, Product Hunt, and DEV.to.
    *   📝 **Quick Notes & Todo:** Capture ideas and manage tasks with local persistence.

## ⚙️ Advanced Features

*   **Multi-Engine Search:** Toggle instantly between Google, DuckDuckGo, Bing, Brave, and Ecosia.
*   **Pip, the 3D Browser Companion:** A draggable, rocket-powered character that roams between page elements, sits on widgets, juggles, dances, scans shortcuts, retrieves off-screen objects, reacts to weather, and occasionally shares cached quotes, safe jokes, headlines, or sports updates.
*   **Chrome Sync Support:** Your shortcuts and settings follow you to any computer where you're logged into Chrome.
*   **Notification Center:** A unified place for extension updates and system alerts.
*   **Data Portability:** Export your entire configuration to a JSON file or import a backup in seconds.

## 🔒 Privacy First

*   **Local Processing:** Your browsing history and "Top Sites" are processed entirely on your machine. We never see your data.
*   **Minimal Permissions:** We only ask for what is necessary to make the features work (e.g., Geolocation for weather).
*   **Local Extension Scripts:** The extension uses Manifest V3 and loads its own scripts from the project.
*   **Network Features:** Web lookup, Spotify, online widgets, image services, and AI sidebar services contact their respective providers. Direct task/note/site additions do not require an AI service.

---

## 🚀 Installation (Developer Mode)

1. Clone this repository: `git clone https://github.com/skdsam/chrome-home.git`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select this project folder.

After applying updates, click **Reload** on Chrome Home in `chrome://extensions/`, then open a fresh new tab. Restart the Spotify helper if its code changed.

---
*Created with ❤️ for a better browsing experience.*


### Spotify search

Start `start-spotify.bat` (or `npm run spotify`), then open the Spotify widget and connect your account. A Client ID alone requires Spotify login; a Client ID and Secret can search the public catalogue without user login. The helper keeps login tokens in memory. After restarting it, reconnect if you use a Client ID alone.

Search by name or paste a full `https://open.spotify.com/...` link or `spotify:...` URI. Use the result-type selector to narrow searches to artists, songs, albums or playlists. Pip uses the same search: for example, `play Beach House`, `play Queen playlist`, `play Hello by Adele`, or `play my playlist Summer`. Artist names and playlist intent are preserved.

Exact, unambiguous artist/song/album matches load the player. Ambiguous matches and playlists show choices with their creator and available artwork. Genre searches offer live playlist suggestions. Failed searches keep the current music and display the reason; they never substitute a default playlist. Full links and favourites bypass name matching. **Save favourite** remembers the selected Spotify ID (up to 20 favourites), and **Show other matches** lets you choose another result. Loading a selection does not start playback: press play in the Spotify embed.

**My playlists** searches all pages of the signed-in user's owned/followed playlists. Existing users should reconnect to grant playlist access. Public searches default to the GB market; set `SPOTIFY_MARKET` to another two-letter country code before starting the helper if needed. Spotify's account country takes precedence for user tokens. [Spotify Search API](https://developer.spotify.com/documentation/web-api/reference/search).

Run the matching, request-ordering, auth and helper regression tests with `node --test tests/spotify.test.js tests/spotify-server.test.js`. Live searches additionally require a configured helper and Spotify access.

### Ask Pip: quick buttons and commands

Click Pip to open the chat alongside the homepage. The buttons above the input let you choose how to use your text:

| Button | How it works |
| --- | --- |
| **Chat** | Ask questions or enter widget commands. |
| **Add to-do** | Type only the task, such as `buy milk`, then press Enter or **Add task**. |
| **Add quick note** | Type only the note, such as `Meeting at 3pm`, then press Enter or **Add note**. |

The selected addition mode stays active for repeated entries. Text is saved literally: `play Queen` in **Add to-do** creates that task. No command wording or Local AI is needed. Failed quick-entry saves restore your text for retry. Select **Chat** for normal requests; clicking an example prompt or closing and reopening Pip also returns to Chat.

Pip can save items directly, with or without Local AI enabled:

- `add buy milk` or `add buy milk to my todo list`
- `add quick note Meeting at 3pm` or `add Meeting at 3pm to quick notes`
- `add shortcut GitHub https://github.com`
- `add Example https://example.com to my sites`

Tasks and notes open their widgets; notes append to the active note. Website commands accept full HTTP(S) URLs or domains and avoid duplicate URLs within each collection. If you give a site name without its URL, Pip asks for the address and accepts it in your next message. Additions are saved before Pip confirms success, and remain available after reloading.

Other Chat commands include `open my tasks`, `close sports`, `minimize notes`, `clear completed tasks`, `tidy screen`, `find my design bookmarks`, and `help me plan today`.

### Optional local AI and web lookup

Enable **Local AI · Gemini Nano**, then submit a question. Chrome checks device support and may download its on-device model on the first request; progress appears in Ask Pip. No API key or separate model server is needed for local AI. Direct widget additions, bookmark search, and basic planning remain usable without it.

**Web lookup · DuckDuckGo & Wikipedia** can search those services and show sources. Widget commands and quick-entry additions go directly to the widget handlers.

Pip sends questions and the current daily intention to Chrome's local Prompt API. Bookmark searches run directly against Chrome bookmarks. Direct widget commands use dedicated handlers; generated AI text does not execute actions. Up to three recent AI exchanges are kept in memory for follow-up questions and cleared when the dialog closes or Local AI changes. Model sessions are released after replies; Stop, closing the dialog, or leaving the page cancels active AI work. The local AI preference is saved on this device.

Requirements and model availability are managed by Chrome: https://developer.chrome.com/docs/ai/get-started . Unsupported browsers and devices do not download a model through Pip. To verify on a supported Chrome installation, open Ask Pip, enable Local AI, submit a question, check download/thinking status and a local reply, then test Stop and closing during a request.


Pip sits beside the non-modal Ask Pip card (above it on narrow screens). Gemini Nano can select a wave, nod, dance or curious pose; thinking has its own animation. When Local AI and occasional comments are enabled, Pip can generate a short comment roughly every 4–7 minutes while idle, using the daily intention as context. Autonomous comments only use an already available model and never initiate a download. They pause while chatting or the page is hidden. Turn comments off in Ask Pip.

The top-right Pip button waves goodbye and sends Pip offscreen before saving the disabled preference. Click again to bring him back. Reduced motion uses a short stationary goodbye instead of flight.

## Verification

Run from the project folder:

```sh
npm run check
npm test
```

Checks cover syntax, existing homepage/Pip behaviour, Spotify matching and request ordering, helper authentication and pagination, and Pip's addition commands and save handling. Browser checks have also exercised the quick-entry buttons, task/note/site additions, URL follow-ups, duplicate prevention, failed saves, and persistence after reload.

Live Spotify catalogue results additionally require a configured helper and an authenticated session or valid application credentials. Local AI availability and Spotify playback depend on the browser and service setup.
