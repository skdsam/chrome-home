/**
 * Chrome Home — User Configuration Template
 * Author: SkdSam
 *
 * HOW TO USE:
 *  1. Copy this file to: config.local.js  (it will NOT be committed to git)
 *  2. Fill in your own values
 *  3. Link it in newtab.html BEFORE newtab.js:
 *       <script src="config.local.js"></script>
 *
 * Every setting here is OPTIONAL. The extension works without any of this —
 * it just enables extra personalised features when values are provided.
 *
 * ⚠ NEVER edit this file with real values and commit it.
 *    This file (config.example.js) is safe to commit — it's just a template.
 *    Your real config goes in config.local.js which git ignores.
 */

window.ChromeHomeConfig = {

    /**
     * SPOTIFY — Spotify Developer Client ID
     * ----------------------------------------------------------
     * Get yours FREE at: https://developer.spotify.com/dashboard
     * 1. Create an app (any name)
     * 2. Add your redirect URI (shown in the Spotify widget → Connect panel)
     * 3. Copy the Client ID below
     * 4. Click "Connect" in the Spotify widget and paste it
     *
     * NOTE: Your Client ID is entered via the widget UI and stored only in
     * chrome.storage.local (your browser). It is NEVER saved to any file.
     * This field is an optional convenience pre-fill only.
     */
    spotifyClientId: '', // e.g. 'abc123def456...'  — YOUR OWN from developer.spotify.com

    /**
     * WEATHER — Default location override
     * ----------------------------------------------------------
     * Leave blank to auto-detect via your browser's geolocation.
     * Set a city name if you want a fixed default.
     */
    defaultCity: '', // e.g. 'London'

    /**
     * GITHUB — Your GitHub username (for the GitHub shortcuts widget)
     */
    githubUsername: '', // e.g. 'SkdSam'

    /**
     * DISPLAY — Preferred name shown by Pip
     */
    displayName: '', // e.g. 'Sam'

};
