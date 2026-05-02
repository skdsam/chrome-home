// --- Unified Custom Dialog Logic (Defined Globally for access by other modules) ---
window.customAlert = (title, message) => window._showDialog('alert', title, message);
window.customConfirm = (title, message) => window._showDialog('confirm', title, message);
window.customPrompt = (title, message, defaultValue = '') => window._showDialog('prompt', title, message, defaultValue);

document.addEventListener('DOMContentLoaded', async () => {
    if (window.storageManager?.removeSync) {
        window.storageManager.removeSync(['githubReposCache', 'blenderDevCache', 'moviesCache']);
    }
    // Bust stale moviesCache if it contains the old broken /gb JustWatch URL
    if (window.storageManager?.getLocal) {
        window.storageManager.getLocal(['moviesCache']).then(result => {
            if (result.moviesCache) {
                const raw = JSON.stringify(result.moviesCache);
                if (raw.includes('justwatch.com/gb') || raw.includes('justwatch.com/us') && !raw.includes('justwatch.com/uk')) {
                    window.storageManager.setLocal({ moviesCache: {} }).catch(() => {});
                }
            }
        }).catch(() => {});
    }

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
    const syncStatus = await window.storageManager.isSyncEnabled();
    if (googleSyncToggle) {
        googleSyncToggle.checked = syncStatus;
    }

    // Now load other settings using storageManager
    const settings = await window.storageManager.get(['recentSitesLimit']);
    if (settings.recentSitesLimit) {
        window.recentSitesLimit = parseInt(settings.recentSitesLimit);
        recentSitesLimitInput.value = window.recentSitesLimit;
        renderTopSites(); // Re-render with loaded limit
    }


    // --- Global Storage Error Listener ---
    window.addEventListener('extension-storage-error', (e) => {
        const error = e.detail;
        if (error.includes('QUOTA_BYTES')) {
            window.customAlert('Sync Full', 'Your Google Sync storage is full (100KB limit). Some settings might not be saved to the cloud.');
        } else {
            window.customAlert('Storage Error', `There was a problem saving your data: ${error}`);
        }
    });
    if (googleSyncToggle) {
        googleSyncToggle.addEventListener('change', async () => {
            const enabled = googleSyncToggle.checked;

            if (enabled) {
                const choice = await window.customConfirm('Enable Google Sync?', 'This will sync your settings across devices. How would you like to proceed?');

                // If cancelled
                if (choice === null) {
                    googleSyncToggle.checked = false;
                    return;
                }

                try {
                    // Check if cloud data exists
                    const cloudData = await new Promise((resolve) => {
                        chrome.storage.sync.get(null, (res) => resolve(res));
                    });

                    let migrateMode = 'overwrite';
                    if (Object.keys(cloudData).length > 1) { // >1 because of potential internal extension keys
                        const merge = await window.customConfirm('Existing Cloud Data Found', 'Would you like to MERGE your local settings with your cloud settings? (Selecting "No" will overwrite cloud data with local settings)');
                        if (merge === null) {
                            googleSyncToggle.checked = false;
                            return;
                        }
                        migrateMode = merge ? 'merge' : 'overwrite';
                    }

                    await window.storageManager.migrate(true, migrateMode);
                    await chrome.storage.local.set({
                        googleSyncEnabled: true
                    });

                    window.customAlert('Sync Enabled', `Google Sync has been enabled in ${migrateMode} mode! Your data is now being synchronized.`);
                    setTimeout(() => location.reload(), 1000);
                } catch (err) {
                    window.customAlert('Sync Failed', `Failed to enable sync: ${err.message}`);
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

    // --- Sync Troubleshooting Logic ---
    const debugSyncBtn = document.getElementById('debug-sync-btn');
    const forceSyncPullBtn = document.getElementById('force-sync-pull');

    if (debugSyncBtn) {
        debugSyncBtn.addEventListener('click', async () => {
            const info = await window.storageManager.getDiagnosticInfo();
            const msg = `
ID: ${info.extensionId}
Sync Enabled: ${info.syncEnabled}
Local Items: ${info.localKeys.length}
Sync Items: ${info.syncKeys.length}
Sync Size: ${Math.round(info.syncDataSize / 1024 * 10) / 10} KB
            `.trim();

            await window.customAlert('Sync Diagnostics', msg + "\n\nNote: For sync to work across devices, the Extension ID must match exactly. If they don't match, you'll need to add a 'key' to your manifest.json.");
        });
    }

    if (forceSyncPullBtn) {
        forceSyncPullBtn.addEventListener('click', async () => {
            if (await window.customConfirm('Force Cloud Pull', 'This will pull all data from the cloud and merge it with your local settings. Continue?')) {
                try {
                    await window.storageManager.migrate(false, 'merge');
                    await window.customAlert('Sync Success', 'Cloud data merged successfully! Reloading...');
                    location.reload();
                } catch (err) {
                    window.customAlert('Sync Failed', 'Could not pull data: ' + err.message);
                }
            }
        });
    }

    // Init Weather
    weatherManager.init();

    // Init Cursor Trail
    const cursorTrail = new window.CursorTrail();
    cursorTrail.init();

    // Settings toggles for features
    const cursorTrailToggle = document.getElementById('cursor-trail-toggle');

    // Load initial toggle states
    (async () => {
        const stored = await window.storageManager.get(['cursorTrailEnabled']);
        if (cursorTrailToggle) cursorTrailToggle.checked = stored.cursorTrailEnabled !== false;
    })();

    if (cursorTrailToggle) {
        cursorTrailToggle.addEventListener('change', () => {
            cursorTrail.toggle(cursorTrailToggle.checked);
        });
    }

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
            this.gradientColorsGroup = document.getElementById('gradient-colors-group');
            this.gradientSwatches = document.getElementById('gradient-swatches');
            this.exportJsonBtn = document.getElementById('export-json-btn');
            this.exportCsvBtn = document.getElementById('export-csv-btn');
            this.exportCssBtn = document.getElementById('export-css-btn');

            this.state = {
                type: 'weather',
                query: 'Nature',
                interval: 60 // Default 60 seconds
            };
            this.rotationInterval = null;
            this.currentSlideIndex = 0;

            // Interactive Gradient Properties
            this.mousePos = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            };
            this.curMousePos = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            };
            this.interactiveReqId = null;
            this.blobs = [];
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
                    } else {
                        // Bug Fix: Clear weather effects container
                        const effects = document.getElementById('weather-effects');
                        if (effects) effects.innerHTML = '';
                    }
                });
            }

            if (this.exportJsonBtn) {
                this.exportJsonBtn.addEventListener('click', () => this.exportColors('json'));
            }
            if (this.exportCsvBtn) {
                this.exportCsvBtn.addEventListener('click', () => this.exportColors('csv'));
            }
            if (this.exportCssBtn) {
                this.exportCssBtn.addEventListener('click', () => this.exportColors('css'));
            }

            window.addEventListener('gradientColorsChanged', (e) => {
                this.updateSwatches(e.detail);
            });

            window.addEventListener('mousemove', (e) => {
                this.mousePos.x = e.clientX;
                this.mousePos.y = e.clientY;
            });

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

                if (this.gradientColorsGroup) {
                    this.gradientColorsGroup.classList.remove('hidden');
                }
            } else {
                this.bgQueryGroup.classList.remove('hidden');
                if (this.gradientColorsGroup) {
                    this.gradientColorsGroup.classList.add('hidden');
                }

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
                this.stopInteractiveGradient();
                this.mediaBg.innerHTML = ''; // Clean up media
            } else if (this.state.type === 'gradient') {
                this.mediaBg.classList.remove('hidden');
                this.weatherBlobs.classList.add('hidden');
                this.bgOverlay.style.background = 'rgba(0,0,0,0.1)';

                // Bug Fix: Ensure weather effects are cleared when switching to gradient
                const effects = document.getElementById('weather-effects');
                if (effects) effects.innerHTML = '';

                this.stopRotation();
                this.initInteractiveGradient();

                // Update swatches immediately
                if (this.webglApp) {
                    this.updateSwatches(this.webglApp.getColors());
                }

                const intervalMs = (this.state.interval || 60) * 1000;
                this.rotationInterval = setInterval(() => {
                    this.updateInteractiveColors();
                }, intervalMs);
            } else {
                this.mediaBg.classList.remove('hidden');
                this.weatherBlobs.classList.add('hidden');
                this.bgOverlay.style.background = 'rgba(0,0,0,0.3)';

                // Bug Fix: Ensure weather effects are cleared when switching to image
                const effects = document.getElementById('weather-effects');
                if (effects) effects.innerHTML = '';

                this.stopInteractiveGradient();
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

        initInteractiveGradient() {
            this.stopInteractiveGradient();
            this.mediaBg.innerHTML = '';
            this.mediaBg.classList.add('hidden');

            // Show & initialize WebGL gradient container
            this.webglGradientContainer = document.getElementById('webgl-gradient-container');
            this.webglGradientContainer.classList.remove('hidden');
            this.webglGradientContainer.innerHTML = '';

            if (window.WebGLGradientApp) {
                this.webglApp = new window.WebGLGradientApp(this.webglGradientContainer);
                this.webglApp.init();
            }
        }

        updateInteractiveColors() {
            // Change gradient colors based on interval timer
            if (this.webglApp && this.webglApp.randomizeColors) {
                this.webglApp.randomizeColors();
            }
        }

        animateInteractive() {
            // Animation is handled by WebGLGradientApp.tick()
        }

        stopInteractiveGradient() {
            if (this.webglApp) {
                this.webglApp.dispose();
                this.webglApp = null;
            }
            const container = document.getElementById('webgl-gradient-container');
            if (container) {
                container.classList.add('hidden');
                container.innerHTML = '';
            }
        }

        updateSwatches(colors) {
            if (!this.gradientSwatches || !colors) return;
            const swatches = this.gradientSwatches.querySelectorAll('.color-swatch');
            colors.forEach((color, i) => {
                if (swatches[i]) {
                    swatches[i].style.background = color;
                    swatches[i].title = color; // Show hex on hover
                }
            });
        }

        loadRandomGradient() {
            // Not used for WebGL gradient
        }

        exportColors(format) {
            if (!this.webglApp) return;
            const colors = this.webglApp.getColors();
            if (!colors || colors.length === 0) return;

            let content = '';
            let filename = `gradient-palette.${format}`;
            let mimeType = 'text/plain';

            switch (format) {
                case 'json':
                    content = JSON.stringify(colors, null, 2);
                    mimeType = 'application/json';
                    break;
                case 'csv':
                    content = colors.join(',');
                    mimeType = 'text/csv';
                    break;
                case 'css':
                    content = ':root {\n';
                    colors.forEach((color, i) => {
                        content += `  --gradient-color-${i + 1}: ${color};\n`;
                    });
                    content += '}';
                    mimeType = 'text/css';
                    break;
            }

            this.downloadFile(content, filename, mimeType);
        }

        downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], {
                type: mimeType
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
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
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        // Background Config Sync
        if (changes.bgConfig) {
            bgManager.state = changes.bgConfig.newValue;
            bgManager.applyState();
        }

        // Recent Sites Limit Sync
        if (changes.recentSitesLimit) {
            window.recentSitesLimit = parseInt(changes.recentSitesLimit.newValue);
            if (recentSitesLimitInput) recentSitesLimitInput.value = window.recentSitesLimit;
            renderTopSites();
        }

        // Shortcuts Sync
        if (changes.shortcuts) {
            await renderShortcuts();
        }

        // My Sites Sync
        if (changes.mySites) {
            await renderMySites();
        }

        // Search Engine Sync
        if (changes.searchEngine) {
            currentSearchEngine = changes.searchEngine.newValue;
            applySearchEngine();
        }

        // Widget States Sync
        if (changes.spotifyState) {
            spotifyState = changes.spotifyState.newValue;
            applySpotifyState();
        }
        if (changes.footballState) {
            footballState = changes.footballState.newValue;
            applyFootballState();
        }
        if (changes.todoState) {
            todoState = changes.todoState.newValue;
            applyTodoState();
            renderTodos();
        }
        if (changes.notesState) {
            const oldContent = notesState.content;
            notesState = changes.notesState.newValue;
            applyNotesState();
            if (notesState.content !== oldContent) {
                notesInput.value = notesState.content;
            }
        }
        if (changes.techNewsState) {
            techNewsState = changes.techNewsState.newValue;
            applyTechNewsState();
        }
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

        // Drag state
        let draggedItem = null;
        let draggedIndex = -1;

        sites.forEach((site, index) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';
            item.draggable = true;
            item.dataset.index = index;
            item.dataset.id = site.id;
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.padding = '10px';
            item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            item.style.cursor = 'grab';
            item.style.transition = 'background 0.2s ease, transform 0.2s ease';

            const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=32`;

            const linkDiv = document.createElement('div');
            linkDiv.style.display = 'flex';
            linkDiv.style.alignItems = 'center';
            linkDiv.style.gap = '10px';
            linkDiv.style.pointerEvents = 'none'; // Allow drag on parent
            linkDiv.innerHTML = `
                <svg class="drag-handle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="flex-shrink: 0; cursor: grab;">
                    <circle cx="9" cy="5" r="1.5" fill="rgba(255,255,255,0.4)"/>
                    <circle cx="15" cy="5" r="1.5" fill="rgba(255,255,255,0.4)"/>
                    <circle cx="9" cy="12" r="1.5" fill="rgba(255,255,255,0.4)"/>
                    <circle cx="15" cy="12" r="1.5" fill="rgba(255,255,255,0.4)"/>
                    <circle cx="9" cy="19" r="1.5" fill="rgba(255,255,255,0.4)"/>
                    <circle cx="15" cy="19" r="1.5" fill="rgba(255,255,255,0.4)"/>
                </svg>
                <img src="${iconUrl}" width="16" height="16" style="border-radius: 4px;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${site.title}</span>
            `;

            const delBtn = document.createElement('button');
            delBtn.innerHTML = '×';
            delBtn.style.background = 'transparent';
            delBtn.style.border = 'none';
            delBtn.style.color = '#ff4081';
            delBtn.style.fontSize = '1.2rem';
            delBtn.style.cursor = 'pointer';
            delBtn.style.pointerEvents = 'auto';
            delBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (await window.customConfirm('Remove Site', 'Are you sure you want to remove this site from your list?')) {
                    removeMySite(site.id);
                }
            };

            // Click to navigate (only if not dragging)
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && !item.classList.contains('dragging')) {
                    window.location.href = site.url;
                }
            });

            // Drag events
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                draggedIndex = index;
                item.classList.add('dragging');
                item.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                item.style.opacity = '1';
                draggedItem = null;
                draggedIndex = -1;
                // Remove all drag-over styles
                mySitesList.querySelectorAll('.menu-list-item').forEach(el => {
                    el.style.borderTop = '';
                    el.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const targetIndex = parseInt(item.dataset.index);
                if (draggedIndex !== targetIndex) {
                    // Visual feedback
                    item.style.borderTop = '2px solid #4facfe';
                }
            });

            item.addEventListener('dragleave', () => {
                item.style.borderTop = '';
            });

            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = parseInt(item.dataset.index);

                if (fromIndex !== toIndex) {
                    // Reorder the sites array
                    const sitesArr = await getMySites();
                    const [movedSite] = sitesArr.splice(fromIndex, 1);
                    sitesArr.splice(toIndex, 0, movedSite);

                    // Save new order
                    await window.storageManager.set({
                        mySites: sitesArr
                    });
                    renderMySites();
                }
            });

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

        // Drag state
        let draggedCard = null;
        let draggedIndex = -1;

        shortcuts.forEach((shortcut, index) => {
            const card = document.createElement('div');
            card.className = 'shortcut-card';
            card.draggable = true;
            card.dataset.index = index;
            card.dataset.id = shortcut.id;

            card.innerHTML = `
                <img src="${shortcut.icon}" alt="${shortcut.title}" class="shortcut-icon" onerror="this.src='icon-placeholder.png'">
                <div class="shortcut-title">${shortcut.title}</div>
                <div class="actions">
                    <button class="edit-btn" data-id="${shortcut.id}">✎</button>
                    <button class="delete-btn" data-id="${shortcut.id}">×</button>
                </div>
            `;

            // Navigation handler (only if not dragging)
            card.addEventListener('click', (e) => {
                if (!e.target.closest('button') && !card.classList.contains('dragging')) {
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

            // Drag events
            card.addEventListener('dragstart', (e) => {
                draggedCard = card;
                draggedIndex = index;
                card.classList.add('dragging');
                card.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                card.style.opacity = '1';
                draggedCard = null;
                draggedIndex = -1;
                // Remove all drag-over styles
                shortcutsGrid.querySelectorAll('.shortcut-card').forEach(el => {
                    el.classList.remove('drag-over');
                });
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const targetIndex = parseInt(card.dataset.index);
                if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
                    card.classList.add('drag-over');
                }
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = parseInt(card.dataset.index);

                if (fromIndex !== toIndex) {
                    // Reorder shortcuts array
                    const allShortcuts = await getShortcuts();
                    const [movedShortcut] = allShortcuts.splice(fromIndex, 1);
                    allShortcuts.splice(toIndex, 0, movedShortcut);

                    // Save new order (syncs across devices)
                    await window.storageManager.set({
                        shortcuts: allShortcuts
                    });
                    renderShortcuts();
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
    const sportSelect = document.getElementById('sport-select');


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
        selectedSport: 'soccer', // Default Soccer
        favoriteTeam: '' // User's pinned team
    };

    const sportLeagues = {
        soccer: [{
                value: 'eng.1',
                name: 'Premier League'
            },
            {
                value: 'eng.fa',
                name: 'FA Cup'
            },
            {
                value: 'eng.league_cup',
                name: 'EFL Cup'
            },
            {
                value: 'uefa.champions',
                name: 'Champions League'
            },
            {
                value: 'esp.1',
                name: 'La Liga'
            },
            {
                value: 'ger.1',
                name: 'Bundesliga'
            },
            {
                value: 'ita.1',
                name: 'Serie A'
            },
            {
                value: 'fra.1',
                name: 'Ligue 1'
            }
        ],
        football: [{
                value: 'nfl',
                name: 'NFL'
            },
            {
                value: 'college-football',
                name: 'NCAAF'
            }
        ],
        basketball: [{
                value: 'nba',
                name: 'NBA'
            },
            {
                value: 'mens-college-basketball',
                name: 'NCAAB'
            },
            {
                value: 'wnba',
                name: 'WNBA'
            }
        ],
        boxing: [{
                value: 'boxing',
                name: 'Boxing'
            }
        ]
    };

    let footballInterval = null;
    let liveStatsInterval = null;
    let activeLiveStatsEventId = null;
    let latestSportsEvents = [];

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
            stopLiveStatsUpdates();
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

        // Sport Select
        if (sportSelect && sportSelect.value !== footballState.selectedSport) {
            sportSelect.value = footballState.selectedSport;
            updateLeagueOptions();
        }
        updateFavoriteTeamVisibility();

        // League Select
        if (footballLeagueSelect.value !== footballState.selectedLeague) {
            footballLeagueSelect.value = footballState.selectedLeague;
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
            stopLiveStatsUpdates();
            fetchScores(footballState.selectedSport, footballState.selectedLeague);
        });

    if (sportSelect) {
        sportSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            bringToFront(footballWidget);
            footballState.zIndex = maxZIndex;

            footballState.selectedSport = e.target.value;
            // Set default league for sport
            footballState.selectedLeague = sportLeagues[footballState.selectedSport][0].value;

            updateLeagueOptions();
            updateFavoriteTeamVisibility();
            saveFootballState();
            stopLiveStatsUpdates();
            fetchScores(footballState.selectedSport, footballState.selectedLeague);
        });
    }

    function updateLeagueOptions() {
        if (!sportSelect || !footballLeagueSelect) return;
        const leagues = sportLeagues[footballState.selectedSport] || [];
        footballLeagueSelect.innerHTML = leagues.map(l => `<option value="${l.value}">${l.name}</option>`).join('');
        footballLeagueSelect.value = footballState.selectedLeague;
        footballLeagueSelect.classList.toggle('hidden', leagues.length <= 1);
    }

    function updateFavoriteTeamVisibility() {
        const favoriteTeamGroup = favoriteTeamInput?.closest('.favorite-team-group');
        if (!favoriteTeamGroup) return;
        favoriteTeamGroup.classList.toggle('hidden', footballState.selectedSport !== 'soccer');
    }

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
    async function fetchScores(sport, leagueCode) {
        if (!footballState.isOpen) return;

        footballLoading.style.display = 'block';
        footballLoading.textContent = 'Loading...';
        if (footballMatches.children.length === 0) {
            footballLoading.style.display = 'block';
        }

        try {
            // Mapping for ESPN API types
            let sportType = sport; // nfl/nba/soccer
            if (sport === 'soccer') {
                // Soccer endpoint is slightly different: soccer/{league}/scoreboard
            } else if (sport === 'football') {
                // NFL/College endpoint: football/nfl/scoreboard
            } else if (sport === 'basketball') {
                // NBA/NCAA endpoint: basketball/nba/scoreboard
            }

            const url = getSportsApiPath(sportType, leagueCode, 'scoreboard');
            const response = await fetch(url);
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
        latestSportsEvents = data.events || [];

        if (!latestSportsEvents.length) {
            footballMatches.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">No matches today</div>';
            return;
        }

        const favName = (footballState.favoriteTeam || '').toLowerCase();

        // Sort events: put matches with favorite team at the top
        const sortedEvents = [...latestSportsEvents].sort((a, b) => {
            const aLive = a.status?.type?.state === 'in';
            const bLive = b.status?.type?.state === 'in';
            if (aLive && !bLive) return -1;
            if (!aLive && bLive) return 1;
            if (!favName) return 0;
            const aHasFav = a.name.toLowerCase().includes(favName);
            const bHasFav = b.name.toLowerCase().includes(favName);
            if (aHasFav && !bHasFav) return -1;
            if (!aHasFav && bHasFav) return 1;
            return 0;
        });

        sortedEvents.forEach(event => {
            const competition = event.competitions?.[0] || {};
            const competitors = competition.competitors || [];
            const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
            const away = competitors.find(c => c.homeAway === 'away') || competitors[1];
            const status = event.status?.type?.shortDetail || event.status?.type?.detail || '';
            const isLive = event.status?.type?.state === 'in';
            const isLiveStatsOpen = activeLiveStatsEventId === event.id;

            const isFavored = favName && (
                getCompetitorName(home).toLowerCase().includes(favName) ||
                getCompetitorShortName(home).toLowerCase().includes(favName) ||
                getCompetitorName(away).toLowerCase().includes(favName) ||
                getCompetitorShortName(away).toLowerCase().includes(favName)
            );

            // Time logic
            let timeDisplay = status;
            if (event.status?.type?.state === 'pre') {
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
                    <span>${escapeHtml(event.leagueName || event.season?.year || '')}</span> 
                </div>
                <div class="match-teams">
                    <div class="team-row">
                        <div class="team-info">
                            ${getCompetitorLogo(home)}
                            <span>${escapeHtml(getCompetitorShortName(home))}</span>
                        </div>
                        <span class="team-score">${home ? home.score || '0' : '-'}</span>
                    </div>
                    <div class="team-row">
                        <div class="team-info">
                            ${getCompetitorLogo(away)}
                            <span>${escapeHtml(getCompetitorShortName(away))}</span>
                        </div>
                        <span class="team-score">${away ? away.score || '0' : '-'}</span>
                    </div>
                </div>
                ${isLive ? `<button class="live-stats-btn" type="button" data-event-id="${event.id}">${isLiveStatsOpen ? 'Hide live stats' : 'View live stats'}</button>` : ''}
                <div class="live-stats-panel ${isLiveStatsOpen ? '' : 'hidden'}" id="live-stats-${event.id}">
                    ${isLiveStatsOpen ? '<div class="live-stats-loading">Loading live stats...</div>' : ''}
                </div>
            `;
            footballMatches.appendChild(item);
        });

        footballMatches.querySelectorAll('.live-stats-btn').forEach(button => {
            button.addEventListener('click', () => toggleLiveStats(button.dataset.eventId));
        });

        if (activeLiveStatsEventId) {
            const activeEventStillLive = latestSportsEvents.some(event => event.id === activeLiveStatsEventId && event.status?.type?.state === 'in');
            if (activeEventStillLive) {
                fetchLiveStats(activeLiveStatsEventId);
            } else {
                stopLiveStatsUpdates();
            }
        }
    }

    function getCompetitorName(competitor) {
        return competitor?.team?.displayName || competitor?.athlete?.displayName || competitor?.displayName || 'TBD';
    }

    function getCompetitorShortName(competitor) {
        return competitor?.team?.shortDisplayName || competitor?.athlete?.shortName || competitor?.athlete?.displayName || getCompetitorName(competitor);
    }

    function getCompetitorLogo(competitor) {
        const logo = competitor?.team?.logo || competitor?.athlete?.headshot?.href || '';
        if (!logo) return '<span class="team-logo team-logo-placeholder"></span>';
        return `<img src="${escapeHtml(logo)}" class="team-logo" onerror="this.style.visibility='hidden'">`;
    }

    function getSportsApiPath(sport, leagueCode, endpoint) {
        return `https://site.api.espn.com/apis/site/v2/sports/${sport}/${leagueCode}/${endpoint}`;
    }

    function toggleLiveStats(eventId) {
        if (activeLiveStatsEventId === eventId) {
            stopLiveStatsUpdates();
            renderMatches({
                events: latestSportsEvents
            });
            return;
        }

        activeLiveStatsEventId = eventId;
        if (liveStatsInterval) clearInterval(liveStatsInterval);
        liveStatsInterval = setInterval(() => fetchLiveStats(eventId), 20000);
        renderMatches({
            events: latestSportsEvents
        });
        fetchLiveStats(eventId);
    }

    async function fetchLiveStats(eventId) {
        const panel = document.getElementById(`live-stats-${eventId}`);
        if (!panel) return;
        panel.classList.remove('hidden');
        panel.innerHTML = '<div class="live-stats-loading">Loading live stats...</div>';

        try {
            const url = `${getSportsApiPath(footballState.selectedSport, footballState.selectedLeague, 'summary')}?event=${encodeURIComponent(eventId)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Live stats unavailable');
            const data = await response.json();
            panel.innerHTML = renderLiveStats(data);
        } catch (error) {
            panel.innerHTML = '<div class="live-stats-empty">Live stats are not available for this event yet.</div>';
        }
    }

    function renderLiveStats(data) {
        const event = data.header?.competitions?.[0] || data.boxscore;
        const status = data.header?.competitions?.[0]?.status?.type?.shortDetail || data.header?.competitions?.[0]?.status?.type?.detail || '';
        const situation = data.situation;
        const scoringPlays = data.scoringPlays || [];
        const boxscoreTeams = data.boxscore?.teams || [];
        const leaders = data.leaders || [];
        const details = [];

        if (status) details.push(`<div class="live-stat-row"><span>Status</span><strong>${escapeHtml(status)}</strong></div>`);
        if (situation?.shortDownDistanceText) details.push(`<div class="live-stat-row"><span>Situation</span><strong>${escapeHtml(situation.shortDownDistanceText)}</strong></div>`);
        if (situation?.possessionText) details.push(`<div class="live-stat-row"><span>Possession</span><strong>${escapeHtml(situation.possessionText)}</strong></div>`);
        if (event?.venue?.fullName) details.push(`<div class="live-stat-row"><span>Venue</span><strong>${escapeHtml(event.venue.fullName)}</strong></div>`);

        const teamStats = boxscoreTeams.map(team => {
            const stats = (team.statistics || []).slice(0, 4).map(stat => `
                <div class="live-stat-row"><span>${escapeHtml(stat.label || stat.name)}</span><strong>${escapeHtml(stat.displayValue || stat.value || '-')}</strong></div>
            `).join('');
            return stats ? `<div class="live-stats-group"><h4>${escapeHtml(team.team?.shortDisplayName || team.team?.displayName || 'Team')}</h4>${stats}</div>` : '';
        }).join('');

        const leaderRows = leaders.slice(0, 3).map(group => {
            const athlete = group.leaders?.[0];
            if (!athlete) return '';
            const athleteName = athlete.athlete?.displayName || athlete.athlete?.shortName || '';
            const statValue = athlete.displayValue || '';
            // Skip if we don't have a real name — avoids rendering 'undefined'
            if (!athleteName && !statValue) return '';
            const label = escapeHtml(group.displayName || group.name || '');
            const value = athleteName
                ? `${escapeHtml(athleteName)}${statValue ? ' · ' + escapeHtml(statValue) : ''}`
                : escapeHtml(statValue);
            return `<div class="live-stat-row"><span>${label}</span><strong>${value}</strong></div>`;
        }).filter(Boolean).join('');

        const playRows = scoringPlays.slice(-3).reverse().map(play => `
            <div class="live-play">
                <strong>${escapeHtml(play.period?.displayValue || play.clock?.displayValue || 'Update')}</strong>
                <span>${escapeHtml(play.text || play.shortText || '')}</span>
            </div>
        `).join('');

        const empty = !details.length && !teamStats && !leaderRows && !playRows;
        if (empty) return '<div class="live-stats-empty">No extra live stats are available from the free feed yet.</div>';

        return `
            <div class="live-stats-card">
                ${details.join('')}
                ${teamStats}
                ${leaderRows ? `<div class="live-stats-group"><h4>Leaders</h4>${leaderRows}</div>` : ''}
                ${playRows ? `<div class="live-stats-group"><h4>Recent scoring</h4>${playRows}</div>` : ''}
            </div>
        `;
    }

    function stopLiveStatsUpdates() {
        if (liveStatsInterval) clearInterval(liveStatsInterval);
        liveStatsInterval = null;
        activeLiveStatsEventId = null;
    }


    function startFootballUpdates() {
        if (footballInterval) clearInterval(footballInterval);
        fetchScores(footballState.selectedSport, footballState.selectedLeague);
        footballInterval = setInterval(() => {
            fetchScores(footballState.selectedSport, footballState.selectedLeague);
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

    // --- GitHub Repos Widget Logic ---
    const githubReposBtn = document.getElementById('github-repos-btn');
    const githubReposWidget = document.getElementById('github-repos-widget');
    const githubReposHeader = document.getElementById('github-repos-header');
    const githubReposMinimize = document.getElementById('github-repos-minimize');
    const githubReposRefresh = document.getElementById('github-repos-refresh');
    const githubReposList = document.getElementById('github-repos-list');
    const githubReposLoading = document.getElementById('github-repos-loading');
    const githubReposTabs = Array.from(document.querySelectorAll('.github-repos-tab'));

    const githubRepoCategories = {
        popular: { label: 'Popular', trendingLang: '' },
        ai: { label: 'AI', trendingLang: 'python' },
        webDesign: { label: 'Web Design', trendingLang: 'javascript' },
        developerTools: { label: 'Dev Tools', trendingLang: 'go' }
    };
    const githubReposCacheTtl = 4 * 60 * 60 * 1000; // 4 hours — generous to avoid any API calls

    // Curated fallback repos per category (shown when trending fetch fails)
    const githubCuratedRepos = {
        popular: [
            { name: 'microsoft/vscode', url: 'https://github.com/microsoft/vscode', language: 'TypeScript', stars: 165000, forks: 29000, updated: '1h', analysis: 'The most popular open-source code editor. Powers VS Code and GitHub Codespaces.', topics: ['editor','ide','typescript'] },
            { name: 'torvalds/linux', url: 'https://github.com/torvalds/linux', language: 'C', stars: 182000, forks: 53000, updated: '1h', analysis: 'Linux kernel source tree. The most influential open-source project in history.', topics: ['os','kernel','c'] },
            { name: 'facebook/react', url: 'https://github.com/facebook/react', language: 'JavaScript', stars: 228000, forks: 46000, updated: '2h', analysis: 'The library for web and native user interfaces from Meta.', topics: ['ui','frontend','jsx'] },
            { name: 'vercel/next.js', url: 'https://github.com/vercel/next.js', language: 'JavaScript', stars: 127000, forks: 27000, updated: '1h', analysis: 'The React Framework for the Web. Supports SSR, SSG and App Router.', topics: ['react','ssr','framework'] },
            { name: 'golang/go', url: 'https://github.com/golang/go', language: 'Go', stars: 124000, forks: 17000, updated: '2h', analysis: 'The Go programming language official repository.', topics: ['go','lang','systems'] },
            { name: 'rust-lang/rust', url: 'https://github.com/rust-lang/rust', language: 'Rust', stars: 98000, forks: 12000, updated: '1h', analysis: 'Empowering everyone to build reliable and efficient software.', topics: ['rust','lang','systems'] },
            { name: 'tensorflow/tensorflow', url: 'https://github.com/tensorflow/tensorflow', language: 'C++', stars: 186000, forks: 74000, updated: '3h', analysis: 'An end-to-end open source platform for machine learning.', topics: ['ml','ai','python'] },
            { name: 'denoland/deno', url: 'https://github.com/denoland/deno', language: 'Rust', stars: 95000, forks: 5000, updated: '2h', analysis: 'A modern runtime for JavaScript and TypeScript.', topics: ['runtime','js','ts'] }
        ],
        ai: [
            { name: 'ollama/ollama', url: 'https://github.com/ollama/ollama', language: 'Go', stars: 90000, forks: 7000, updated: '1h', analysis: 'Get up and running with large language models locally. Supports Llama 3, Mistral, Gemma and more.', topics: ['llm','local-ai','ollama'] },
            { name: 'Significant-Gravitas/AutoGPT', url: 'https://github.com/Significant-Gravitas/AutoGPT', language: 'Python', stars: 168000, forks: 44000, updated: '2h', analysis: 'AutoGPT is the vision of accessible AI for everyone, to use and to build on.', topics: ['agents','gpt','automation'] },
            { name: 'huggingface/transformers', url: 'https://github.com/huggingface/transformers', language: 'Python', stars: 133000, forks: 26000, updated: '1h', analysis: 'State-of-the-art Machine Learning for JAX, PyTorch and TensorFlow.', topics: ['nlp','ml','bert'] },
            { name: 'langchain-ai/langchain', url: 'https://github.com/langchain-ai/langchain', language: 'Python', stars: 93000, forks: 15000, updated: '1h', analysis: 'Build context-aware reasoning applications with LLMs.', topics: ['llm','agents','rag'] },
            { name: 'comfyanonymous/ComfyUI', url: 'https://github.com/comfyanonymous/ComfyUI', language: 'Python', stars: 57000, forks: 6000, updated: '2h', analysis: 'A powerful and modular stable diffusion GUI and backend.', topics: ['stable-diffusion','image-gen','nodes'] },
            { name: 'ggerganov/llama.cpp', url: 'https://github.com/ggerganov/llama.cpp', language: 'C++', stars: 66000, forks: 9500, updated: '1h', analysis: 'LLM inference in C/C++. Run Llama models on CPU.', topics: ['llama','inference','cpp'] },
            { name: 'microsoft/autogen', url: 'https://github.com/microsoft/autogen', language: 'Python', stars: 34000, forks: 5000, updated: '3h', analysis: 'A framework for building multi-agent AI applications.', topics: ['agents','llm','microsoft'] },
            { name: 'deepseek-ai/DeepSeek-V3', url: 'https://github.com/deepseek-ai/DeepSeek-V3', language: 'Python', stars: 45000, forks: 7000, updated: '2h', analysis: 'DeepSeek-V3 technical report and model weights.', topics: ['llm','deepseek','moe'] }
        ],
        webDesign: [
            { name: 'tailwindlabs/tailwindcss', url: 'https://github.com/tailwindlabs/tailwindcss', language: 'CSS', stars: 83000, forks: 4200, updated: '2h', analysis: 'A utility-first CSS framework for rapid UI development.', topics: ['css','design','tailwind'] },
            { name: 'shadcn-ui/ui', url: 'https://github.com/shadcn-ui/ui', language: 'TypeScript', stars: 73000, forks: 4500, updated: '1h', analysis: 'Beautifully designed components built with Radix UI and Tailwind CSS.', topics: ['components','react','design-system'] },
            { name: 'animate-css/animate.css', url: 'https://github.com/animate-css/animate.css', language: 'CSS', stars: 80000, forks: 16000, updated: '5h', analysis: 'A cross-browser library of CSS animations. Just add the class to elements.', topics: ['animation','css'] },
            { name: 'gsap/gsap', url: 'https://github.com/greensock/GSAP', language: 'JavaScript', stars: 19000, forks: 900, updated: '3h', analysis: 'Professional-grade animation for the modern web.', topics: ['animation','js','gsap'] },
            { name: 'radix-ui/primitives', url: 'https://github.com/radix-ui/primitives', language: 'TypeScript', stars: 15000, forks: 900, updated: '2h', analysis: 'Accessible, unstyled UI primitives for React.', topics: ['a11y','react','headless'] },
            { name: 'storybookjs/storybook', url: 'https://github.com/storybookjs/storybook', language: 'TypeScript', stars: 83000, forks: 9100, updated: '1h', analysis: 'Build UI components and pages in isolation.', topics: ['components','ui','testing'] },
            { name: 'prettier/prettier', url: 'https://github.com/prettier/prettier', language: 'JavaScript', stars: 48000, forks: 4000, updated: '4h', analysis: 'Opinionated Code Formatter for consistent style across JS/TS projects.', topics: ['formatter','js','tooling'] },
            { name: 'vitejs/vite', url: 'https://github.com/vitejs/vite', language: 'TypeScript', stars: 68000, forks: 6200, updated: '1h', analysis: 'Next generation frontend tooling. Blazing fast dev server and HMR.', topics: ['bundler','frontend','hmr'] }
        ],
        developerTools: [
            { name: 'neovim/neovim', url: 'https://github.com/neovim/neovim', language: 'C', stars: 83000, forks: 5700, updated: '1h', analysis: 'Vim-fork focused on extensibility and usability.', topics: ['editor','vim','lua'] },
            { name: 'BurntSushi/ripgrep', url: 'https://github.com/BurntSushi/ripgrep', language: 'Rust', stars: 48000, forks: 2000, updated: '3h', analysis: 'Recursively searches directories for a regex pattern. Faster than grep.', topics: ['search','cli','rust'] },
            { name: 'junegunn/fzf', url: 'https://github.com/junegunn/fzf', language: 'Go', stars: 65000, forks: 2400, updated: '2h', analysis: 'A command-line fuzzy finder for files, history, and anything else.', topics: ['cli','fuzzy','shell'] },
            { name: 'cli/cli', url: 'https://github.com/cli/cli', language: 'Go', stars: 37000, forks: 5500, updated: '1h', analysis: "GitHub's official command-line tool. gh brings GitHub to your terminal.", topics: ['github','cli','go'] },
            { name: 'astral-sh/uv', url: 'https://github.com/astral-sh/uv', language: 'Rust', stars: 37000, forks: 1100, updated: '1h', analysis: 'An extremely fast Python package installer and resolver, written in Rust.', topics: ['python','package-manager','rust'] },
            { name: 'jesseduffield/lazygit', url: 'https://github.com/jesseduffield/lazygit', language: 'Go', stars: 52000, forks: 1900, updated: '2h', analysis: 'Simple terminal UI for git commands. Makes complex git operations easy.', topics: ['git','tui','go'] },
            { name: 'biomejs/biome', url: 'https://github.com/biomejs/biome', language: 'Rust', stars: 15000, forks: 500, updated: '1h', analysis: 'A toolchain for web projects. Linter, formatter, and more. Replaces ESLint + Prettier.', topics: ['linter','formatter','rust'] },
            { name: 'docker/compose', url: 'https://github.com/docker/compose', language: 'Go', stars: 34000, forks: 5400, updated: '2h', analysis: 'Define and run multi-container applications with Docker.', topics: ['docker','devops','containers'] }
        ]
    };

    let githubReposState = {
        isOpen: false,
        x: null,
        y: null,
        zIndex: 100,
        activeCategory: 'popular',
        lastFetched: null
    };
    let githubReposCache = {};

    Promise.all([
        window.storageManager.get(['githubReposState']),
        window.storageManager.getLocal(['githubReposCache'])
    ]).then(([result, cacheResult]) => {
        if (result.githubReposState) {
            githubReposState = {
                ...githubReposState,
                ...result.githubReposState
            };
        }
        if (cacheResult.githubReposCache) {
            githubReposCache = cacheResult.githubReposCache;
        }
        applyGithubReposState();
        if (githubReposState.isOpen) fetchGithubRepos(githubReposState.activeCategory);
    });

    function saveGithubReposState() {
        window.storageManager.set({
            githubReposState
        });
    }

    function saveGithubReposCache() {
        window.storageManager.setLocal({
            githubReposCache
        }).catch(() => {
            // Cache failures should not break the widget; fetching can still work.
        });
    }

    function getFreshGithubReposCache(categoryKey) {
        const cached = githubReposCache[categoryKey];
        if (!cached || !Array.isArray(cached.repos) || !cached.fetchedAt) return null;
        if (Date.now() - cached.fetchedAt > githubReposCacheTtl) return null;
        return cached;
    }

    function applyGithubReposState() {
        if (!githubReposWidget) return;
        if (githubReposState.isOpen) {
            githubReposWidget.classList.remove('hidden');
            if (githubReposBtn) githubReposBtn.classList.add('active');
        } else {
            githubReposWidget.classList.add('hidden');
            if (githubReposBtn) githubReposBtn.classList.remove('active');
        }
        if (githubReposState.x !== null && githubReposState.y !== null) {
            githubReposWidget.style.left = githubReposState.x + 'px';
            githubReposWidget.style.top = githubReposState.y + 'px';
            githubReposWidget.style.bottom = 'auto';
            githubReposWidget.style.right = 'auto';
        }
        if (githubReposState.zIndex) {
            githubReposWidget.style.zIndex = githubReposState.zIndex;
            if (githubReposState.zIndex > maxZIndex) maxZIndex = githubReposState.zIndex;
        }
        githubReposTabs.forEach(tab => {
            const isActive = tab.dataset.githubCategory === githubReposState.activeCategory;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    async function fetchGithubRepos(categoryKey = githubReposState.activeCategory, forceRefresh = false) {
        if (!githubReposLoading || !githubReposList) return;
        const category = githubRepoCategories[categoryKey] || githubRepoCategories.popular;
        githubReposState.activeCategory = categoryKey;
        applyGithubReposState();

        const cached = getFreshGithubReposCache(categoryKey);
        if (!forceRefresh && cached) {
            renderGithubRepos(cached.repos, category);
            return;
        }

        githubReposLoading.classList.remove('hidden');
        githubReposList.innerHTML = '';
        if (githubReposRefresh) githubReposRefresh.disabled = true;
        try {
            // Try GitHub Trending RSS via a CORS proxy (no auth required, not rate limited like Search API)
            const lang = githubRepoCategories[categoryKey]?.trendingLang || '';
            const trendUrl = `https://github.com/trending${lang ? '/' + lang : ''}?since=weekly`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(trendUrl)}`;
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const json = await res.json();
                const parsed = parseTrendingHtml(json.contents || '', categoryKey);
                if (parsed.length >= 3) {
                    githubReposCache[categoryKey] = { fetchedAt: Date.now(), repos: parsed };
                    renderGithubRepos(parsed, category);
                    githubReposState.lastFetched = Date.now();
                    saveGithubReposState();
                    saveGithubReposCache();
                    return;
                }
            }
        } catch (_) { /* fall through to curated list */ }
        // Always-available curated fallback — never shows a rate limit error
        const curated = githubCuratedRepos[categoryKey] || githubCuratedRepos.popular;
        githubReposCache[categoryKey] = { fetchedAt: Date.now(), repos: curated };
        renderGithubRepos(curated, category);
        githubReposState.lastFetched = Date.now();
        saveGithubReposState();
        saveGithubReposCache();
        githubReposLoading.classList.add('hidden');
        if (githubReposRefresh) githubReposRefresh.disabled = false;
    }

    function parseTrendingHtml(html, categoryKey) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = Array.from(doc.querySelectorAll('article.Box-row'));
        return rows.slice(0, 10).map(row => {
            const nameEl = row.querySelector('h2 a');
            const name = (nameEl?.getAttribute('href') || '').replace(/^\//, '');
            const url = name ? `https://github.com/${name}` : 'https://github.com/trending';
            const description = row.querySelector('p')?.textContent?.trim() || 'A trending GitHub repository.';
            const language = row.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || 'Various';
            const starsText = row.querySelector('a[href$="/stargazers"]')?.textContent?.trim().replace(/,/g, '') || '0';
            const stars = parseInt(starsText) || 0;
            const forksText = row.querySelector('a[href$="/forks"]')?.textContent?.trim().replace(/,/g, '') || '0';
            const forks = parseInt(forksText) || 0;
            const gainText = row.querySelector('.d-inline-block.float-sm-right')?.textContent?.trim() || '';
            const topics = Array.from(row.querySelectorAll('.topic-tag')).slice(0, 4).map(t => t.textContent.trim());
            return {
                name: name || 'trending',
                url,
                language,
                stars,
                forks,
                updated: gainText || 'trending',
                analysis: description,
                topics
            };
        }).filter(r => r.name && r.name !== 'trending');
    }

    function analyzeGithubRepo(repo) {
        const language = repo.language || 'Mixed';
        const description = repo.description || 'No description provided.';
        const topics = Array.isArray(repo.topics) ? repo.topics.slice(0, 4) : [];
        const signals = [];
        if (repo.stargazers_count) signals.push(`${formatCompactNumber(repo.stargazers_count)} stars`);
        if (repo.forks_count) signals.push(`${formatCompactNumber(repo.forks_count)} forks`);
        if (repo.open_issues_count) signals.push(`${formatCompactNumber(repo.open_issues_count)} open issues`);

        let analysis = `${description} Built mainly with ${language}.`;
        if (topics.length) analysis += ` Topics: ${topics.join(', ')}.`;
        analysis += ` Popularity signals: ${signals.join(', ') || 'strong GitHub search ranking'}.`;

        return {
            name: repo.full_name,
            url: repo.html_url,
            language,
            stars: repo.stargazers_count || 0,
            forks: repo.forks_count || 0,
            updated: timeAgo(new Date(repo.pushed_at || repo.updated_at).getTime()),
            analysis,
            topics
        };
    }

    function renderGithubRepos(repos, category) {
        if (!githubReposList) return;
        if (!repos.length) {
            githubReposList.innerHTML = `<div class="github-repos-error">No ${escapeHtml(category.label)} repositories found.</div>`;
            return;
        }
        githubReposList.innerHTML = repos.map(repo => `
            <a href="${escapeHtml(repo.url)}" target="_blank" class="github-repo-item">
                <div class="github-repo-main">
                    <div class="github-repo-name">${escapeHtml(repo.name)}</div>
                    <div class="github-repo-language">${escapeHtml(repo.language)}</div>
                </div>
                <div class="github-repo-analysis">${escapeHtml(repo.analysis)}</div>
                <div class="github-repo-meta">
                    <span>Stars ${formatCompactNumber(repo.stars)}</span>
                    <span>Forks ${formatCompactNumber(repo.forks)}</span>
                    <span>Updated ${escapeHtml(repo.updated)}</span>
                </div>
            </a>
        `).join('');
    }

    function formatCompactNumber(value) {
        return Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(value || 0);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    if (githubReposBtn) githubReposBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden');
        githubReposState.isOpen = !githubReposState.isOpen;
        if (githubReposState.isOpen) {
            bringToFront(githubReposWidget);
            githubReposState.zIndex = maxZIndex;
            fetchGithubRepos(githubReposState.activeCategory);
        }
        applyGithubReposState();
        saveGithubReposState();
    });
    if (githubReposMinimize) githubReposMinimize.addEventListener('click', () => {
        githubReposState.isOpen = false;
        applyGithubReposState();
        saveGithubReposState();
    });
    if (githubReposRefresh) githubReposRefresh.addEventListener('click', () => fetchGithubRepos(githubReposState.activeCategory, true));
    githubReposTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const categoryKey = tab.dataset.githubCategory;
            if (!githubRepoCategories[categoryKey]) return;
            githubReposState.activeCategory = categoryKey;
            saveGithubReposState();
            fetchGithubRepos(categoryKey);
        });
    });

    let isDraggingGithubRepos = false,
        dragOffsetGithubReposX = 0,
        dragOffsetGithubReposY = 0;
    if (githubReposHeader) githubReposHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDraggingGithubRepos = true;
        const r = githubReposWidget.getBoundingClientRect();
        dragOffsetGithubReposX = e.clientX - r.left;
        dragOffsetGithubReposY = e.clientY - r.top;
        document.addEventListener('mousemove', onMouseMoveGithubRepos);
        document.addEventListener('mouseup', onMouseUpGithubRepos);
        githubReposHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveGithubRepos(e) {
        if (!isDraggingGithubRepos) return;
        let x = e.clientX - dragOffsetGithubReposX,
            y = e.clientY - dragOffsetGithubReposY;
        x = Math.max(0, Math.min(x, window.innerWidth - githubReposWidget.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - githubReposWidget.offsetHeight));
        githubReposWidget.style.left = x + 'px';
        githubReposWidget.style.top = y + 'px';
        githubReposWidget.style.bottom = 'auto';
        githubReposWidget.style.right = 'auto';
    }

    function onMouseUpGithubRepos() {
        if (!isDraggingGithubRepos) return;
        isDraggingGithubRepos = false;
        githubReposHeader.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMoveGithubRepos);
        document.removeEventListener('mouseup', onMouseUpGithubRepos);
        githubReposState.x = parseInt(githubReposWidget.style.left);
        githubReposState.y = parseInt(githubReposWidget.style.top);
        bringToFront(githubReposWidget);
        githubReposState.zIndex = maxZIndex;
        saveGithubReposState();
    }

    // --- Blender Dev Widget Logic ---
    const blenderDevBtn = document.getElementById('blender-dev-btn');
    const blenderDevWidget = document.getElementById('blender-dev-widget');
    const blenderDevHeader = document.getElementById('blender-dev-header');
    const blenderDevMinimize = document.getElementById('blender-dev-minimize');
    const blenderDevRefresh = document.getElementById('blender-dev-refresh');
    const blenderDevList = document.getElementById('blender-dev-list');
    const blenderDevLoading = document.getElementById('blender-dev-loading');
    const blenderDevTabs = Array.from(document.querySelectorAll('.blender-dev-tab'));

    const blenderDevSources = {
        news: {
            label: 'News',
            cacheKey: 'news'
        },
        releases: {
            label: 'Releases',
            cacheKey: 'releases'
        },
        api: {
            label: 'API',
            cacheKey: 'api'
        },
        links: {
            label: 'Links',
            cacheKey: 'links'
        }
    };
    const blenderDevCacheTtl = 12 * 60 * 60 * 1000;

    let blenderDevState = {
        isOpen: false,
        x: null,
        y: null,
        zIndex: 100,
        activeTab: 'news'
    };
    let blenderDevCache = {};

    Promise.all([
        window.storageManager.get(['blenderDevState']),
        window.storageManager.getLocal(['blenderDevCache'])
    ]).then(([result, cacheResult]) => {
        if (result.blenderDevState) {
            blenderDevState = {
                ...blenderDevState,
                ...result.blenderDevState
            };
        }
        if (cacheResult.blenderDevCache) {
            blenderDevCache = cacheResult.blenderDevCache;
        }
        applyBlenderDevState();
        if (blenderDevState.isOpen) fetchBlenderDev(blenderDevState.activeTab);
    });

    function saveBlenderDevState() {
        window.storageManager.set({
            blenderDevState
        });
    }

    function saveBlenderDevCache() {
        window.storageManager.setLocal({
            blenderDevCache
        }).catch(() => {
            // Cache failures should not stop the widget from rendering fresh data.
        });
    }

    function getFreshBlenderDevCache(tabKey) {
        const cached = blenderDevCache[tabKey];
        if (!cached || !Array.isArray(cached.items) || !cached.fetchedAt) return null;
        if (Date.now() - cached.fetchedAt > blenderDevCacheTtl) return null;
        return cached;
    }

    function applyBlenderDevState() {
        if (!blenderDevWidget) return;
        if (blenderDevState.isOpen) {
            blenderDevWidget.classList.remove('hidden');
            if (blenderDevBtn) blenderDevBtn.classList.add('active');
        } else {
            blenderDevWidget.classList.add('hidden');
            if (blenderDevBtn) blenderDevBtn.classList.remove('active');
        }
        if (blenderDevState.x !== null && blenderDevState.y !== null) {
            blenderDevWidget.style.left = blenderDevState.x + 'px';
            blenderDevWidget.style.top = blenderDevState.y + 'px';
            blenderDevWidget.style.bottom = 'auto';
            blenderDevWidget.style.right = 'auto';
        }
        if (blenderDevState.zIndex) {
            blenderDevWidget.style.zIndex = blenderDevState.zIndex;
            if (blenderDevState.zIndex > maxZIndex) maxZIndex = blenderDevState.zIndex;
        }
        blenderDevTabs.forEach(tab => {
            const isActive = tab.dataset.blenderTab === blenderDevState.activeTab;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    async function fetchBlenderDev(tabKey = blenderDevState.activeTab, forceRefresh = false) {
        if (!blenderDevLoading || !blenderDevList) return;
        const tab = blenderDevSources[tabKey] || blenderDevSources.news;
        blenderDevState.activeTab = tabKey;
        applyBlenderDevState();

        const cached = getFreshBlenderDevCache(tabKey);
        if (!forceRefresh && cached) {
            renderBlenderDevItems(cached.items, tab);
            return;
        }

        blenderDevLoading.classList.remove('hidden');
        blenderDevList.innerHTML = '';
        if (blenderDevRefresh) blenderDevRefresh.disabled = true;
        try {
            const items = await loadBlenderDevItems(tabKey);
            blenderDevCache[tabKey] = {
                fetchedAt: Date.now(),
                items
            };
            renderBlenderDevItems(items, tab);
            saveBlenderDevCache();
        } catch (e) {
            blenderDevList.innerHTML = `<div class="blender-dev-error">${escapeHtml(e.message || 'Failed to load Blender updates.')}</div>`;
        } finally {
            blenderDevLoading.classList.add('hidden');
            if (blenderDevRefresh) blenderDevRefresh.disabled = false;
        }
    }

    async function loadBlenderDevItems(tabKey) {
        if (tabKey === 'news') return fetchBlenderNews();
        if (tabKey === 'releases') return fetchBlenderReleases();
        if (tabKey === 'api') return fetchBlenderApiNotes();
        return getBlenderLinks();
    }

    async function fetchBlenderNews() {
        const feedUrls = [
            'https://www.blender.org/feed/',
            'https://www.blender.org/category/news/feed/'
        ];

        for (const feedUrl of feedUrls) {
            try {
                const res = await fetch(feedUrl);
                if (!res.ok) continue;
                const text = await res.text();
                const doc = new DOMParser().parseFromString(text, 'application/xml');
                const items = Array.from(doc.querySelectorAll('item')).slice(0, 8).map(item => {
                    const title = getXmlText(item, 'title');
                    const link = getXmlText(item, 'link');
                    const date = getXmlText(item, 'pubDate');
                    const description = stripHtml(getXmlText(item, 'description')).slice(0, 180);
                    return {
                        title,
                        url: link,
                        summary: description || 'Official Blender update.',
                        badge: 'Official News',
                        meta: [date ? timeAgo(new Date(date).getTime()) : 'Blender.org']
                    };
                }).filter(item => item.title && item.url);
                if (items.length) return items;
            } catch (e) {
                // Try the next official feed before using pinned official links.
            }
        }

        return [{
                title: 'Blender News',
                url: 'https://www.blender.org/category/news/',
                summary: 'Official Blender news, Foundation updates, feature announcements, and project posts.',
                badge: 'Official News',
                meta: ['Open source']
            },
            {
                title: 'Blender Press Releases',
                url: 'https://www.blender.org/press/',
                summary: 'Major release announcements and Foundation press updates from blender.org.',
                badge: 'Press',
                meta: ['Blender.org']
            },
            {
                title: 'Blender Developer Portal',
                url: 'https://developer.blender.org/',
                summary: 'Developer-facing updates, documentation, build guidance, and contribution entry points.',
                badge: 'Developer',
                meta: ['Official']
            }
        ];
    }

    async function fetchBlenderReleases() {
        const fallbackItems = [
            {
                title: 'Blender 5.1 alpha',
                url: 'https://developer.blender.org/docs/release_notes/5.1/',
                summary: 'Under development on main; useful for tracking upcoming feature work and compatibility notes.',
                badge: 'Alpha',
                meta: ['Release notes', 'Official developer docs']
            },
            {
                title: 'Blender 5.0 beta',
                url: 'https://developer.blender.org/docs/release_notes/5.0/',
                summary: 'Upcoming release in bug-fixing mode; useful for testing add-ons and pipeline compatibility.',
                badge: 'Beta',
                meta: ['Release notes', 'Official developer docs']
            },
            {
                title: 'Blender 4.5 LTS',
                url: 'https://developer.blender.org/docs/release_notes/4.5/',
                summary: 'Current long-term support release with extended maintenance for production work.',
                badge: 'LTS',
                meta: ['Release notes', 'Official developer docs']
            },
            {
                title: 'Blender 4.2 LTS',
                url: 'https://developer.blender.org/docs/release_notes/4.2/',
                summary: 'Long-term support branch maintained until July 2026.',
                badge: 'LTS',
                meta: ['Release notes', 'Official developer docs']
            },
            {
                title: 'Release cycle',
                url: 'https://developer.blender.org/docs/handbook/release_process/release_cycle/',
                summary: 'Blender targets a stable release roughly every four months, with one long-term support release each year.',
                badge: 'Schedule',
                meta: ['Release process']
            }
        ];

        try {
            const res = await fetch('https://developer.blender.org/docs/release_notes/');
            if (!res.ok) return fallbackItems;
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const bodyText = doc.body?.textContent || '';
            const activeMatch = bodyText.match(/Currently Active([\s\S]*?)Previous Versions/);
            const activeLines = activeMatch ? activeMatch[1].split('\n').map(line => line.trim()).filter(Boolean) : [];
            const releaseItems = activeLines
                .filter(line => /^Blender\s+\d/.test(line))
                .slice(0, 6)
                .map(line => ({
                    title: line,
                    url: 'https://developer.blender.org/docs/release_notes/',
                    summary: getReleaseSummary(line),
                    badge: line.includes('LTS') ? 'LTS' : line.includes('alpha') ? 'Alpha' : line.includes('beta') ? 'Beta' : 'Release',
                    meta: ['Release notes', 'Official developer docs']
                }));

            if (!releaseItems.length) return fallbackItems;
            return [
                ...releaseItems,
                fallbackItems[fallbackItems.length - 1]
            ];
        } catch (e) {
            return fallbackItems;
        }
    }

    function getReleaseSummary(line) {
        if (line.includes('alpha')) return 'Under active development on main; feature work and larger changes may still be moving.';
        if (line.includes('beta')) return 'Upcoming release in bug-fixing mode; useful for testing compatibility before final release.';
        if (line.includes('current stable')) return 'Current stable production release; good baseline for day-to-day Blender work.';
        if (line.includes('supported until')) return 'Long-term support branch with extended bug-fix maintenance.';
        return 'Official Blender release notes and compatibility information.';
    }

    async function fetchBlenderApiNotes() {
        const apiPages = [{
                version: '5.0',
                url: 'https://developer.blender.org/docs/release_notes/5.0/python_api/'
            },
            {
                version: '4.5 LTS',
                url: 'https://developer.blender.org/docs/release_notes/4.5/python_api/'
            }
        ];
        const results = await Promise.allSettled(apiPages.map(async page => {
            const res = await fetch(page.url);
            if (!res.ok) throw new Error('API notes unavailable');
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
            const breakingIndex = bodyText.indexOf('Breaking Changes');
            const summary = breakingIndex >= 0 ? bodyText.slice(breakingIndex, breakingIndex + 260) : bodyText.slice(0, 260);
            return {
                title: `Blender ${page.version} Python API`,
                url: page.url,
                summary: summary || 'Python API release notes and compatibility changes.',
                badge: page.version.includes('LTS') ? 'LTS API' : 'API Changes',
                meta: ['Python API', 'Breaking changes']
            };
        }));

        const items = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        items.push({
            title: 'Python API change log',
            url: 'https://docs.blender.org/api/current/change_log.html',
            summary: 'Official change log for Blender Python API additions, removals, and compatibility notes.',
            badge: 'Reference',
            meta: ['docs.blender.org']
        });
        return items;
    }

    function getBlenderLinks() {
        return [{
                title: 'Blender Developer Portal',
                url: 'https://developer.blender.org/',
                summary: 'Start point for building Blender, reading architecture docs, triaging bugs, and joining development.',
                badge: 'Portal',
                meta: ['Developer']
            },
            {
                title: 'Release Notes',
                url: 'https://developer.blender.org/docs/release_notes/',
                summary: 'Version-by-version release notes, active branches, LTS status, and compatibility changes.',
                badge: 'Docs',
                meta: ['Releases']
            },
            {
                title: 'Python API',
                url: 'https://docs.blender.org/api/current/',
                summary: 'Current Blender Python API reference for add-ons, scripts, and pipeline tools.',
                badge: 'API',
                meta: ['Reference']
            },
            {
                title: 'Daily Builds',
                url: 'https://builder.blender.org/download/daily/',
                summary: 'Fresh builds for testing fixes, alpha work, and compatibility before stable releases.',
                badge: 'Builds',
                meta: ['Testing']
            },
            {
                title: 'Developer Forum',
                url: 'https://devtalk.blender.org/',
                summary: 'Official development discussion forum for technical topics, announcements, and design feedback.',
                badge: 'Forum',
                meta: ['Community']
            }
        ];
    }

    function getXmlText(node, selector) {
        return node.querySelector(selector)?.textContent?.trim() || '';
    }

    function stripHtml(value) {
        const doc = new DOMParser().parseFromString(String(value), 'text/html');
        return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function renderBlenderDevItems(items, tab) {
        if (!blenderDevList) return;
        if (!items.length) {
            blenderDevList.innerHTML = `<div class="blender-dev-error">No ${escapeHtml(tab.label)} items found.</div>`;
            return;
        }
        blenderDevList.innerHTML = items.map(item => `
            <a href="${escapeHtml(item.url)}" target="_blank" class="blender-dev-item">
                <span class="blender-dev-badge">${escapeHtml(item.badge || tab.label)}</span>
                <div class="blender-dev-title">${escapeHtml(item.title)}</div>
                <div class="blender-dev-summary">${escapeHtml(item.summary)}</div>
                <div class="blender-dev-meta">
                    ${(item.meta || []).map(meta => `<span>${escapeHtml(meta)}</span>`).join('')}
                </div>
            </a>
        `).join('');
    }

    if (blenderDevBtn) blenderDevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden');
        blenderDevState.isOpen = !blenderDevState.isOpen;
        if (blenderDevState.isOpen) {
            bringToFront(blenderDevWidget);
            blenderDevState.zIndex = maxZIndex;
            fetchBlenderDev(blenderDevState.activeTab);
        }
        applyBlenderDevState();
        saveBlenderDevState();
    });
    if (blenderDevMinimize) blenderDevMinimize.addEventListener('click', () => {
        blenderDevState.isOpen = false;
        applyBlenderDevState();
        saveBlenderDevState();
    });
    if (blenderDevRefresh) blenderDevRefresh.addEventListener('click', () => fetchBlenderDev(blenderDevState.activeTab, true));
    blenderDevTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabKey = tab.dataset.blenderTab;
            if (!blenderDevSources[tabKey]) return;
            blenderDevState.activeTab = tabKey;
            saveBlenderDevState();
            fetchBlenderDev(tabKey);
        });
    });

    let isDraggingBlenderDev = false,
        dragOffsetBlenderDevX = 0,
        dragOffsetBlenderDevY = 0;
    if (blenderDevHeader) blenderDevHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDraggingBlenderDev = true;
        const r = blenderDevWidget.getBoundingClientRect();
        dragOffsetBlenderDevX = e.clientX - r.left;
        dragOffsetBlenderDevY = e.clientY - r.top;
        document.addEventListener('mousemove', onMouseMoveBlenderDev);
        document.addEventListener('mouseup', onMouseUpBlenderDev);
        blenderDevHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveBlenderDev(e) {
        if (!isDraggingBlenderDev) return;
        let x = e.clientX - dragOffsetBlenderDevX,
            y = e.clientY - dragOffsetBlenderDevY;
        x = Math.max(0, Math.min(x, window.innerWidth - blenderDevWidget.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - blenderDevWidget.offsetHeight));
        blenderDevWidget.style.left = x + 'px';
        blenderDevWidget.style.top = y + 'px';
        blenderDevWidget.style.bottom = 'auto';
        blenderDevWidget.style.right = 'auto';
    }

    function onMouseUpBlenderDev() {
        if (!isDraggingBlenderDev) return;
        isDraggingBlenderDev = false;
        blenderDevHeader.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMoveBlenderDev);
        document.removeEventListener('mouseup', onMouseUpBlenderDev);
        blenderDevState.x = parseInt(blenderDevWidget.style.left);
        blenderDevState.y = parseInt(blenderDevWidget.style.top);
        bringToFront(blenderDevWidget);
        blenderDevState.zIndex = maxZIndex;
        saveBlenderDevState();
    }

    // --- Movies Widget Logic ---
    const moviesBtn = document.getElementById('movies-btn');
    const moviesWidget = document.getElementById('movies-widget');
    const moviesHeader = document.getElementById('movies-header');
    const moviesMinimize = document.getElementById('movies-minimize');
    const moviesRefresh = document.getElementById('movies-refresh');
    const moviesList = document.getElementById('movies-list');
    const moviesLoading = document.getElementById('movies-loading');
    const moviesTabs = Array.from(document.querySelectorAll('.movies-tab'));

    const moviesSources = {
        netflix: {
            label: 'Netflix'
        },
        cinema: {
            label: 'Cinemas'
        },
        guides: {
            label: 'Guides'
        },
        links: {
            label: 'Links'
        }
    };
    const moviesCacheTtl = 6 * 60 * 60 * 1000;

    let moviesState = {
        isOpen: false,
        x: null,
        y: null,
        zIndex: 100,
        activeTab: 'netflix'
    };
    let moviesCache = {};

    Promise.all([
        window.storageManager.get(['moviesState']),
        window.storageManager.getLocal(['moviesCache'])
    ]).then(([result, cacheResult]) => {
        if (result.moviesState) {
            moviesState = {
                ...moviesState,
                ...result.moviesState
            };
        }
        if (cacheResult.moviesCache) {
            moviesCache = cacheResult.moviesCache;
        }
        applyMoviesState();
        if (moviesState.isOpen) fetchMovies(moviesState.activeTab);
    });

    function saveMoviesState() {
        window.storageManager.set({
            moviesState
        });
    }

    function saveMoviesCache() {
        window.storageManager.setLocal({
            moviesCache
        }).catch(() => {
            // Cache failures should not stop the widget from loading live data.
        });
    }

    function getFreshMoviesCache(tabKey) {
        const cached = moviesCache[tabKey];
        if (!cached || !Array.isArray(cached.items) || !cached.fetchedAt) return null;
        if (Date.now() - cached.fetchedAt > moviesCacheTtl) return null;
        return cached;
    }

    function applyMoviesState() {
        if (!moviesWidget) return;
        if (moviesState.isOpen) {
            moviesWidget.classList.remove('hidden');
            if (moviesBtn) moviesBtn.classList.add('active');
        } else {
            moviesWidget.classList.add('hidden');
            if (moviesBtn) moviesBtn.classList.remove('active');
        }
        if (moviesState.x !== null && moviesState.y !== null) {
            moviesWidget.style.left = moviesState.x + 'px';
            moviesWidget.style.top = moviesState.y + 'px';
            moviesWidget.style.bottom = 'auto';
            moviesWidget.style.right = 'auto';
        }
        if (moviesState.zIndex) {
            moviesWidget.style.zIndex = moviesState.zIndex;
            if (moviesState.zIndex > maxZIndex) maxZIndex = moviesState.zIndex;
        }
        moviesTabs.forEach(tab => {
            const isActive = tab.dataset.moviesTab === moviesState.activeTab;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    async function fetchMovies(tabKey = moviesState.activeTab, forceRefresh = false) {
        if (!moviesLoading || !moviesList) return;
        const activeTabKey = moviesSources[tabKey] ? tabKey : 'netflix';
        const tab = moviesSources[activeTabKey];
        moviesState.activeTab = activeTabKey;
        applyMoviesState();

        const cached = getFreshMoviesCache(activeTabKey);
        if (!forceRefresh && cached) {
            renderMovies(cached.items, tab);
            return;
        }

        moviesLoading.classList.remove('hidden');
        moviesList.innerHTML = '';
        if (moviesRefresh) moviesRefresh.disabled = true;
        try {
            const items = dedupeMovieItems(await loadMovieItems(activeTabKey));
            moviesCache[activeTabKey] = {
                fetchedAt: Date.now(),
                items
            };
            renderMovies(items, tab);
            saveMoviesCache();
        } catch (e) {
            moviesList.innerHTML = `<div class="movies-error">${escapeHtml(e.message || 'Failed to load movie data.')}</div>`;
        } finally {
            moviesLoading.classList.add('hidden');
            if (moviesRefresh) moviesRefresh.disabled = false;
        }
    }

    async function loadMovieItems(tabKey) {
        if (tabKey === 'netflix') return fetchNetflixTop10();
        if (tabKey === 'cinema') return fetchMovieSourceCards(getCinemaSources());
        if (tabKey === 'guides') return fetchMovieSourceCards(getWatchGuideSources());
        if (tabKey === 'links') return getMovieLinks();
        return fetchNetflixTop10();
    }

    async function fetchNetflixTop10() {
        // Use TMDB public RSS / JSON feeds — no API key required for these public endpoints
        const tmdbRssUrls = [
            'https://api.themoviedb.org/3/movie/now_playing?api_key=2dca580c2a14b55200e784d157207b4d&language=en-US&page=1',
            'https://api.themoviedb.org/3/movie/popular?api_key=2dca580c2a14b55200e784d157207b4d&language=en-US&page=1',
            'https://api.themoviedb.org/3/trending/movie/week?api_key=2dca580c2a14b55200e784d157207b4d'
        ];

        for (const apiUrl of tmdbRssUrls) {
            try {
                const res = await fetch(apiUrl, { signal: AbortSignal.timeout(7000) });
                if (!res.ok) continue;
                const data = await res.json();
                const movies = (data.results || []).slice(0, 12);
                if (movies.length) {
                    return movies.map((m, i) => ({
                        title: m.title || m.name || 'Unknown',
                        url: `https://www.themoviedb.org/movie/${m.id}`,
                        summary: truncateText(m.overview || 'No synopsis available.', 200),
                        image: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : '',
                        badge: `#${i + 1} ${m.vote_average ? '⭐ ' + m.vote_average.toFixed(1) : 'Popular'}`,
                        meta: [
                            m.release_date ? m.release_date.slice(0, 4) : '',
                            m.vote_count ? `${formatCompactNumber(m.vote_count)} votes` : ''
                        ].filter(Boolean)
                    }));
                }
            } catch (_) { /* try next */ }
        }

        // Final static fallback
        return [
            { title: 'Browse Latest Movies on TMDB', url: 'https://www.themoviedb.org/movie/now-playing', summary: 'The Movie Database — free community database for movies & TV shows with ratings, posters, and reviews.', image: '', badge: 'Now Playing', meta: ['TMDB', 'Free'] },
            { title: 'Trending Movies This Week', url: 'https://www.themoviedb.org/trending/movie/week', summary: 'See what movies are trending globally this week across all platforms.', image: '', badge: 'Trending', meta: ['TMDB', 'Weekly'] },
            { title: 'IMDb Top 250', url: 'https://www.imdb.com/chart/top/', summary: 'The top rated movies of all time as voted by IMDb users.', image: '', badge: 'Top Rated', meta: ['IMDb'] }
        ];
    }

    function parseNetflixTop10(doc, sourceUrl) {
        const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
        const titleCandidates = [];
        doc.querySelectorAll('h1, h2, h3, a, button').forEach(node => {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length < 2 || text.length > 90) return;
            if (/^(my list|watch|explore|global|movies|shows|top 10|overview)$/i.test(text)) return;
            if (/^#?\d+$/.test(text)) return;
            titleCandidates.push(text);
        });

        const ranked = [];
        titleCandidates.forEach((title, index) => {
            const rankMatch = bodyText.match(new RegExp(`#${index + 1}\\s+in\\s+(Movies|Films|Shows)`, 'i'));
            if (index < 10 || rankMatch) {
                ranked.push({
                    title,
                    url: sourceUrl,
                    summary: 'Netflix public Top 10 entry. Open the Netflix page for viewing options and the complete weekly ranking.',
                    image: getOgImage(doc),
                    badge: `#${ranked.length + 1} Netflix`,
                    meta: ['Official Netflix Top 10']
                });
            }
        });

        return dedupeMovieItems(ranked).slice(0, 10);
    }

    async function fetchMovieSourceCards(sources) {
        const results = await Promise.allSettled(sources.map(source => fetchMovieSourceCard(source)));
        return results
            .map((result, index) => result.status === 'fulfilled' ? result.value : getMovieSourceFallback(sources[index]))
            .filter(Boolean);
    }

    async function fetchMovieSourceCard(source) {
        const res = await fetch(source.url);
        if (!res.ok) return getMovieSourceFallback(source);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return {
            title: getOgValue(doc, 'og:title') || source.title,
            url: source.url,
            summary: truncateText(getOgValue(doc, 'og:description') || getMetaDescription(doc) || source.summary, 220),
            image: getOgImage(doc) || source.image || '',
            badge: source.badge,
            meta: source.meta
        };
    }

    function getMovieSourceFallback(source) {
        return {
            title: source.title,
            url: source.url,
            summary: source.summary,
            image: source.image || '',
            badge: source.badge,
            meta: source.meta
        };
    }

    function getCinemaSources() {
        return [{
                title: 'IMDb Coming Soon',
                url: 'https://www.imdb.com/calendar/',
                summary: 'Cinema and streaming release calendar with upcoming films by region and date.',
                badge: 'Cinema',
                meta: ['IMDb', 'Coming soon']
            },
            {
                title: 'Rotten Tomatoes: Movies Opening',
                url: 'https://www.rottentomatoes.com/browse/movies_in_theaters/sort:popular',
                summary: 'Popular movies currently in theaters, with critic and audience context.',
                badge: 'In Theaters',
                meta: ['Rotten Tomatoes']
            },
            {
                title: 'Rotten Tomatoes: Upcoming Movies',
                url: 'https://www.rottentomatoes.com/browse/movies_coming_soon/sort:popular',
                summary: 'Upcoming theatrical releases sorted by public interest.',
                badge: 'Coming Soon',
                meta: ['Rotten Tomatoes']
            },
            {
                title: 'IMDb Showtimes',
                url: 'https://www.imdb.com/showtimes/',
                summary: 'Find cinema showtimes near you when IMDb supports your location.',
                badge: 'Showtimes',
                meta: ['IMDb']
            }
        ];
    }

    function getWatchGuideSources() {
        return [{
                title: 'JustWatch Streaming Guide',
                url: getJustWatchUrl(),
                summary: 'Streaming guide for finding where films and shows are available across Netflix, Prime Video, Disney+, Apple TV, Paramount+, and more.',
                badge: 'Where to Watch',
                meta: ['JustWatch', getMovieRegion()]
            },
            {
                title: 'Rotten Tomatoes: Streaming Movies',
                url: 'https://www.rottentomatoes.com/browse/movies_at_home/sort:popular',
                summary: 'Popular movies available to watch at home, including streaming, digital rental, and purchase options.',
                badge: 'At Home',
                meta: ['Rotten Tomatoes']
            },
            {
                title: 'IMDb: Most Popular Movies',
                url: 'https://www.imdb.com/chart/moviemeter/',
                summary: 'IMDb popularity chart for movies people are currently looking up.',
                badge: 'Popular',
                meta: ['IMDb']
            },
            {
                title: 'Netflix Tudum',
                url: 'https://www.netflix.com/tudum/',
                summary: 'Netflix editorial hub for new releases, trailers, cast guides, and what to watch next.',
                badge: 'Editorial',
                meta: ['Netflix']
            }
        ];
    }

    function getOgValue(doc, property) {
        return doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content')?.trim() || '';
    }

    function getOgImage(doc) {
        return getOgValue(doc, 'og:image') || doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() || '';
    }

    function getMetaDescription(doc) {
        return doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
    }

    function getNetflixRegionSlug() {
        const region = getMovieRegion();
        const slugs = {
            US: 'united-states',
            GB: 'united-kingdom',
            CA: 'canada',
            AU: 'australia',
            DE: 'germany',
            FR: 'france',
            ES: 'spain',
            IT: 'italy',
            JP: 'japan',
            BR: 'brazil',
            MX: 'mexico'
        };
        return slugs[region] || '';
    }

    function getJustWatchUrl() {
        const region = getMovieRegion().toUpperCase();
        // JustWatch uses its own URL slugs — GB maps to /uk, not /gb
        const regionToSlug = {
            US: 'us', GB: 'uk', CA: 'ca', AU: 'au',
            DE: 'de', FR: 'fr', ES: 'es', IT: 'it',
            JP: 'jp', BR: 'br', MX: 'mx', NL: 'nl',
            SE: 'se', NO: 'no', DK: 'dk', FI: 'fi',
            PL: 'pl', PT: 'pt', BE: 'be', CH: 'ch',
            AT: 'at', IE: 'ie', NZ: 'nz', IN: 'in',
            ZA: 'za', AR: 'ar', CL: 'cl', CO: 'co'
        };
        const slug = regionToSlug[region] || 'us';
        return `https://www.justwatch.com/${slug}`;
    }

    function dedupeMovieItems(items) {
        const seen = new Set();
        return (items || []).filter(item => {
            const key = normalizeMovieTitle(item.title);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizeMovieTitle(title) {
        return String(title || '')
            .toLowerCase()
            .replace(/\b(official site|watch|explore|my list|trailer|movie|film|series|season)\b/g, '')
            .replace(/\(\d{4}\)|\b\d{4}\b/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function getMovieRegion() {
        const localeRegion = (navigator.language || 'en-US').split('-')[1];
        return (localeRegion || 'US').toUpperCase();
    }

    function getMovieLinks() {
        return [{
                title: 'Netflix Top 10',
                url: 'https://www.netflix.com/tudum/top10/',
                summary: 'Official weekly Netflix rankings for films and TV, including global and country lists.',
                image: '',
                badge: 'Netflix',
                meta: ['Official', 'Weekly']
            },
            {
                title: 'JustWatch',
                url: getJustWatchUrl(),
                summary: 'Find where films and shows are available across major streaming providers in your region.',
                image: '',
                badge: 'Where to Watch',
                meta: [getMovieRegion()]
            },
            {
                title: 'IMDb Coming Soon',
                url: 'https://www.imdb.com/calendar/',
                summary: 'Upcoming releases and cinema calendar pages for planning what to watch next.',
                image: '',
                badge: 'Cinemas',
                meta: ['IMDb']
            },
            {
                title: 'Rotten Tomatoes: At Home',
                url: 'https://www.rottentomatoes.com/browse/movies_at_home/sort:popular',
                summary: 'Popular movies available to watch at home, with critic and audience context.',
                image: '',
                badge: 'Streaming',
                meta: ['Rotten Tomatoes']
            },
            {
                title: 'Rotten Tomatoes: Coming Soon',
                url: 'https://www.rottentomatoes.com/browse/movies_coming_soon/sort:popular',
                summary: 'Upcoming cinema releases sorted by public interest.',
                image: '',
                badge: 'Coming Soon',
                meta: ['Rotten Tomatoes']
            }
        ];
    }

    function renderMovies(items, tab) {
        if (!moviesList) return;
        if (!items.length) {
            moviesList.innerHTML = `<div class="movies-error">No ${escapeHtml(tab.label)} items found.</div>`;
            return;
        }
        moviesList.innerHTML = items.map(item => `
            <a href="${escapeHtml(item.url)}" target="_blank" class="movie-item">
                ${item.image ? `<img src="${escapeHtml(item.image)}" class="movie-poster" loading="lazy" alt="">` : '<div class="movie-poster movie-poster-placeholder">FILM</div>'}
                <div class="movie-body">
                    <span class="movie-badge">${escapeHtml(item.badge || tab.label)}</span>
                    <div class="movie-title">${escapeHtml(item.title)}</div>
                    <div class="movie-summary">${escapeHtml(truncateText(item.summary, 220))}</div>
                    <div class="movie-meta">
                        ${(item.meta || []).map(meta => `<span>${escapeHtml(meta)}</span>`).join('')}
                    </div>
                </div>
            </a>
        `).join('');
    }

    function truncateText(value, limit) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= limit) return text;
        return text.slice(0, limit - 1).trim() + '...';
    }

    if (moviesBtn) moviesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widgetsMenu.classList.add('hidden');
        moviesState.isOpen = !moviesState.isOpen;
        if (moviesState.isOpen) {
            bringToFront(moviesWidget);
            moviesState.zIndex = maxZIndex;
            fetchMovies(moviesState.activeTab);
        }
        applyMoviesState();
        saveMoviesState();
    });
    if (moviesMinimize) moviesMinimize.addEventListener('click', () => {
        moviesState.isOpen = false;
        applyMoviesState();
        saveMoviesState();
    });
    if (moviesRefresh) moviesRefresh.addEventListener('click', () => fetchMovies(moviesState.activeTab, true));
    moviesTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabKey = tab.dataset.moviesTab;
            if (!moviesSources[tabKey]) return;
            moviesState.activeTab = tabKey;
            saveMoviesState();
            fetchMovies(tabKey);
        });
    });

    let isDraggingMovies = false,
        dragOffsetMoviesX = 0,
        dragOffsetMoviesY = 0;
    if (moviesHeader) moviesHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDraggingMovies = true;
        const r = moviesWidget.getBoundingClientRect();
        dragOffsetMoviesX = e.clientX - r.left;
        dragOffsetMoviesY = e.clientY - r.top;
        document.addEventListener('mousemove', onMouseMoveMovies);
        document.addEventListener('mouseup', onMouseUpMovies);
        moviesHeader.style.cursor = 'grabbing';
    });

    function onMouseMoveMovies(e) {
        if (!isDraggingMovies) return;
        let x = e.clientX - dragOffsetMoviesX,
            y = e.clientY - dragOffsetMoviesY;
        x = Math.max(0, Math.min(x, window.innerWidth - moviesWidget.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - moviesWidget.offsetHeight));
        moviesWidget.style.left = x + 'px';
        moviesWidget.style.top = y + 'px';
        moviesWidget.style.bottom = 'auto';
        moviesWidget.style.right = 'auto';
    }

    function onMouseUpMovies() {
        if (!isDraggingMovies) return;
        isDraggingMovies = false;
        moviesHeader.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMoveMovies);
        document.removeEventListener('mouseup', onMouseUpMovies);
        moviesState.x = parseInt(moviesWidget.style.left);
        moviesState.y = parseInt(moviesWidget.style.top);
        bringToFront(moviesWidget);
        moviesState.zIndex = maxZIndex;
        saveMoviesState();
    }

    // --- Generic Z-Index Logic ---
    const widgets = [spotifyWidget, footballWidget, todoWidget, notesWidget, techNewsWidget, githubReposWidget, blenderDevWidget, moviesWidget];
    widgets.forEach(w => {
        if (w) w.addEventListener('mousedown', () => bringToFront(w));
    });

});
