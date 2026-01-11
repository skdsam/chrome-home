document.addEventListener('DOMContentLoaded', async () => {
    // --- Shortcuts Logic ---
    const shortcutsGrid = document.getElementById('shortcuts-grid');
    const addShortcutBtn = document.getElementById('add-shortcut-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const shortcutForm = document.getElementById('shortcut-form');
    const cancelModalBtn = document.getElementById('cancel-modal');
    const modalTitle = document.getElementById('modal-title');
    const notificationManager = new window.NotificationManager();
    const weatherManager = new window.WeatherManager();
    // Moved here to fix init error

    // CLEANUP: Remove deprecated Gemini state if present
    chrome.storage.local.remove(['geminiState']);

    // --- Settings & Data Logic ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModalOverlay = document.getElementById('settings-modal-overlay');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal');
    const recentSitesLimitInput = document.getElementById('recent-sites-limit');
    const exportDataBtn = document.getElementById('export-data-btn');
    const importDataBtn = document.getElementById('import-data-btn');
    const importFileInput = document.getElementById('import-file-input');

    // Default Limit Global
    window.recentSitesLimit = 5;

    // Load Limit
    chrome.storage.local.get(['recentSitesLimit'], (result) => {
        if (result.recentSitesLimit) {
            window.recentSitesLimit = parseInt(result.recentSitesLimit);
            recentSitesLimitInput.value = window.recentSitesLimit;
            renderTopSites(); // Re-render with loaded limit
        }
    });

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModalOverlay.classList.remove('hidden');
        });
    }

    if (closeSettingsModalBtn) {
        closeSettingsModalBtn.addEventListener('click', () => {
            settingsModalOverlay.classList.add('hidden');
        });
    }

    settingsModalOverlay.addEventListener('click', (e) => {
        if (e.target === settingsModalOverlay) {
            settingsModalOverlay.classList.add('hidden');
        }
    });

    // Recent Sites Limit Change
    recentSitesLimitInput.addEventListener('change', () => {
        let val = parseInt(recentSitesLimitInput.value);
        if (val < 1) val = 1;
        if (val > 50) val = 50; // Sane max
        window.recentSitesLimit = val;
        chrome.storage.local.set({
            recentSitesLimit: val
        });
        renderTopSites(); // Refresh list immediately
    });

    // Export Data
    exportDataBtn.addEventListener('click', () => {
        chrome.storage.local.get(null, (items) => {
            const dataStr = JSON.stringify(items, null, 2);
            const blob = new Blob([dataStr], {
                type: "application/json"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `newtab-settings-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    // Import Data
    importDataBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                // Validation could go here
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set(data, () => {
                        alert('Settings imported successfully! Reloading...');
                        location.reload();
                    });
                });
            } catch (err) {
                alert('Error parsing JSON file');
                console.error(err);
            }
        };
        reader.readAsText(file);
    });

    // Init Weather
    weatherManager.init();

    let editingId = null;

    // Load Shortcuts
    await renderShortcuts();

    // Event Listeners
    addShortcutBtn.addEventListener('click', () => {
        openModal();
    });

    cancelModalBtn.addEventListener('click', () => {
        closeModal();
    });

    shortcutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('shortcut-url').value;
        const name = document.getElementById('shortcut-name').value;

        if (editingId) {
            await updateShortcut(editingId, url, name);
            await notificationManager.add('Shortcut Updated', `Updated shortcut for ${name}`);
        } else {
            await addShortcut(url, name);
            await notificationManager.add('Shortcut Added', `Added shortcut for ${name}`);
        }

        closeModal();
        await renderShortcuts();
        await renderNotifications();
    });

    function openModal(shortcut = null) {
        modalOverlay.classList.remove('hidden');
        if (shortcut) {
            modalTitle.textContent = 'Edit Shortcut';
            document.getElementById('shortcut-url').value = shortcut.url;
            document.getElementById('shortcut-name').value = shortcut.title;
            editingId = shortcut.id;
        } else {
            modalTitle.textContent = 'Add Shortcut';
            shortcutForm.reset();
            editingId = null;
        }
    }

    function closeModal() {
        modalOverlay.classList.add('hidden');
        shortcutForm.reset();
        editingId = null;
    }

    // --- Search Logic ---
    const searchOptions = document.querySelectorAll('.search-options button');
    const searchForm = document.getElementById('search-form');
    const searchInput = searchForm.querySelector('input');
    let searchType = 'web';

    searchOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            searchOptions.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchType = btn.dataset.type;
            searchInput.placeholder = `Search Google ${btn.textContent}...`;
        });
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value;
        if (!query) return;

        let url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
        if (searchType === 'isch') {
            url += '&tbm=isch';
        } else if (searchType === 'vid') {
            url += '&tbm=vid';
        } else if (searchType === 'nws') {
            url += '&tbm=nws';
        }

        window.location.href = url;
    });

    // --- Voice Search Logic ---
    const voiceBtn = document.getElementById('voice-search-btn');
    if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            voiceBtn.classList.add('listening');
            searchInput.placeholder = "Listening...";
        };

        recognition.onend = () => {
            voiceBtn.classList.remove('listening');
            searchInput.placeholder = "Search Google...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            searchInput.value = transcript;
            // Auto-submit
            setTimeout(() => {
                searchForm.dispatchEvent(new Event('submit'));
            }, 500);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            voiceBtn.classList.remove('listening');
            searchInput.placeholder = "Error. Try again.";
        };

        voiceBtn.addEventListener('click', () => {
            recognition.start();
        });
    } else if (voiceBtn) {
        voiceBtn.style.display = 'none'; // Hide if not supported
    }

    // --- Notifications UI Logic ---
    const bell = document.getElementById('notification-bell');
    const panel = document.getElementById('notification-panel');
    const badge = document.getElementById('notification-badge');
    const clearBtn = document.getElementById('clear-notifications');

    // --- Top Sites Logic ---
    const topSitesBtn = document.getElementById('top-sites-btn');
    const topSitesPanel = document.getElementById('top-sites-panel');


    topSitesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(topSitesPanel);
        renderTopSites();
    });

    async function renderTopSites() {
        topSitesList.innerHTML = '';

        // Use History API to get "Last" visited sites (Recency) instead of "Top" (Frequency)
        chrome.history.search({
            text: '',
            maxResults: 100
        }, (historyItems) => {
            if (!historyItems || historyItems.length === 0) {
                topSitesList.innerHTML = '<div class="empty-state">No recent history</div>';
                return;
            }

            // Filter filters to get unique hostnames to avoid repetitive pages from same site
            const uniqueSites = [];
            const seenHosts = new Set();

            for (const item of historyItems) {
                try {
                    // Skip chrome:// URLs and empty titles
                    if (!item.url || item.url.startsWith('chrome') || !item.title) continue;

                    const url = new URL(item.url);
                    const hostname = url.hostname;

                    // Filter logic: Ensure unique hostname
                    if (!seenHosts.has(hostname)) {
                        seenHosts.add(hostname);
                        uniqueSites.push(item);
                    }
                    if (uniqueSites.length >= (window.recentSitesLimit || 5)) break;
                } catch (e) {
                    continue;
                }
            }

            if (uniqueSites.length === 0) {
                topSitesList.innerHTML = '<div class="empty-state">No recent sites found</div>';
                return;
            }

            uniqueSites.forEach(site => {
                const item = document.createElement('a');
                item.className = 'menu-list-item';
                item.href = site.url;
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.padding = '10px';
                item.style.textDecoration = 'none';
                item.style.color = '#fff';
                item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                item.style.gap = '10px';
                item.style.fontSize = '0.9rem';

                const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=32`;

                item.innerHTML = `
                    <img src="${iconUrl}" width="16" height="16" style="border-radius: 4px;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${site.title}</span>
                `;

                topSitesList.appendChild(item);
            });
        });
    }



    // --- My Sites Logic ---
    const mySitesBtn = document.getElementById('my-sites-btn');
    const mySitesPanel = document.getElementById('my-sites-panel');
    const mySitesList = document.getElementById('my-sites-list');
    const addMySiteBtn = document.getElementById('add-my-site-btn');

    mySitesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(mySitesPanel);
        renderMySites();
    });

    addMySiteBtn.addEventListener('click', async () => {
        const url = prompt('Enter website URL:');
        if (!url) return;
        const name = prompt('Enter website name:');
        if (!name) return;

        const mySites = await getMySites();
        mySites.push({
            id: Date.now(),
            url: url.startsWith('http') ? url : `https://${url}`,
            title: name
        });
        await chrome.storage.local.set({
            mySites
        });
        renderMySites();
    });

    async function getMySites() {
        const res = await chrome.storage.local.get('mySites');
        return res.mySites || [];
    }

    async function removeMySite(id) {
        let sites = await getMySites();
        sites = sites.filter(s => s.id !== id);
        await chrome.storage.local.set({
            mySites: sites
        });
        renderMySites();
    }

    async function renderMySites() {
        const sites = await getMySites();
        mySitesList.innerHTML = '';

        if (sites.length === 0) {
            mySitesList.innerHTML = '<div class="empty-state">No sites added yet</div>';
            return;
        }

        sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.padding = '10px';
            item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=32`;

            const linkDiv = document.createElement('div');
            linkDiv.style.display = 'flex';
            linkDiv.style.alignItems = 'center';
            linkDiv.style.gap = '10px';
            linkDiv.style.cursor = 'pointer';
            linkDiv.innerHTML = `
                <img src="${iconUrl}" width="16" height="16" style="border-radius: 4px;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${site.title}</span>
            `;
            linkDiv.onclick = () => window.location.href = site.url;

            const delBtn = document.createElement('button');
            delBtn.innerHTML = '×';
            delBtn.style.background = 'transparent';
            delBtn.style.border = 'none';
            delBtn.style.color = '#ff4081';
            delBtn.style.fontSize = '1.2rem';
            delBtn.style.cursor = 'pointer';
            delBtn.onclick = (e) => {
                e.preventDefault();
                removeMySite(site.id);
            };

            item.appendChild(linkDiv);
            item.appendChild(delBtn);
            mySitesList.appendChild(item);
        });
    }

    // --- User Menu Logic (Removed) ---
    // const profileBtn = document.getElementById('user-profile'); // REMOVED
    // const userMenu = document.getElementById('user-menu'); // REMOVED
    // const menuItems = document.querySelectorAll('.menu-list li[data-action]'); // REMOVED

    function togglePanel(targetPanel) {
        // Close others
        [panel, topSitesPanel, mySitesPanel].forEach(p => {
            if (p && p !== targetPanel) p.classList.add('hidden');
        });
        if (targetPanel) targetPanel.classList.toggle('hidden');
    }

    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(panel);
        if (!panel.classList.contains('hidden')) {
            badge.classList.add('hidden');
        }
    });

    // profileBtn listener REMOVED

    clearBtn.addEventListener('click', async () => {
        await notificationManager.clearAll();
        await renderNotifications();
    });

    await renderNotifications();
    // await updateAvatar(); REMOVED

    // updateAvatar function REMOVED
    // Menu Actions listener REMOVED

    document.addEventListener('click', (e) => {
        if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
            panel.classList.add('hidden');
        }
        // userMenu check REMOVED
        if (topSitesPanel && !topSitesPanel.contains(e.target) && topSitesBtn && !topSitesBtn.contains(e.target)) {
            topSitesPanel.classList.add('hidden');
        }
        if (mySitesPanel && !mySitesPanel.contains(e.target) && mySitesBtn && !mySitesBtn.contains(e.target)) {
            mySitesPanel.classList.add('hidden');
        }
    });

    // --- Weather Manual Override ---
    document.getElementById('weather-display').addEventListener('click', () => {
        const currentLoc = document.getElementById('weather-temp').textContent.split(',')[0];
        const newCity = prompt('Enter your city manually (or leave empty to use Auto-Location):', currentLoc.includes('°') ? '' : currentLoc);

        if (newCity !== null) { // If not cancelled
            weatherManager.setManualLocation(newCity.trim());
        }
    });

    // --- Helper Functions ---
    async function getShortcuts() {
        const result = await chrome.storage.local.get('shortcuts');
        return result.shortcuts || [];
    }

    async function addShortcut(url, title) {
        const shortcuts = await getShortcuts();
        const newShortcut = {
            id: Date.now(),
            url,
            title,
            icon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`
        };
        shortcuts.push(newShortcut);
        await chrome.storage.local.set({
            shortcuts
        });
    }

    async function updateShortcut(id, url, title) {
        const shortcuts = await getShortcuts();
        const index = shortcuts.findIndex(s => s.id === id);
        if (index !== -1) {
            shortcuts[index].url = url;
            shortcuts[index].title = title;
            shortcuts[index].icon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
            await chrome.storage.local.set({
                shortcuts
            });
        }
    }

    async function removeShortcut(id) {
        let shortcuts = await getShortcuts();
        const removed = shortcuts.find(s => s.id === id);
        shortcuts = shortcuts.filter(s => s.id !== id);
        await chrome.storage.local.set({
            shortcuts
        });

        if (removed) {
            await notificationManager.add('Shortcut Removed', `Removed shortcut for ${removed.title}`);
            await renderNotifications();
        }
        await renderShortcuts();
    }

    async function renderShortcuts() {
        const shortcuts = await getShortcuts();
        shortcutsGrid.innerHTML = '';
        shortcuts.forEach(shortcut => {
            const card = document.createElement('div'); // Changed to div so we don't accidentally navigate when clicking buttons
            card.className = 'shortcut-card';

            // To make the whole card clickable except buttons, we add a clear overlay or just handle click
            card.innerHTML = `
                <div class="actions">
                    <button class="edit-btn" data-id="${shortcut.id}">✎</button>
                    <button class="delete-btn" data-id="${shortcut.id}">×</button>
                </div>
                <img src="${shortcut.icon}" alt="${shortcut.title}" class="shortcut-icon" onerror="this.src='icon-placeholder.png'">
                <div class="shortcut-title">${shortcut.title}</div>
            `;

            // Navigation handler
            card.addEventListener('click', (e) => {
                // If not clicking a button
                if (!e.target.closest('button')) {
                    window.location.href = shortcut.url;
                }
            });

            // Handle edit
            const editBtn = card.querySelector('.edit-btn');
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openModal(shortcut);
            });

            // Handle delete
            const deleteBtn = card.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Delete this shortcut?')) {
                    removeShortcut(shortcut.id);
                }
            });

            shortcutsGrid.appendChild(card);
        });
    }

    async function renderNotifications() {
        const notifications = await notificationManager.getAll();
        const list = document.getElementById('notification-list');
        list.innerHTML = '';

        if (notifications.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:20px; text-align:center; color:#666;">No new notifications</div>';
            badge.classList.add('hidden');
            return;
        }

        badge.classList.remove('hidden');

        notifications.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notification-item';
            const time = new Date(n.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
            item.innerHTML = `
                <div style="font-weight: 500; color: #fff;">${n.title}</div>
                <div style="font-size: 0.8rem; margin-top: 2px;">${n.message}</div>
                <div style="font-size: 0.7rem; color: #666; margin-top: 5px;">${time}</div>
            `;
            list.appendChild(item);
        });
    }

    // --- Widgets Menu Logic ---
    const widgetsBtn = document.getElementById('widgets-btn');
    const widgetsMenu = document.getElementById('widgets-menu');

    if (widgetsBtn) {
        widgetsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            widgetsMenu.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!widgetsBtn.contains(e.target) && !widgetsMenu.contains(e.target)) {
                widgetsMenu.classList.add('hidden');
            }
        });
    }

    // --- Spotify Widget Logic ---
    const spotifyBtn = document.getElementById('spotify-btn');
    const spotifyWidget = document.getElementById('spotify-widget');
    const spotifyHeader = document.getElementById('spotify-header');
    const spotifyMinimizeBtn = document.getElementById('spotify-minimize');
    const spotifyEditBtn = document.getElementById('spotify-edit');

    // --- Z-Index Management ---
    let maxZIndex = 100;

    function bringToFront(element) {
        maxZIndex++;
        element.style.zIndex = maxZIndex;
    }

    // State
    let spotifyState = {
        isOpen: false,
        isMinimized: false,
        zIndex: 100,
        position: {
            top: '100px',
            left: '20px'
        }, // Default
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator' // Default Playlist
    };

    // Load State
    chrome.storage.local.get(['spotifyState'], (result) => {
        if (result.spotifyState) {
            spotifyState = {
                ...spotifyState,
                ...result.spotifyState
            };
            applySpotifyState();
        }
    });

    function saveSpotifyState() {
        chrome.storage.local.set({
            spotifyState
        });
    }

    function applySpotifyState() {
        // Visibility
        if (spotifyState.isOpen) {
            spotifyWidget.classList.remove('hidden');
            spotifyBtn.classList.add('active'); // Highlight active
        } else {
            spotifyWidget.classList.add('hidden');
            spotifyBtn.classList.remove('active');
        }

        // Minimized
        if (spotifyState.isMinimized) {
            spotifyWidget.classList.add('minimized');
            spotifyMinimizeBtn.textContent = '+';
        } else {
            spotifyWidget.classList.remove('minimized');
            spotifyMinimizeBtn.textContent = '-';
        }

        // Position
        // Ensure it's within viewport (basic check)
        let top = spotifyState.position.top;
        let left = spotifyState.position.left;

        spotifyWidget.style.top = top;
        spotifyWidget.style.left = left;
        // Reset bottom/right to auto since we use top/left
        spotifyWidget.style.bottom = 'auto';
        spotifyWidget.style.right = 'auto';

        // Z-Index
        if (spotifyState.zIndex) {
            spotifyWidget.style.zIndex = spotifyState.zIndex;
            if (spotifyState.zIndex > maxZIndex) maxZIndex = spotifyState.zIndex;
        }

        // Embed URL
        const iframe = spotifyWidget.querySelector('iframe');
        if (iframe && iframe.src !== spotifyState.embedUrl) {
            iframe.src = spotifyState.embedUrl;
        }
    }

    // Toggle Visibility
    spotifyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden'); // Close Menu

        // If closed, open it. If open, just bring to front (don't close it).
        // Actually, let's keep toggle behavior ONLY if it was already front-most?
        // No, simple logic: Click -> Open/Bring to Front.
        // If user wants to close, they use the close button (menu doesn't toggle OFF usually).
        // BUT, existing logic was toggle. Let's make it smarter.

        if (!spotifyState.isOpen) {
            spotifyState.isOpen = true;
        } else {
            // It IS open. 
            // If I clicked the menu, maybe I want to focus it. 
            // I'll only close it if I explicitly toggle. 
            // Let's change to: Always Open + Focus.
            // If user wants to close, they use the widgets menu again? Or the widget's own close button?
            // The widget doesn't have a close button, only minimize! 
            // The toggle IS the close button effectively.

            // Revert to toggle logic:
            // "Clicking apps is not showing them" -> implies they might be open but hidden.
            spotifyState.isOpen = !spotifyState.isOpen;
        }

        if (spotifyState.isOpen) {
            bringToFront(spotifyWidget);
            spotifyState.zIndex = maxZIndex;
        }
        applySpotifyState();
        saveSpotifyState();
    });

    // Toggle Minimize
    spotifyMinimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        spotifyState.isMinimized = !spotifyState.isMinimized;
        bringToFront(spotifyWidget);
        spotifyState.zIndex = maxZIndex;
        applySpotifyState();
        saveSpotifyState();
    });

    // Edit Playlist
    spotifyEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        bringToFront(spotifyWidget);
        spotifyState.zIndex = maxZIndex;

        const current = spotifyState.embedUrl;
        const newUrl = prompt('Enter Spotify Playlist/Album URL:', current);

        if (newUrl && newUrl !== current) {
            let embedUrl = newUrl;
            try {
                const urlObj = new URL(newUrl);
                if (urlObj.hostname.includes('spotify.com') && !urlObj.pathname.includes('/embed')) {
                    embedUrl = `https://${urlObj.hostname}/embed${urlObj.pathname}${urlObj.search}`;
                }
            } catch (err) {
                console.error("Invalid URL", err);
            }

            spotifyState.embedUrl = embedUrl;
            applySpotifyState();
            saveSpotifyState();
        }
    });

    // Drag Logic
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    spotifyHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return; // Ignore buttons
        if (e.target !== spotifyHeader && e.target !== spotifyHeader.querySelector('.spotify-title')) return; // Allow title or header background

        isDragging = true;

        // Calculate offset from mouse to top-left of widget
        const rect = spotifyWidget.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        spotifyHeader.style.cursor = 'grabbing';
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;

        // Boundary checks (keep fully within viewport if possible, or at least visible)
        const maxLeft = window.innerWidth - spotifyWidget.offsetWidth;
        const maxTop = window.innerHeight - spotifyHeader.offsetHeight; // Allow content to go off, but header visible

        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 20) newTop = window.innerHeight - 20;

        spotifyWidget.style.left = `${newLeft}px`;
        spotifyWidget.style.top = `${newTop}px`;
        spotifyWidget.style.bottom = 'auto'; // clear bottom
    }

    function onMouseUp() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            spotifyHeader.style.cursor = 'move';

            // Save new position
            spotifyState.position.top = spotifyWidget.style.top;
            spotifyState.position.left = spotifyWidget.style.left;

            bringToFront(spotifyWidget);
            spotifyState.zIndex = maxZIndex;

            saveSpotifyState();
        }
    }

    // --- Football Widget Logic ---
    const footballBtn = document.getElementById('football-btn');
    const footballWidget = document.getElementById('football-widget');
    const footballHeader = document.getElementById('football-header');
    const footballMinimizeBtn = document.getElementById('football-minimize');
    const footballLeagueSelect = document.getElementById('football-league-select');


    const footballLoading = document.getElementById('football-loading');
    const footballStandings = document.getElementById('football-standings'); // Fix RefError
    const footballViewToggle = document.getElementById('football-view-toggle'); // Fix RefError

    // State
    let footballState = {
        isOpen: false,
        isMinimized: false,
        position: {
            top: '100px',
            left: '340px'
        }, // Default offset from spotify
        selectedLeague: 'eng.1', // Default EPL
        view: 'matches'
    };

    let footballInterval = null;

    // Load State
    chrome.storage.local.get(['footballState'], (result) => {
        if (result.footballState) {
            footballState = {
                ...footballState,
                ...result.footballState
            };
            applyFootballState();
        }
    });

    function saveFootballState() {
        chrome.storage.local.set({
            footballState
        });
    }

    function applyFootballState() {
        // Visibility
        if (footballState.isOpen) {
            footballWidget.classList.remove('hidden');
            footballBtn.classList.add('active');
            startFootballUpdates();
        } else {
            footballWidget.classList.add('hidden');
            footballBtn.classList.remove('active');
            stopFootballUpdates();
        }

        // Minimized
        if (footballState.isMinimized) {
            footballWidget.classList.add('minimized');
            footballMinimizeBtn.textContent = '+';
        } else {
            footballWidget.classList.remove('minimized');
            footballMinimizeBtn.textContent = '-';
        }

        // Position
        let top = footballState.position.top;
        let left = footballState.position.left;
        footballWidget.style.top = top;
        footballWidget.style.left = left;
        footballWidget.style.bottom = 'auto';
        footballWidget.style.right = 'auto';

        // Z-Index
        if (footballState.zIndex) {
            footballWidget.style.zIndex = footballState.zIndex;
            if (footballState.zIndex > maxZIndex) maxZIndex = footballState.zIndex;
        }

        // League Select
        if (footballLeagueSelect.value !== footballState.selectedLeague) {
            footballLeagueSelect.value = footballState.selectedLeague;
        }

        // View (Matches vs Table)
        if (footballState.view === 'table') {
            footballMatches.classList.add('hidden');
            footballStandings.classList.remove('hidden');
            // Update Icon to "List" (to go back)
            footballViewToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';
            footballViewToggle.title = "Show Matches";
        } else {
            footballMatches.classList.remove('hidden');
            footballStandings.classList.add('hidden');
            // Update Icon to "Table" (to go to table)
            footballViewToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
            footballViewToggle.title = "Show Standings";
        }

        // Fetch Data if needed (generic refresh)
        refreshFootballData();
    }

    function refreshFootballData() {
        if (!footballState.isOpen) return;

        if (footballState.view === 'table') {
            fetchStandings(footballState.selectedLeague);
        } else {
            fetchScores(footballState.selectedLeague);
        }
    }

    // Toggle Visibility
    footballBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden'); // Close Menu

        footballState.isOpen = !footballState.isOpen;
        if (footballState.isOpen) {
            bringToFront(footballWidget);
            footballState.zIndex = maxZIndex;
        }
        applyFootballState();
        saveFootballState();
    });

    // Toggle Minimize
    footballMinimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        footballState.isMinimized = !footballState.isMinimized;
        bringToFront(footballWidget);
        footballState.zIndex = maxZIndex;
        applyFootballState();
        saveFootballState();
    });

    // League Change
    footballLeagueSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        bringToFront(footballWidget);
        footballState.zIndex = maxZIndex;

        footballState.selectedLeague = e.target.value;
        saveFootballState();
        refreshFootballData(); // Generic refresh
    });

    // View Toggle Change
    if (footballViewToggle) {
        footballViewToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            bringToFront(footballWidget);
            footballState.view = footballState.view === 'scores' ? 'table' : 'scores';
            applyFootballState(); // Update UI
            saveFootballState();
            refreshFootballData(); // Fetch new data
        });
    }

    // API Key Function
    async function fetchScores(leagueCode) {
        if (!footballState.isOpen) return;

        footballLoading.style.display = 'block';
        footballMatches.style.display = 'none'; // Hide old data while loading? Maybe just keep it visible.
        // Better: Keep old data visible until new data works, unless it's first load.
        // Let's just show loading if matches is empty.
        if (footballMatches.children.length === 0) {
            footballLoading.style.display = 'block';
        }

        try {
            const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/scoreboard`);
            const data = await response.json();

            renderMatches(data);
            footballLoading.style.display = 'none';
            footballMatches.style.display = 'block';

        } catch (error) {
            console.error('Error fetching scores:', error);
            footballLoading.textContent = 'Error loading data';
        }
    }

    function renderMatches(data) {
        footballMatches.innerHTML = '';

        if (!data.events || data.events.length === 0) {
            footballMatches.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">No matches today</div>';
            return;
        }

        data.events.forEach(event => {
            const competition = event.competitions[0];
            const home = competition.competitors.find(c => c.homeAway === 'home');
            const away = competition.competitors.find(c => c.homeAway === 'away');
            const status = event.status.type.shortDetail; // "FT", "12'", "13:00"
            const isLive = event.status.type.state === 'in';

            // Time logic
            let timeDisplay = status;
            if (event.status.type.state === 'pre') {
                // Format start time
                const date = new Date(event.date);
                timeDisplay = date.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }

            const item = document.createElement('div');
            item.className = 'match-item';

            item.innerHTML = `
                <div class="match-header">
                    <span class="match-status ${isLive ? 'live' : ''}">${timeDisplay}</span>
                    <span>${event.season.year || ''}</span> 
                </div>
                <div class="match-teams">
                    <div class="team-row">
                        <div class="team-info">
                            <img src="${home.team.logo}" class="team-logo" onerror="this.src='icon-placeholder.png'">
                            <span>${home.team.shortDisplayName}</span>
                        </div>
                        <span class="team-score">${home.score}</span>
                    </div>
                    <div class="team-row">
                        <div class="team-info">
                            <img src="${away.team.logo}" class="team-logo" onerror="this.src='icon-placeholder.png'">
                            <span>${away.team.shortDisplayName}</span>
                        </div>
                        <span class="team-score">${away.score}</span>
                    </div>
                </div>
            `;
            footballMatches.appendChild(item);
        });
    }

    async function fetchStandings(leagueCode) {
        if (!footballState.isOpen || footballState.view !== 'table') return;

        footballLoading.style.display = 'block';
        footballStandings.innerHTML = '';

        try {
            // Standings API
            const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/standings`);
            const data = await response.json();
            renderStandings(data);
            footballLoading.style.display = 'none';
        } catch (error) {
            console.error('Error fetching standings:', error);
            footballLoading.textContent = 'Error loading table';
        }
    }

    function renderStandings(data) {
        footballStandings.innerHTML = '';
        if (!data || !data.children || !data.children[0] || !data.children[0].standings) {
            footballStandings.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No standings available</div>';
            return;
        }

        const entries = data.children[0].standings.entries;
        const table = document.createElement('table');
        table.className = 'standings-table';

        // Header
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width:25px; text-align:center;">#</th>
                    <th>Team</th>
                    <th style="width:30px; text-align:center;">Pl</th>
                    <th style="width:30px; text-align:right;">Pts</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        entries.forEach((entry, index) => {
            const team = entry.team;
            const stats = entry.stats;
            // Key stats: points (name: "points"), gamesPlayed (name: "gamesPlayed")
            const pointsStat = stats.find(s => s.name === 'points');
            const playedStat = stats.find(s => s.name === 'gamesPlayed');
            const rank = index + 1; // Or entry.stats...rank? entry usually sorted.

            const row = document.createElement('tr');

            // Highlight Logic (Premier League approx)
            if (rank <= 4) row.classList.add('rank-top');
            if (rank >= entries.length - 2) row.classList.add('rank-bottom');

            row.innerHTML = `
                <td class="standings-rank">${rank}</td>
                <td class="standings-team">
                    <img src="${team.logos && team.logos[0] ? team.logos[0].href : ''}" alt="${team.abbreviation}">
                    <span>${team.shortDisplayName || team.name}</span>
                </td>
                 <td style="text-align:center; color:#aaa;">${playedStat ? playedStat.value : '-'}</td>
                <td class="standings-pts">${pointsStat ? pointsStat.value : 0}</td>
            `;
            tbody.appendChild(row);
        });

        footballStandings.appendChild(table);
    }

    function startFootballUpdates() {
        if (footballInterval) clearInterval(footballInterval);
        fetchScores(footballState.selectedLeague);
        footballInterval = setInterval(() => {
            fetchScores(footballState.selectedLeague);
        }, 60000); // 1 minute
    }

    function stopFootballUpdates() {
        if (footballInterval) clearInterval(footballInterval);
        footballInterval = null;
    }

    // Drag Logic (Refactored or Duplicated for simplicity/safety)
    // To allow dragging BOTH widgets independently without conflict, we need separate variables or a generic function.
    // For now, let's duplicate the simple logic for the football header to ensure isolation.

    let isDraggingFB = false;
    let dragOffsetFBX = 0;
    let dragOffsetFBY = 0;

    footballHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return; // Ignore controls

        isDraggingFB = true;

        const rect = footballWidget.getBoundingClientRect();
        dragOffsetFBX = e.clientX - rect.left;
        dragOffsetFBY = e.clientY - rect.top;

        document.addEventListener('mousemove', onMouseMoveFB);
        document.addEventListener('mouseup', onMouseUpFB);

        footballHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveFB(e) {
        if (!isDraggingFB) return;

        let newLeft = e.clientX - dragOffsetFBX;
        let newTop = e.clientY - dragOffsetFBY;

        const maxLeft = window.innerWidth - footballWidget.offsetWidth;
        const maxTop = window.innerHeight - footballHeader.offsetHeight;

        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 20) newTop = window.innerHeight - 20;

        footballWidget.style.left = `${newLeft}px`;
        footballWidget.style.top = `${newTop}px`;
        footballWidget.style.bottom = 'auto';
    }

    function onMouseUpFB() {
        if (isDraggingFB) {
            isDraggingFB = false;
            document.removeEventListener('mousemove', onMouseMoveFB);
            document.removeEventListener('mouseup', onMouseUpFB);
            footballHeader.style.cursor = 'move';

            footballState.position.top = footballWidget.style.top;
            footballState.position.left = footballWidget.style.left;

            bringToFront(footballWidget);
            footballState.zIndex = maxZIndex;

            saveFootballState();
        }
    }

    // --- Todo Widget Logic ---
    const todoBtn = document.getElementById('todo-btn');
    const todoWidget = document.getElementById('todo-widget');
    const todoHeader = document.getElementById('todo-header');
    const todoMinimizeBtn = document.getElementById('todo-minimize');
    const todoInput = document.getElementById('todo-input');
    const todoAddBtn = document.getElementById('todo-add-btn');
    const todoListContainer = document.getElementById('todo-list');

    // State
    let todoState = {
        isOpen: false,
        isMinimized: false,
        position: {
            top: '100px',
            left: '660px'
        },
        list: [] // { id, text, completed }
    };

    // Load State
    chrome.storage.local.get(['todoState'], (result) => {
        if (result.todoState) {
            todoState = {
                ...todoState,
                ...result.todoState
            };
            applyTodoState();
            renderTodos();
        }
    });

    function saveTodoState() {
        chrome.storage.local.set({
            todoState
        });
    }

    function applyTodoState() {
        // Visibility
        if (todoState.isOpen) {
            todoWidget.classList.remove('hidden');
            todoBtn.classList.add('active');
        } else {
            todoWidget.classList.add('hidden');
            todoBtn.classList.remove('active');
        }

        // Minimized
        if (todoState.isMinimized) {
            todoWidget.classList.add('minimized');
            todoMinimizeBtn.textContent = '+';
        } else {
            todoWidget.classList.remove('minimized');
            todoMinimizeBtn.textContent = '-';
        }

        // Position
        todoWidget.style.top = todoState.position.top;
        todoWidget.style.left = todoState.position.left;
        todoWidget.style.bottom = 'auto';
        todoWidget.style.right = 'auto';
    }

    function renderTodos() {
        todoListContainer.innerHTML = '';
        if (todoState.list.length === 0) {
            todoListContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#888; font-size:0.8rem;">No tasks yet</div>';
            return;
        }

        todoState.list.forEach(todo => {
            const item = document.createElement('div');
            item.className = `todo-item ${todo.completed ? 'completed' : ''}`;

            item.innerHTML = `
                <div class="todo-checkbox" data-id="${todo.id}">
                    ${todo.completed ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </div>
                <span class="todo-text">${todo.text}</span>
                <div class="todo-delete" data-id="${todo.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
            `;

            // Checkbox Click
            item.querySelector('.todo-checkbox').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTodo(todo.id);
            });

            // Delete Click
            item.querySelector('.todo-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTodo(todo.id);
            });

            todoListContainer.appendChild(item);
        });
    }

    function addTodo() {
        const text = todoInput.value.trim();
        if (!text) return;

        const newTodo = {
            id: Date.now(),
            text: text,
            completed: false
        };

        todoState.list.push(newTodo);
        todoInput.value = '';
        saveTodoState();
        renderTodos();
    }

    function toggleTodo(id) {
        const todo = todoState.list.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            saveTodoState();
            renderTodos();
        }
    }

    function deleteTodo(id) {
        todoState.list = todoState.list.filter(t => t.id !== id);
        saveTodoState();
        renderTodos();
    }

    // Event Listeners
    todoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden'); // Close Menu

        todoState.isOpen = !todoState.isOpen;
        if (todoState.isOpen) {
            bringToFront(todoWidget);
            todoState.zIndex = maxZIndex;
        }
        applyTodoState();
        saveTodoState();
    });

    todoMinimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        todoState.isMinimized = !todoState.isMinimized;
        applyTodoState();
        saveTodoState();
    });

    todoAddBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    // Drag Logic (Duplicated again for safety)
    let isDraggingTodo = false;
    let dragOffsetTodoX = 0;
    let dragOffsetTodoY = 0;

    todoHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;

        isDraggingTodo = true;
        const rect = todoWidget.getBoundingClientRect();
        dragOffsetTodoX = e.clientX - rect.left;
        dragOffsetTodoY = e.clientY - rect.top;

        document.addEventListener('mousemove', onMouseMoveTodo);
        document.addEventListener('mouseup', onMouseUpTodo);
        todoHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveTodo(e) {
        if (!isDraggingTodo) return;

        let newLeft = e.clientX - dragOffsetTodoX;
        let newTop = e.clientY - dragOffsetTodoY;

        const maxLeft = window.innerWidth - todoWidget.offsetWidth;
        const maxTop = window.innerHeight - todoHeader.offsetHeight;

        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 20) newTop = window.innerHeight - 20;

        todoWidget.style.left = `${newLeft}px`;
        todoWidget.style.top = `${newTop}px`;
        todoWidget.style.bottom = 'auto';
    }

    function onMouseUpTodo() {
        if (isDraggingTodo) {
            isDraggingTodo = false;
            document.removeEventListener('mousemove', onMouseMoveTodo);
            document.removeEventListener('mouseup', onMouseUpTodo);
            todoHeader.style.cursor = 'move';

            todoState.position.top = todoWidget.style.top;
            todoState.position.left = todoWidget.style.left;

            bringToFront(todoWidget);
            todoState.zIndex = maxZIndex;

            saveTodoState();
        }
    }

    // --- Quick Notes Widget Logic ---
    const notesBtn = document.getElementById('notes-btn');
    const notesWidget = document.getElementById('notes-widget');
    const notesHeader = document.getElementById('notes-header');
    const notesMinimizeBtn = document.getElementById('notes-minimize');

    const notesInput = document.getElementById('notes-input');

    // State
    let notesState = {
        isOpen: false,
        isMinimized: false,
        zIndex: 100,
        position: {
            top: '100px',
            left: '950px'
        },
        content: ''
    };

    // Load State
    chrome.storage.local.get(['notesState'], (result) => {
        if (result.notesState) {
            notesState = {
                ...notesState,
                ...result.notesState
            };
            applyNotesState();
            notesInput.value = notesState.content;
        }
    });

    function saveNotesState() {
        chrome.storage.local.set({
            notesState
        });
    }

    function applyNotesState() {
        // Visibility
        if (notesState.isOpen) {
            notesWidget.classList.remove('hidden');
            notesBtn.classList.add('active');
        } else {
            notesWidget.classList.add('hidden');
            notesBtn.classList.remove('active');
        }

        // Minimized
        if (notesState.isMinimized) {
            notesWidget.classList.add('minimized');
            notesMinimizeBtn.textContent = '+';
        } else {
            notesWidget.classList.remove('minimized');
            notesMinimizeBtn.textContent = '-';
        }

        // Position
        notesWidget.style.top = notesState.position.top;
        notesWidget.style.left = notesState.position.left;
        notesWidget.style.bottom = 'auto';
        notesWidget.style.right = 'auto';

        // Z-Index
        if (notesState.zIndex) {
            notesWidget.style.zIndex = notesState.zIndex;
            if (notesState.zIndex > maxZIndex) maxZIndex = notesState.zIndex;
        }
    }

    // Event Listeners
    notesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden'); // Close Menu

        notesState.isOpen = !notesState.isOpen;
        if (notesState.isOpen) {
            bringToFront(notesWidget);
            notesState.zIndex = maxZIndex;
        }
        applyNotesState();
        saveNotesState();
    });

    notesMinimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notesState.isMinimized = !notesState.isMinimized;
        bringToFront(notesWidget);
        notesState.zIndex = maxZIndex;
        applyNotesState();
        saveNotesState();
    });

    // Auto-save content
    notesInput.addEventListener('input', () => {
        notesState.content = notesInput.value;
        saveNotesState();
    });

    // Drag Logic
    let isDraggingNotes = false;
    let dragOffsetNotesX = 0;
    let dragOffsetNotesY = 0;

    notesHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;

        isDraggingNotes = true;
        const rect = notesWidget.getBoundingClientRect();
        dragOffsetNotesX = e.clientX - rect.left;
        dragOffsetNotesY = e.clientY - rect.top;

        document.addEventListener('mousemove', onMouseMoveNotes);
        document.addEventListener('mouseup', onMouseUpNotes);
        notesHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveNotes(e) {
        if (!isDraggingNotes) return;

        let newLeft = e.clientX - dragOffsetNotesX;
        let newTop = e.clientY - dragOffsetNotesY;

        const maxLeft = window.innerWidth - notesWidget.offsetWidth;
        const maxTop = window.innerHeight - notesHeader.offsetHeight;

        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 20) newTop = window.innerHeight - 20;

        notesWidget.style.left = `${newLeft}px`;
        notesWidget.style.top = `${newTop}px`;
        notesWidget.style.bottom = 'auto';
    }

    function onMouseUpNotes() {
        if (isDraggingNotes) {
            isDraggingNotes = false;
            document.removeEventListener('mousemove', onMouseMoveNotes);
            document.removeEventListener('mouseup', onMouseUpNotes);
            notesHeader.style.cursor = 'move';

            notesState.position.top = notesWidget.style.top;
            notesState.position.left = notesWidget.style.left;

            bringToFront(notesWidget);
            notesState.zIndex = maxZIndex;

            saveNotesState();
        }
    }

    // --- Generic Z-Index Logic (Moved to end to ensure all elements exist) ---
    const widgets = [spotifyWidget, footballWidget, todoWidget, notesWidget];
    widgets.forEach(w => {
        if (w) {
            w.addEventListener('mousedown', () => bringToFront(w));
        }
    });

});