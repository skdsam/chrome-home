/* User-authored context shared by Settings and Ask Pip. */
(function () {
    'use strict';
    const key = 'pipProfile';
    // Bounded to fit a Chrome Sync item, including multibyte text.
    const limits = { name: 80, location: 120, occupation: 120, interests: 400, dislikes: 300, favorites: 400, about: 600 };
    const labels = { name: 'Name', location: 'Location', occupation: 'What you do', interests: 'Likes and interests', dislikes: 'Things to avoid', favorites: 'Favourite sites', about: 'About you' };

    function normalize(value) {
        return Object.fromEntries(Object.entries(limits).map(([field, limit]) => [field,
            typeof value?.[field] === 'string' ? value[field].trim().slice(0, limit) : '']));
    }
    function context(value) {
        const entries = Object.entries(normalize(value)).filter(([, text]) => text);
        return entries.length ? JSON.stringify(Object.fromEntries(entries)) : '';
    }
    async function load(storage = window.storageManager) {
        const data = await storage.get([key], { strict: true });
        return normalize(data[key]);
    }
    async function save(value, storage = window.storageManager) {
        const profile = normalize(value);
        await storage.set({ [key]: profile });
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pip-profile-changed'));
        return profile;
    }
    function reply(action, value) {
        const profile = normalize(value);
        const guide = 'You can add or edit this in Settings > About me.';
        const fields = { name: 'name', interests: 'interests', dislikes: 'dislikes', location: 'location', occupation: 'occupation', favorites: 'favorites' };
        if (fields[action]) {
            const field = fields[action];
            return profile[field] ? `${labels[field]}: ${profile[field]}` : `You haven't saved your ${labels[field].toLowerCase()} yet. ${guide}`;
        }
        const details = Object.entries(profile).filter(([, text]) => text).map(([field, text]) => `${labels[field]}: ${text}`);
        return details.length ? `Here's what you've shared with me:\n${details.join('\n')}` : `I don't know about you yet. ${guide}`;
    }

    // An offline starting point; local AI can also use the full saved profile.
    const sites = [
        [/\b(blender|3d|modelling|modeling|animation|poly\s*haven)\b/i, 'Blender Artists', 'https://blenderartists.org/', 'A community for sharing Blender work and learning from other artists.'],
        [/\b(blender|3d|textures?|modelling|modeling|animation)\b/i, 'Poly Haven', 'https://polyhaven.com/', 'Textures, models and lighting assets for 3D projects.'],
        [/\b(coding|programming|web|javascript|github|software|development|freecodecamp)\b/i, 'MDN Web Docs', 'https://developer.mozilla.org/', 'Guides and references for building things on the web.'],
        [/\b(coding|programming|github|software|development|python|mdn)\b/i, 'freeCodeCamp', 'https://www.freecodecamp.org/', 'Coding lessons and projects to learn at your own pace.'],
        [/\b(music|indie|bands?|spotify|songs?|bandcamp)\b/i, 'Bandcamp Daily', 'https://daily.bandcamp.com/', 'Artist stories and music discoveries across genres.'],
        [/\b(hiking|walking|outdoors?|nature|trails?|alltrails)\b/i, 'AllTrails', 'https://www.alltrails.com/', 'Explore walking and hiking routes.'],
        [/\b(art|design|illustration|photography|behance)\b/i, 'Behance', 'https://www.behance.net/', 'Creative projects and portfolios for inspiration.'],
        [/\b(science|space|astronomy|nasa)\b/i, 'NASA', 'https://science.nasa.gov/', 'Explore space, astronomy and science discoveries.'],
        [/\b(books?|reading|fiction|literature|gutenberg)\b/i, 'Project Gutenberg', 'https://www.gutenberg.org/', 'Browse a library of public-domain books.'],
        [/\b(cooking|baking|food|recipes?)\b/i, 'BBC Good Food', 'https://www.bbcgoodfood.com/', 'Recipes and cooking ideas to explore.'],
        [/\b(gaming|games?|itch)\b/i, 'itch.io', 'https://itch.io/', 'Discover independent games and their creators.'],
        [/\b(history|museums?|culture|travel)\b/i, 'Google Arts & Culture', 'https://artsandculture.google.com/', 'Explore museums, art and cultural stories.']
    ];
    function recommend(value) {
        const profile = normalize(value);
        const topics = `${profile.interests} ${profile.favorites}`.trim();
        if (!topics) return { text: 'Add some likes or favourite sites in Settings > About me so I can suggest places that fit you.', sources: [] };
        const favorites = profile.favorites.toLowerCase();
        const sources = sites.filter(([pattern, title, url]) => pattern.test(topics) && !pattern.test(profile.dislikes) &&
            !favorites.includes(new URL(url).hostname.replace(/^www\./, '')) && !favorites.includes(title.toLowerCase()))
            .slice(0, 4).map(([, title, url, snippet]) => ({ title, url, snippet }));
        return sources.length
            ? { text: 'Based on your saved likes and favourite sites, you might enjoy these:', sources }
            : { text: 'I have your preferences, but no matching built-in site suggestions yet. Turn on Local AI for tailored suggestions, or add more topics in Settings > About me.', sources: [] };
    }
    function searchQuery(value) {
        const interests = normalize(value).interests.replace(/\s+/g, ' ').trim();
        return interests ? `${interests.slice(0, 240)} websites resources` : '';
    }

    async function initForm() {
        const form = document.getElementById('pip-profile-form');
        if (!form) return;
        const fieldset = document.getElementById('pip-profile-fields');
        const status = document.getElementById('pip-profile-status');
        let dirty = false;
        let busy = false;
        const read = () => Object.fromEntries(Object.keys(limits).map(field => [field, form.elements.namedItem(field).value]));
        const fill = profile => Object.keys(limits).forEach(field => { form.elements.namedItem(field).value = profile[field]; });
        async function refresh() {
            if (dirty || busy) return;
            busy = true;
            fieldset.disabled = true;
            let loaded = false;
            try {
                const profile = await load();
                fill(profile);
                loaded = true;
                status.textContent = context(profile) ? 'Your saved profile is ready for Pip.' : 'Add a few details to get started.';
            } catch (_) {
                status.textContent = 'Could not load your profile. Reopen About me to try again.';
            } finally {
                busy = false;
                fieldset.disabled = !loaded;
            }
        }
        async function persist(value, cleared = false) {
            if (busy) return;
            busy = true;
            fieldset.disabled = true;
            status.textContent = 'Saving…';
            try {
                const profile = await save(value);
                fill(profile);
                dirty = false;
                status.textContent = cleared ? 'Profile cleared. Pip will no longer use these details.' : 'Profile saved. Pip can use these details now.';
            } catch (_) {
                dirty = true;
                status.textContent = 'Could not save your profile. Your changes are still here; please try again.';
            } finally {
                busy = false;
                fieldset.disabled = false;
            }
        }
        form.addEventListener('input', () => { dirty = true; status.textContent = 'Changes not saved yet.'; });
        form.addEventListener('submit', event => { event.preventDefault(); persist(read()); });
        document.getElementById('pip-profile-clear').addEventListener('click', () => persist({}, true));
        document.getElementById('settings-about').addEventListener('click', refresh);
        window.addEventListener('pip-profile-changed', refresh);
        await refresh();
    }

    const api = { normalize, context, load, save, reply, recommend, searchQuery };
    if (typeof module !== 'undefined') module.exports = api;
    else {
        window.PipProfile = api;
        chrome.storage.onChanged.addListener(changes => {
            if (changes[key] || changes.googleSyncEnabled) window.dispatchEvent(new CustomEvent('pip-profile-changed'));
        });
        document.addEventListener('DOMContentLoaded', initForm);
    }
}());
