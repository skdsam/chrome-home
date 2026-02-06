// usage-stats.js - Usage Statistics Tracking
// Tracks tabs opened today and most visited sites

class UsageStats {
    constructor() {
        this.container = null;
        this.tabsToday = 0;
        this.topSites = [];
        this.isVisible = true;
    }

    async init() {
        // Load settings
        const stored = await window.storageManager.get('usageStatsEnabled');
        this.isVisible = stored.usageStatsEnabled !== false; // Default to true

        // Create widget container
        this.createWidget();

        if (this.isVisible) {
            await this.loadData();
            this.show();
        } else {
            this.hide();
        }

        // Listen for new tabs (updated count)
        this.setupTabListener();
    }

    createWidget() {
        this.container = document.getElementById('usage-stats-widget');
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="usage-stats-content">
                <div class="stat-item">
                    <span class="stat-value" id="tabs-today-count">0</span>
                    <span class="stat-label">tabs today</span>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item top-sites">
                    <span class="stat-label">Top:</span>
                    <span class="stat-value" id="top-sites-list">Loading...</span>
                </div>
            </div>
        `;
    }

    async loadData() {
        await this.loadTabsToday();
        await this.loadTopSites();
        this.render();
    }

    async loadTabsToday() {
        // Get stored tab count for today
        const today = new Date().toDateString();
        const stored = await window.storageManager.get('tabStats');

        if (stored.tabStats && stored.tabStats.date === today) {
            this.tabsToday = stored.tabStats.count;
        } else {
            // New day, reset count
            this.tabsToday = 1; // This page load counts as 1
            await window.storageManager.set({
                tabStats: {
                    date: today,
                    count: 1
                }
            });
        }
    }

    async loadTopSites() {
        // Use Chrome history API to get most visited
        if (chrome && chrome.history) {
            return new Promise((resolve) => {
                const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                chrome.history.search({
                    text: '',
                    startTime: oneWeekAgo,
                    maxResults: 100
                }, (results) => {
                    // Group by domain and count
                    const domainCounts = {};
                    results.forEach(item => {
                        try {
                            const url = new URL(item.url);
                            const domain = url.hostname.replace('www.', '');
                            // Skip internal Chrome pages
                            if (domain.includes('chrome') || domain.includes('newtab')) return;
                            domainCounts[domain] = (domainCounts[domain] || 0) + (item.visitCount || 1);
                        } catch (e) {}
                    });

                    // Sort by count and take top 3
                    this.topSites = Object.entries(domainCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([domain]) => this.shortenDomain(domain));

                    resolve();
                });
            });
        } else {
            this.topSites = ['N/A'];
        }
    }

    shortenDomain(domain) {
        // Shorten long domain names
        const parts = domain.split('.');
        const name = parts[0];
        // Capitalize first letter
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    setupTabListener() {
        // Increment count when this page loads (already counted in loadTabsToday)
        // For real-time updates, we'd need a background script
        // Here we just increment on each page load
    }

    async incrementTabCount() {
        const today = new Date().toDateString();
        const stored = await window.storageManager.get('tabStats');

        if (stored.tabStats && stored.tabStats.date === today) {
            this.tabsToday = stored.tabStats.count + 1;
        } else {
            this.tabsToday = 1;
        }

        await window.storageManager.set({
            tabStats: {
                date: today,
                count: this.tabsToday
            }
        });

        this.render();
    }

    render() {
        const tabsEl = document.getElementById('tabs-today-count');
        const sitesEl = document.getElementById('top-sites-list');

        if (tabsEl) tabsEl.textContent = this.tabsToday;
        if (sitesEl) sitesEl.textContent = this.topSites.join(', ') || 'N/A';
    }

    show() {
        if (this.container) {
            this.container.classList.remove('hidden');
        }
        this.isVisible = true;
    }

    hide() {
        if (this.container) {
            this.container.classList.add('hidden');
        }
        this.isVisible = false;
    }

    async toggle(enabled) {
        await window.storageManager.set({
            usageStatsEnabled: enabled
        });
        if (enabled) {
            await this.loadData();
            this.show();
        } else {
            this.hide();
        }
    }
}

// Export for use in newtab.js
window.UsageStats = UsageStats;