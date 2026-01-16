class ExtensionStorage {
    constructor() {
        // No cache for now to ensure freshness across tabs
    }

    async isSyncEnabled() {
        return new Promise((resolve) => {
            chrome.storage.local.get('googleSyncEnabled', (res) => {
                resolve(!!res.googleSyncEnabled);
            });
        });
    }

    async get(keys) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.get(keys, (res) => {
                resolve(res);
            });
        });
    }

    async set(items) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.set(items, () => {
                resolve();
            });
        });
    }

    async remove(keys) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.remove(keys, () => {
                resolve();
            });
        });
    }

    async clear(callback) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.clear(() => {
                if (callback) callback();
                resolve();
            });
        });
    }

    /**
     * Migrates data from one storage to another
     * @param {boolean} toSync - Flag to indicate direction
     */
    async migrate(toSync) {
        const source = toSync ? chrome.storage.local : chrome.storage.sync;
        const target = toSync ? chrome.storage.sync : chrome.storage.local;

        return new Promise((resolve) => {
            source.get(null, async (items) => {
                // Filter out the sync toggle itself to avoid confusion
                const data = {
                    ...items
                };
                delete data.googleSyncEnabled;

                if (Object.keys(data).length > 0) {
                    await new Promise(r => target.set(data, r));
                }
                resolve();
            });
        });
    }
}

window.storageManager = new ExtensionStorage();