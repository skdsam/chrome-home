// --- Unified Custom Dialog Logic (Defined Globally for access by other modules) ---
window.customAlert = (title, message) => window._showDialog('alert', title, message);
window.customConfirm = (title, message) => window._showDialog('confirm', title, message);
window.customPrompt = (title, message, defaultValue = '') => window._showDialog('prompt', title, message, defaultValue);

document.addEventListener('DOMContentLoaded', async () => {
    // --- Unified Custom Dialog Logic ---
    const dialogOverlay = document.getElementById('custom-dialog-overlay');
    const dialogTitle = document.getElementById('dialog-title');
    const dialogMessage = document.getElementById('dialog-message');
    const dialogInput = document.getElementById('dialog-input');
    const dialogInputContainer = document.getElementById('dialog-input-container');
    const dialogCancel = document.getElementById('dialog-cancel');
    const dialogConfirm = document.getElementById('dialog-confirm');

    let dialogResolver = null;

    window._showDialog = function (type, title, message, defaultValue = '') {
        return new Promise((resolve) => {
            dialogTitle.textContent = title;
            dialogMessage.textContent = message;
            dialogInput.value = defaultValue;

            // UI adjustment based on type
            if (type === 'alert') {
                dialogInputContainer.classList.add('hidden');
                dialogCancel.classList.add('hidden');
                dialogConfirm.textContent = 'OK';
            } else if (type === 'confirm') {
                dialogInputContainer.classList.add('hidden');
                dialogCancel.classList.remove('hidden');
                dialogConfirm.textContent = 'Yes';
                dialogCancel.textContent = 'No';
            } else if (type === 'prompt') {
                dialogInputContainer.classList.remove('hidden');
                dialogCancel.classList.remove('hidden');
                dialogConfirm.textContent = 'Confirm';
                dialogCancel.textContent = 'Cancel';
            }

            dialogOverlay.classList.remove('hidden');
            if (type === 'prompt') dialogInput.focus();
            dialogResolver = resolve;
        });
    }

    dialogConfirm.addEventListener('click', () => {
        const value = dialogInput.value;
        const res = dialogInputContainer.classList.contains('hidden') ? true : value;
        dialogOverlay.classList.add('hidden');
        if (dialogResolver) dialogResolver(res);
        dialogResolver = null;
    });

    dialogCancel.addEventListener('click', () => {
        dialogOverlay.classList.add('hidden');
        if (dialogResolver) dialogResolver(null);
        dialogResolver = null;
    });

    dialogOverlay.addEventListener('click', (e) => {
        if (e.target === dialogOverlay) {
            dialogOverlay.classList.add('hidden');
            if (dialogResolver) dialogResolver(null);
            dialogResolver = null;
        }
    });

    // Handle global keys for dialog
    window.addEventListener('keydown', (e) => {
        if (dialogOverlay.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            dialogConfirm.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            dialogCancel.click();
        }
    });

    // --- Shortcuts Logic ---
    const shortcutsGrid = document.getElementById('shortcuts-grid');
    const addShortcutBtn = document.getElementById('add-shortcut-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const shortcutForm = document.getElementById('shortcut-form');
    const cancelModalBtn = document.getElementById('cancel-modal');
    const modalTitle = document.getElementById('modal-title');
    const weatherManager = new window.WeatherManager();
    const notificationManager = new window.NotificationManager();
    class AISidebarManager {
        constructor() {
            this.sidebar = document.getElementById('ai-sidebar');
            this.handle = document.querySelector('.ai-sidebar-handle');
            this.toggleSwitch = document.getElementById('ai-sidebar-toggle');
            this.positionSelect = document.getElementById('ai-sidebar-position');
            this.dock = document.querySelector('.ai-dock');

            // Settings UI Elements
            this.agentsListContainer = document.getElementById('ai-agents-list');
            this.addAgentBtn = document.getElementById('add-agent-btn');
            this.newAgentName = document.getElementById('new-agent-name');
            this.newAgentUrl = document.getElementById('new-agent-url');

            // Default Tools
            this.defaultTools = [{
                    name: 'Gemini',
                    url: 'https://gemini.google.com/app'
                },
                {
                    name: 'ChatGPT',
                    url: 'https://chatgpt.com/'
                },
                {
                    name: 'Claude',
                    url: 'https://claude.ai/chats'
                },
                {
                    name: 'Perplexity',
                    url: 'https://www.perplexity.ai/'
                },
                {
                    name: 'Grok',
                    url: 'https://twitter.com/i/grok'
                },
                {
                    name: 'Kimi',
                    url: 'https://kimi.moonshot.cn/'
                },
                {
                    name: 'DeepSeek',
                    url: 'https://chat.deepseek.com/'
                }
            ];

            this.state = {
                enabled: true,
                position: 'right',
                isOpen: false,
                customAgents: [] // Stores user added agents OR overrides to defaults if we want full customizability
            };
        }

        async init() {
            const stored = await window.storageManager.get(['aiSidebarConfig']);
            if (stored.aiSidebarConfig) {
                this.state = {
                    ...this.state,
                    ...stored.aiSidebarConfig
                };
            }

            // If customAgents is empty/undefined, maybe we should init it with defaults so they can be deleted?
            // Or keep defaults separate? User said "Add a remove" implying full control.
            // Let's populate customAgents with defaults ONCE if it's empty to give full control.
            if (!this.state.customAgents || this.state.customAgents.length === 0) {
                this.state.customAgents = [...this.defaultTools];
            }

            this.renderDock();
            this.renderSettingsList(); // Render list in settings
            this.applyState();
            this.setupListeners();
        }

        renderDock() {
            this.dock.innerHTML = '';

            this.state.customAgents.forEach(tool => {
                const iconDiv = document.createElement('div');
                iconDiv.className = 'ai-icon';
                iconDiv.setAttribute('title', tool.name);
                iconDiv.setAttribute('data-url', tool.url);

                // Use Google S2 for Favicon
                const domain = new URL(tool.url).hostname;
                const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

                const img = document.createElement('img');
                img.src = iconUrl;
                img.alt = tool.name;
                img.style.width = '24px';
                img.style.height = '24px';
                img.style.borderRadius = '4px';

                iconDiv.appendChild(img);

                // Click to Open
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openPopup(tool.url, tool.name);
                });

                this.dock.appendChild(iconDiv);
            });
        }

        renderSettingsList() {
            if (!this.agentsListContainer) return;
            this.agentsListContainer.innerHTML = '';

            this.state.customAgents.forEach((tool, index) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '5px';
                row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                row.style.fontSize = '0.9em';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = tool.name;

                const delBtn = document.createElement('button');
                delBtn.textContent = '×';
                delBtn.style.background = 'rgba(255,0,0,0.3)';
                delBtn.style.border = 'none';
                delBtn.style.color = 'white';
                delBtn.style.borderRadius = '4px';
                delBtn.style.cursor = 'pointer';
                delBtn.style.padding = '2px 6px';

                delBtn.addEventListener('click', () => {
                    this.removeAgent(index);
                });

                row.appendChild(nameSpan);
                row.appendChild(delBtn);
                this.agentsListContainer.appendChild(row);
            });
        }

        addAgent(name, url) {
            if (!name || !url) return;
            try {
                new URL(url); // Validate URL
            } catch (e) {
                window.customAlert('Invalid URL', 'Please enter a valid website address.');
                return;
            }

            this.state.customAgents.push({
                name,
                url
            });
            this.saveAndApply();
            this.renderDock();
            this.renderSettingsList();

            // Clear inputs
            this.newAgentName.value = '';
            this.newAgentUrl.value = '';
        }

        removeAgent(index) {
            this.state.customAgents.splice(index, 1);
            this.saveAndApply();
            this.renderDock();
            this.renderSettingsList();
        }

        setupListeners() {
            // Handle Toggle (Slide In/Out)
            if (this.handle) {
                this.handle.addEventListener('click', () => {
                    this.state.isOpen = !this.state.isOpen;
                    this.applyState();
                });

                // Optional: Hover open
                // this.sidebar.addEventListener('mouseenter', () => {
                //     // this.state.isOpen = true; // Maybe too aggressive? Let's stick to click for now as requested
                // });
            }

            // Close when clicking outside?
            document.addEventListener('click', (e) => {
                if (this.state.isOpen && !this.sidebar.contains(e.target)) {
                    this.state.isOpen = false;
                    this.applyState();
                }
            });

            // Settings Toggle
            if (this.toggleSwitch) {
                this.toggleSwitch.checked = this.state.enabled;
                this.toggleSwitch.addEventListener('change', () => {
                    this.state.enabled = this.toggleSwitch.checked;
                    this.saveAndApply();
                });
            }

            // Settings Position
            if (this.positionSelect) {
                this.positionSelect.value = this.state.position;
                this.positionSelect.addEventListener('change', () => {
                    this.state.position = this.positionSelect.value;
                    this.state.isOpen = false; // Close on position change
                    this.saveAndApply();
                });
            }

            // Add Agent Button
            if (this.addAgentBtn) {
                this.addAgentBtn.addEventListener('click', () => {
                    this.addAgent(this.newAgentName.value.trim(), this.newAgentUrl.value.trim());
                });
            }

            // Sync Listener logic is shared in main listener
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.aiSidebarConfig) {
                    this.state = changes.aiSidebarConfig.newValue;
                    this.applyState();
                    this.renderDock(); // Re-render dock on remote change
                    this.renderSettingsList(); // Re-render settings list
                    // Update UI controls
                    if (this.toggleSwitch) this.toggleSwitch.checked = this.state.enabled;
                    if (this.positionSelect) this.positionSelect.value = this.state.position;
                }
            });
        }

        async saveAndApply() {
            // Don't save isOpen state, always closed on reload
            const toSave = {
                ...this.state,
                isOpen: false
            };
            await window.storageManager.set({
                aiSidebarConfig: toSave
            });
            this.applyState();
        }

        applyState() {
            if (!this.sidebar) return;

            // 1. Visibility (Enabled/Disabled)
            if (this.state.enabled) {
                this.sidebar.classList.remove('hidden');
            } else {
                this.sidebar.classList.add('hidden');
            }

            // 2. Position styling
            this.sidebar.classList.remove('left', 'right', 'bottom');
            this.sidebar.classList.add(this.state.position);

            // 3. Open/Close styling
            if (this.state.isOpen) {
                this.sidebar.classList.add('open');
                // Could change text/icon if needed, but keeping simple "AI" is fine
            } else {
                this.sidebar.classList.remove('open');
            }
        }

        openPopup(url, title) {
            const width = 450;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            const windowName = `AI_Popup_${title}`;
            window.open(url, windowName, `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`);
        }
    }

    const aiSidebarManager = new AISidebarManager();
    aiSidebarManager.init();

    const topSitesList = document.getElementById('top-sites-list'); // Moved here to fix init error

    // CLEANUP: Remove deprecated Gemini state if present
    window.storageManager.remove(['geminiState']);

    // --- Search Engine Switcher Logic ---
    const searchEngineSelector = document.getElementById('search-engine-selector');
    const searchEngineIcon = document.getElementById('search-engine-icon');
    const searchEngineG = document.getElementById('search-engine-g');
    const searchEngineDropdown = document.getElementById('search-engine-dropdown');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchEngineOptions = document.querySelectorAll('.search-engine-option');

    // Default search engine config
    let currentSearchEngine = {
        engine: 'google',
        url: 'https://www.google.com/search',
        param: 'q',
        name: 'Google'
    };

    // Load saved search engine
    window.storageManager.get(['searchEngine']).then((result) => {
        if (result.searchEngine) {
            currentSearchEngine = result.searchEngine;
            applySearchEngine();
        }
    });

    function applySearchEngine() {
        // Toggle between animated G (for Google) and favicon (for others)
        if (currentSearchEngine.engine === 'google') {
            searchEngineG.classList.remove('hidden');
            searchEngineIcon.classList.add('hidden');
        } else {
            searchEngineG.classList.add('hidden');
            searchEngineIcon.classList.remove('hidden');
            // Update favicon
            const domain = currentSearchEngine.engine === 'duckduckgo' ? 'duckduckgo.com' : currentSearchEngine.engine + '.com';
            searchEngineIcon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        }

        // Update form action
        searchForm.action = currentSearchEngine.url;

        // Update input name (for Yahoo, param is 'p')
        searchInput.name = currentSearchEngine.param;

        // Update placeholder
        searchInput.placeholder = `Search ${currentSearchEngine.name}...`;

        // Update active state in dropdown
        searchEngineOptions.forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.engine === currentSearchEngine.engine) {
                opt.classList.add('active');
            }
        });
    }

    // Toggle dropdown
    if (searchEngineSelector) {
        searchEngineSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            searchEngineDropdown.classList.toggle('hidden');
        });
    }

    // Select engine
    searchEngineOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();

            currentSearchEngine = {
                engine: option.dataset.engine,
                url: option.dataset.url,
                param: option.dataset.param,
                name: option.querySelector('span').textContent
            };

            applySearchEngine();
            searchEngineDropdown.classList.add('hidden');

            // Save preference
            window.storageManager.set({
                searchEngine: currentSearchEngine
            });
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        if (searchEngineDropdown && !searchEngineDropdown.classList.contains('hidden')) {
            searchEngineDropdown.classList.add('hidden');
        }
    });

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

    const googleSyncToggle = document.getElementById('google-sync-toggle');

    // Load Initial settings
    chrome.storage.local.get(['googleSyncEnabled'], async (result) => {
        if (googleSyncToggle) {
            googleSyncToggle.checked = !!result.googleSyncEnabled;
        }

        // Now load other settings using storageManager
        const settings = await window.storageManager.get(['recentSitesLimit']);
        if (settings.recentSitesLimit) {
            window.recentSitesLimit = parseInt(settings.recentSitesLimit);
            recentSitesLimitInput.value = window.recentSitesLimit;
            renderTopSites(); // Re-render with loaded limit
        }
    });

    if (googleSyncToggle) {
        googleSyncToggle.addEventListener('change', async () => {
            const enabled = googleSyncToggle.checked;

            if (enabled) {
                if (await window.customConfirm('Enable Google Sync?', 'This will move your current local settings to your Google account and sync them across devices.')) {
                    await window.storageManager.migrate(true);
                    await chrome.storage.local.set({
                        googleSyncEnabled: true
                    });
                    window.customAlert('Sync Enabled', 'Google Sync has been enabled! Your data is now being synchronized.');
                    location.reload();
                } else {
                    googleSyncToggle.checked = false;
                }
            } else {
                if (await window.customConfirm('Disable Google Sync?', 'Your settings will remain in the cloud but new changes will only be saved locally. Continue?')) {
                    await chrome.storage.local.set({
                        googleSyncEnabled: false
                    });
                    location.reload();
                } else {
                    googleSyncToggle.checked = true;
                }
            }
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModalOverlay.classList.remove('hidden');
        });
    }

    // --- Tab Switching Logic ---
    const tabs = document.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Set active
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

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
        window.storageManager.set({
            recentSitesLimit: val
        });
        renderTopSites(); // Refresh list immediately
    });

    // Export Data
    exportDataBtn.addEventListener('click', () => {
        window.storageManager.get(null).then((items) => {
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
                window.storageManager.clear(async () => {
                    await window.storageManager.set(data);
                    await window.customAlert('Import Success', 'Settings imported successfully! The page will now reload.');
                    location.reload();
                });
            } catch (err) {
                window.customAlert('Import Error', 'Failed to parse the backup file. Please ensure it is a valid JSON settings file.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    });

    // Init Weather
    weatherManager.init();

    // --- Background Customization Logic ---
    class BackgroundManager {
        constructor() {
            this.bgTypeSelect = document.getElementById('bg-type-select');
            this.bgQueryGroup = document.getElementById('bg-query-group');
            this.bgQueryLabel = document.getElementById('bg-query-label');
            this.bgQueryInput = document.getElementById('bg-query-input');
            this.bgIntervalInput = document.getElementById('bg-interval-input');
            this.mediaBg = document.getElementById('media-bg');
            this.weatherBlobs = document.getElementById('weather-blobs');
            this.bgOverlay = document.getElementById('bg-overlay');

            this.state = {
                type: 'weather',
                query: 'Nature',
                interval: 60 // Default 60 seconds
            };
            this.rotationInterval = null;
            this.currentSlideIndex = 0;
        }

        async init() {
            const stored = await window.storageManager.get('bgConfig');
            if (stored.bgConfig) {
                this.state = {
                    ...this.state,
                    ...stored.bgConfig
                };
            }

            this.applyState();
            this.setupListeners();
        }

        setupListeners() {
            if (this.bgTypeSelect) {
                this.bgTypeSelect.addEventListener('change', () => {
                    this.state.type = this.bgTypeSelect.value;
                    this.updateQueryVisibility();
                    this.saveAndApply();
                    // If switching back to weather, trigger weather update to restore blobs/state
                    if (this.state.type === 'weather') {
                        weatherManager.init();
                    }
                });
            }

            if (this.bgQueryInput) {
                this.bgQueryInput.addEventListener('change', () => {
                    this.state.query = this.bgQueryInput.value.trim() || 'Nature';
                    this.saveAndApply();
                });
            }

            if (this.bgIntervalInput) {
                this.bgIntervalInput.addEventListener('change', () => {
                    let val = parseInt(this.bgIntervalInput.value);
                    if (isNaN(val) || val < 10) val = 10; // Minimum 10s safety
                    this.state.interval = val;
                    this.saveAndApply();

                    // Restart rotation immediately with new speed if we are in image or gradient mode
                    if (this.state.type === 'image' || this.state.type === 'gradient') {
                        this.stopRotation();
                        const intervalMs = this.state.interval * 1000;
                        this.rotationInterval = setInterval(() => {
                            if (this.state.type === 'image') this.rotateImage();
                            if (this.state.type === 'gradient') this.loadRandomGradient();
                        }, intervalMs);
                    }
                });
            }
        }

        updateQueryVisibility() {
            if (!this.bgQueryGroup) return;
            if (this.state.type === 'weather') {
                this.bgQueryGroup.classList.add('hidden');
            } else if (this.state.type === 'gradient') {
                this.bgQueryGroup.classList.remove('hidden'); // Show group so we can show interval

                // Hide Query Input parts
                this.bgQueryLabel.style.display = 'none';
                this.bgQueryInput.style.display = 'none';

                // Show Interval parts
                if (this.bgIntervalInput) {
                    this.bgIntervalInput.style.display = 'block';
                    this.bgIntervalInput.previousElementSibling.style.display = 'block';
                }
            } else {
                this.bgQueryGroup.classList.remove('hidden');

                // Show Query Input parts
                this.bgQueryLabel.style.display = 'block';
                this.bgQueryInput.style.display = 'block';
                this.bgQueryLabel.textContent = 'Image Topic';

                if (this.bgIntervalInput) {
                    this.bgIntervalInput.style.display = 'block';
                    this.bgIntervalInput.previousElementSibling.style.display = 'block';
                }
            }
        }

        async saveAndApply() {
            await window.storageManager.set({
                bgConfig: this.state
            });
            this.applyState();
        }

        applyState() {
            if (this.bgTypeSelect) this.bgTypeSelect.value = this.state.type;
            if (this.bgQueryInput) this.bgQueryInput.value = this.state.query;
            if (this.bgIntervalInput) this.bgIntervalInput.value = this.state.interval || 60;

            this.updateQueryVisibility();

            if (this.state.type === 'weather') {
                this.mediaBg.classList.add('hidden');
                this.weatherBlobs.classList.remove('hidden');
                this.bgOverlay.style.background = 'rgba(0,0,0,0.1)';
                this.stopRotation();
                this.mediaBg.innerHTML = ''; // Clean up media
            } else if (this.state.type === 'gradient') {
                this.mediaBg.classList.remove('hidden');
                this.weatherBlobs.classList.add('hidden');
                this.bgOverlay.style.background = 'rgba(0,0,0,0.1)'; // Lighter overlay for gradients

                this.stopRotation();

                // Initial Load
                this.loadRandomGradient();

                const intervalMs = (this.state.interval || 60) * 1000;
                this.rotationInterval = setInterval(() => {
                    this.loadRandomGradient();
                }, intervalMs);
            } else {
                this.mediaBg.classList.remove('hidden');
                this.weatherBlobs.classList.add('hidden');
                this.bgOverlay.style.background = 'rgba(0,0,0,0.3)';
                this.loadMedia();
            }
        }

        stopRotation() {
            if (this.rotationInterval) {
                clearInterval(this.rotationInterval);
                this.rotationInterval = null;
            }
        }

        async loadMedia() {
            this.stopRotation();
            this.mediaBg.innerHTML = ''; // Reset container

            if (this.state.type === 'image') {
                // Create two slides for cross-fading
                const slide1 = document.createElement('div');
                slide1.className = 'bg-slide active';
                const slide2 = document.createElement('div');
                slide2.className = 'bg-slide';

                this.mediaBg.appendChild(slide1);
                this.mediaBg.appendChild(slide2);

                this.currentSlideIndex = 0; // 0 means slide1 is visible, target slide2 next

                // Initial Load
                await this.loadImageToSlide(slide1);

                // Start Rotation (use stored interval or default 60s)
                const intervalMs = (this.state.interval || 60) * 1000;

                this.rotationInterval = setInterval(() => {
                    this.rotateImage();
                }, intervalMs);
            }
        }

        loadRandomGradient() {
            // Generate a random, aesthetically pleasing gradient procedurally
            // This ensures infinite variety like uigradients/cssgradient.io

            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

            // 1. Pick a Angle (0-360)
            const angle = randomInt(0, 360);

            // 2. Decide Gradient Type (Linear vs Radial) - 80% Linear, 20% Radial
            const isRadial = Math.random() > 0.8;

            // 3. Generate Colors using HSL for harmony
            // Base Hue
            const baseHue = randomInt(0, 360);

            // Harmony Strategy: Analogous, Complementary, or Split Complementary
            const harmony = Math.random();
            let secondaryHue, tertiaryHue;

            if (harmony < 0.5) {
                // Analogous (Nearby colors, smooth)
                secondaryHue = (baseHue + randomInt(30, 60)) % 360;
                tertiaryHue = (baseHue + randomInt(60, 90)) % 360;
            } else if (harmony < 0.8) {
                // Complementary (Opposite, bold)
                secondaryHue = (baseHue + 180) % 360;
                tertiaryHue = (baseHue + randomInt(150, 210)) % 360;
            } else {
                // Triadic (Vibrant)
                secondaryHue = (baseHue + 120) % 360;
                tertiaryHue = (baseHue + 240) % 360;
            }

            // Saturation & Lightness (Keep premium/vibrant)
            const s = randomInt(60, 90) + '%';
            const l = randomInt(40, 65) + '%';

            const color1 = `hsl(${baseHue}, ${s}, ${l})`;
            const color2 = `hsl(${secondaryHue}, ${s}, ${l})`;
            const color3 = `hsl(${tertiaryHue}, ${s}, ${l})`;

            // 4. Construct Gradient String
            let gradientVal;
            const stopType = Math.random();

            if (isRadial) {
                gradientVal = `radial-gradient(circle at ${randomInt(20,80)}% ${randomInt(20,80)}%, ${color1}, ${color2})`;
            } else {
                if (stopType < 0.6) {
                    // 2-Stop Simple
                    gradientVal = `linear-gradient(${angle}deg, ${color1}, ${color2})`;
                } else {
                    // 3-Stop Complex
                    gradientVal = `linear-gradient(${angle}deg, ${color1}, ${color2}, ${color3})`;
                }
            }

            // Clear current
            this.mediaBg.innerHTML = '';

            const gradDiv = document.createElement('div');
            gradDiv.className = 'gradient-bg';
            gradDiv.style.background = gradientVal;
            gradDiv.style.backgroundSize = '200% 200%'; // Slightly less zoom for procedural to show off colors

            this.mediaBg.appendChild(gradDiv);
        }

        async loadImageToSlide(slideElement) {
            const timestamp = new Date().getTime();
            // Using loremflickr with a lock for consistency per request but variety per timestamp
            const randomUrl = `https://loremflickr.com/1920/1080/${encodeURIComponent(this.state.query)}?lock=${timestamp}`;

            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    slideElement.style.backgroundImage = `url('${randomUrl}')`;
                    resolve();
                };
                // Fallback in case of error
                img.onerror = () => {
                    console.error("Failed to load image");
                    resolve(); // Resolve anyway to not break the chain
                };
                img.src = randomUrl;
            });
        }

        async rotateImage() {
            const slides = this.mediaBg.querySelectorAll('.bg-slide');
            if (slides.length < 2) return;

            const current = slides[this.currentSlideIndex];
            const nextIndex = (this.currentSlideIndex + 1) % slides.length;
            const next = slides[nextIndex];

            // Load new image into 'next' (hidden) slide
            await this.loadImageToSlide(next);

            // Swap opacity
            next.classList.add('active');
            current.classList.remove('active');

            // Update index
            this.currentSlideIndex = nextIndex;
        }
    }

    const bgManager = new BackgroundManager();
    bgManager.init();

    // --- Real-time Sync Listener ---
    // Listens for changes from other devices (if Google Sync is enabled)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        // Background Config Sync
        if (changes.bgConfig) {
            console.log('Background config updated remotely:', changes.bgConfig.newValue);
            // Update state and re-apply without reloading
            bgManager.state = changes.bgConfig.newValue;
            bgManager.applyState();
        }

        // Recent Sites Limit Sync
        if (changes.recentSitesLimit) {
            window.recentSitesLimit = parseInt(changes.recentSitesLimit.newValue);
            if (recentSitesLimitInput) recentSitesLimitInput.value = window.recentSitesLimit;
            renderTopSites();
        }

        // We can add other sync handlers here (shortcuts, etc.)
    });

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
    let searchType = 'web';

    searchOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            searchOptions.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchType = btn.dataset.type;
            searchInput.placeholder = `Search ${currentSearchEngine.name} ${btn.textContent}...`;
        });
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value;
        if (!query) return;

        // Use current search engine URL
        let url = currentSearchEngine.url + '?' + currentSearchEngine.param + '=' + encodeURIComponent(query);

        // Google-specific type params (Images, Videos, News) - only apply to Google
        if (currentSearchEngine.engine === 'google') {
            if (searchType === 'isch') {
                url += '&tbm=isch';
            } else if (searchType === 'vid') {
                url += '&tbm=vid';
            } else if (searchType === 'nws') {
                url += '&tbm=nws';
            }
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
        const url = await window.customPrompt('Add Site', 'Enter the website URL:');
        if (!url) return;
        const name = await window.customPrompt('Site Name', 'Enter a name for this site:');
        if (!name) return;

        const mySites = await getMySites();
        mySites.push({
            id: Date.now(),
            url: url.startsWith('http') ? url : `https://${url}`,
            title: name
        });
        await window.storageManager.set({
            mySites
        });
        renderMySites();
    });

    async function getMySites() {
        const res = await window.storageManager.get('mySites');
        return res.mySites || [];
    }

    async function removeMySite(id) {
        let sites = await getMySites();
        sites = sites.filter(s => s.id !== id);
        await window.storageManager.set({
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
            delBtn.onclick = async (e) => {
                e.preventDefault();
                // Reuse existing confirmation or could make a customConfirm too
                if (await window.customConfirm('Remove Site', 'Are you sure you want to remove this site from your list?')) {
                    removeMySite(site.id);
                }
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
    document.getElementById('weather-display').addEventListener('click', async () => {
        const currentLocLabel = document.getElementById('weather-temp').textContent.split(',')[0];
        const initialValue = currentLocLabel.includes('°') ? '' : currentLocLabel;

        const newCity = await window.customPrompt('Change Location', 'Enter your city manually (or leave empty to use Auto-Location):', initialValue);

        if (newCity !== null) { // If not cancelled
            weatherManager.setManualLocation(newCity.trim());
        }
    });

    // --- Helper Functions ---
    async function getShortcuts() {
        const result = await window.storageManager.get('shortcuts');
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
        await window.storageManager.set({
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
            await window.storageManager.set({
                shortcuts
            });
        }
    }

    async function removeShortcut(id) {
        let shortcuts = await getShortcuts();
        const removed = shortcuts.find(s => s.id === id);
        shortcuts = shortcuts.filter(s => s.id !== id);
        await window.storageManager.set({
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
                <img src="${shortcut.icon}" alt="${shortcut.title}" class="shortcut-icon" onerror="this.src='icon-placeholder.png'">
                <div class="shortcut-title">${shortcut.title}</div>
                <div class="actions">
                    <button class="edit-btn" data-id="${shortcut.id}">✎</button>
                    <button class="delete-btn" data-id="${shortcut.id}">×</button>
                </div>
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
            deleteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (await window.customConfirm('Delete Shortcut', `Are you sure you want to delete the shortcut for ${shortcut.title}?`)) {
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
    window.storageManager.get(['spotifyState']).then((result) => {
        if (result.spotifyState) {
            spotifyState = {
                ...spotifyState,
                ...result.spotifyState
            };
            applySpotifyState();
        }
    });

    function saveSpotifyState() {
        window.storageManager.set({
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
    spotifyEditBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        bringToFront(spotifyWidget);
        spotifyState.zIndex = maxZIndex;

        const current = spotifyState.embedUrl;
        const newUrl = await window.customPrompt('Spotify Widget', 'Enter Spotify Playlist or Album URL:', current);

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


    const footballMatches = document.getElementById('football-matches');
    const footballLoading = document.getElementById('football-loading');
    const favoriteTeamInput = document.getElementById('favorite-team-input');

    // State
    let footballState = {
        isOpen: false,
        isMinimized: false,
        position: {
            top: '100px',
            left: '340px'
        }, // Default offset from spotify
        selectedLeague: 'eng.1', // Default EPL
        favoriteTeam: '' // User's pinned team
    };

    let footballInterval = null;

    // Load State
    window.storageManager.get(['footballState']).then((result) => {
        if (result.footballState) {
            footballState = {
                ...footballState,
                ...result.footballState
            };
            applyFootballState();
        }
    });

    function saveFootballState() {
        window.storageManager.set({
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

        if (footballState.isOpen) {
            startFootballUpdates();
        }

        // Fav Team Input
        if (favoriteTeamInput) {
            favoriteTeamInput.value = footballState.favoriteTeam || '';
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
        fetchScores(footballState.selectedLeague);
    });

    if (favoriteTeamInput) {
        favoriteTeamInput.addEventListener('input', () => {
            footballState.favoriteTeam = favoriteTeamInput.value.trim();
            saveFootballState();
            // We don't need to re-fetch, just re-render if we have data, 
            // but for simplicity, let's just let the next update or a manual league change handle it, 
            // or trigger a re-render if we have the last data.
            // Actually, let's just trigger a re-render.
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

        const favName = (footballState.favoriteTeam || '').toLowerCase();

        // Sort events: put matches with favorite team at the top
        const sortedEvents = [...data.events].sort((a, b) => {
            if (!favName) return 0;
            const aHasFav = a.name.toLowerCase().includes(favName);
            const bHasFav = b.name.toLowerCase().includes(favName);
            if (aHasFav && !bHasFav) return -1;
            if (!aHasFav && bHasFav) return 1;
            return 0;
        });

        sortedEvents.forEach(event => {
            const competition = event.competitions[0];
            const home = competition.competitors.find(c => c.homeAway === 'home');
            const away = competition.competitors.find(c => c.homeAway === 'away');
            const status = event.status.type.shortDetail; // "FT", "12'", "13:00"
            const isLive = event.status.type.state === 'in';

            const isFavored = favName && (
                home.team.displayName.toLowerCase().includes(favName) ||
                home.team.shortDisplayName.toLowerCase().includes(favName) ||
                away.team.displayName.toLowerCase().includes(favName) ||
                away.team.shortDisplayName.toLowerCase().includes(favName)
            );

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
            item.className = `match-item ${isFavored ? 'favored' : ''}`;

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
    window.storageManager.get(['todoState']).then((result) => {
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
        window.storageManager.set({
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
    window.storageManager.get(['notesState']).then((result) => {
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
        window.storageManager.set({
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

    // --- Tech News Widget Logic ---
    const techNewsBtn = document.getElementById('tech-news-btn');
    const techNewsWidget = document.getElementById('tech-news-widget');
    const techNewsHeader = document.getElementById('tech-news-header');
    const techNewsMinimize = document.getElementById('tech-news-minimize');
    const techNewsRefresh = document.getElementById('tech-news-refresh');
    const newsSourceSelect = document.getElementById('news-source-select');
    const techNewsList = document.getElementById('tech-news-list');
    const techNewsLoading = document.getElementById('tech-news-loading');

    let techNewsState = {
        isOpen: false,
        x: null,
        y: null,
        source: 'hackernews'
    };

    window.storageManager.get(['techNewsState']).then((result) => {
        if (result.techNewsState) {
            techNewsState = {
                ...techNewsState,
                ...result.techNewsState
            };
            if (newsSourceSelect) newsSourceSelect.value = techNewsState.source;
            applyTechNewsState();
        }
    });

    function saveTechNewsState() {
        window.storageManager.set({
            techNewsState
        });
    }

    function applyTechNewsState() {
        if (!techNewsWidget) return;
        if (techNewsState.isOpen) {
            techNewsWidget.classList.remove('hidden');
            if (techNewsBtn) techNewsBtn.classList.add('active');
        } else {
            techNewsWidget.classList.add('hidden');
            if (techNewsBtn) techNewsBtn.classList.remove('active');
        }
        if (techNewsState.x !== null && techNewsState.y !== null) {
            techNewsWidget.style.left = techNewsState.x + 'px';
            techNewsWidget.style.top = techNewsState.y + 'px';
            techNewsWidget.style.bottom = 'auto';
            techNewsWidget.style.right = 'auto';
        }
    }

    async function fetchNews(source) {
        if (!techNewsLoading || !techNewsList) return;
        techNewsLoading.classList.remove('hidden');
        techNewsList.innerHTML = '';
        try {
            let items = [];
            if (source === 'hackernews') {
                const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
                const ids = await res.json();
                const stories = await Promise.all(ids.slice(0, 10).map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())));
                items = stories.map(s => ({
                    title: s.title,
                    url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
                    score: s.score,
                    source: 'HN',
                    time: timeAgo(s.time * 1000)
                }));
            } else if (source === 'devto') {
                const res = await fetch('https://dev.to/api/articles?per_page=10&top=1');
                const articles = await res.json();
                items = articles.map(a => ({
                    title: a.title,
                    url: a.url,
                    score: a.positive_reactions_count,
                    source: 'DEV',
                    time: timeAgo(new Date(a.published_at).getTime())
                }));
            } else {
                items = [{
                    title: 'Product Hunt requires API auth',
                    url: 'https://producthunt.com',
                    score: '-',
                    source: 'PH',
                    time: ''
                }];
            }
            renderNews(items);
        } catch (e) {
            techNewsList.innerHTML = '<div class="news-error">Failed to load</div>';
        } finally {
            techNewsLoading.classList.add('hidden');
        }
    }

    function timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'now';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        return Math.floor(h / 24) + 'd';
    }

    function renderNews(items) {
        if (!techNewsList) return;
        techNewsList.innerHTML = items.map(i => `<a href="${i.url}" target="_blank" class="news-item"><div class="news-title">${i.title}</div><div class="news-meta"><span class="news-score">▲ ${i.score}</span><span class="news-source">${i.source}</span><span class="news-time">${i.time}</span></div></a>`).join('');
    }

    if (techNewsBtn) techNewsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden');
        techNewsState.isOpen = !techNewsState.isOpen;
        if (techNewsState.isOpen) fetchNews(techNewsState.source);
        applyTechNewsState();
        saveTechNewsState();
    });
    if (techNewsMinimize) techNewsMinimize.addEventListener('click', () => {
        techNewsState.isOpen = false;
        applyTechNewsState();
        saveTechNewsState();
    });
    if (techNewsRefresh) techNewsRefresh.addEventListener('click', () => fetchNews(techNewsState.source));
    if (newsSourceSelect) newsSourceSelect.addEventListener('change', (e) => {
        techNewsState.source = e.target.value;
        fetchNews(techNewsState.source);
        saveTechNewsState();
    });

    let isDraggingNews = false,
        dragOffsetNewsX = 0,
        dragOffsetNewsY = 0;
    if (techNewsHeader) techNewsHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
        isDraggingNews = true;
        const r = techNewsWidget.getBoundingClientRect();
        dragOffsetNewsX = e.clientX - r.left;
        dragOffsetNewsY = e.clientY - r.top;
        document.addEventListener('mousemove', onMouseMoveNews);
        document.addEventListener('mouseup', onMouseUpNews);
        techNewsHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveNews(e) {
        if (!isDraggingNews) return;
        let x = e.clientX - dragOffsetNewsX,
            y = e.clientY - dragOffsetNewsY;
        x = Math.max(0, Math.min(x, window.innerWidth - techNewsWidget.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - techNewsWidget.offsetHeight));
        techNewsWidget.style.left = x + 'px';
        techNewsWidget.style.top = y + 'px';
        techNewsWidget.style.bottom = 'auto';
        techNewsWidget.style.right = 'auto';
    }

    function onMouseUpNews() {
        if (!isDraggingNews) return;
        isDraggingNews = false;
        techNewsHeader.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMoveNews);
        document.removeEventListener('mouseup', onMouseUpNews);
        techNewsState.x = parseInt(techNewsWidget.style.left);
        techNewsState.y = parseInt(techNewsWidget.style.top);
        saveTechNewsState();
    }

    // --- Generic Z-Index Logic ---
    const widgets = [spotifyWidget, footballWidget, todoWidget, notesWidget, techNewsWidget];
    widgets.forEach(w => {
        if (w) w.addEventListener('mousedown', () => bringToFront(w));
    });

});