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

    // --- Notifications UI Logic ---
    const bell = document.getElementById('notification-bell');
    const panel = document.getElementById('notification-panel');
    const badge = document.getElementById('notification-badge');
    const clearBtn = document.getElementById('clear-notifications');

    // --- Top Sites Logic ---
    const topSitesBtn = document.getElementById('top-sites-btn');
    const topSitesPanel = document.getElementById('top-sites-panel');
    const topSitesList = document.getElementById('top-sites-list');

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
                    if (uniqueSites.length >= 5) break;
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

    // --- User Menu Logic ---
    const profileBtn = document.getElementById('user-profile');
    const userMenu = document.getElementById('user-menu');
    const menuItems = document.querySelectorAll('.menu-list li[data-action]');

    function togglePanel(targetPanel) {
        // Close others
        [panel, userMenu, topSitesPanel].forEach(p => {
            if (p !== targetPanel) p.classList.add('hidden');
        });
        targetPanel.classList.toggle('hidden');
    }

    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(panel);
        if (!panel.classList.contains('hidden')) {
            badge.classList.add('hidden');
        }
    });

    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(userMenu);
    });

    clearBtn.addEventListener('click', async () => {
        await notificationManager.clearAll();
        await renderNotifications();
    });

    await renderNotifications();
    await updateAvatar();

    async function updateAvatar() {
        const result = await chrome.storage.local.get('userAvatar');
        const img = document.getElementById('user-avatar-img');
        const svg = document.getElementById('user-avatar-placeholder');

        if (result.userAvatar) {
            img.src = result.userAvatar;
            img.classList.remove('hidden');
            svg.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            svg.classList.remove('hidden');
        }
    }

    // Handle Menu Actions
    menuItems.forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            let url = '';
            switch (action) {
                case 'change-avatar':
                    const input = prompt('Enter the URL of your desired avatar image:');
                    if (input) {
                        await chrome.storage.local.set({
                            userAvatar: input
                        });
                        await updateAvatar();
                    }
                    break;
                case 'bookmarks':
                    url = 'chrome://bookmarks';
                    break;
                case 'history':
                    url = 'chrome://history';
                    break;
                case 'downloads':
                    url = 'chrome://downloads';
                    break;
                case 'extensions':
                    url = 'chrome://extensions';
                    break;
                case 'settings':
                    url = 'chrome://settings';
                    break;
            }
            if (url) {
                chrome.tabs.create({
                    url
                });
            }
            userMenu.classList.add('hidden');
        });
    });

    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !bell.contains(e.target)) {
            panel.classList.add('hidden');
        }
        if (!userMenu.contains(e.target) && !profileBtn.contains(e.target)) {
            userMenu.classList.add('hidden');
        }
        if (!topSitesPanel.contains(e.target) && !topSitesBtn.contains(e.target)) {
            topSitesPanel.classList.add('hidden');
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
});