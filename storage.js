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

    handleError() {
        if (chrome.runtime.lastError) {
            console.error('Storage Error:', chrome.runtime.lastError.message);
            // We can dispatch a global event or store the error for the UI to consume
            window.dispatchEvent(new CustomEvent('extension-storage-error', {
                detail: chrome.runtime.lastError.message
            }));
            return true;
        }
        return false;
    }

    async get(keys) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve, reject) => {
            storage.get(keys, (res) => {
                if (this.handleError()) {
                    resolve({}); // Return empty on error to prevent total breakage
                } else {
                    resolve(res);
                }
            });
        });
    }

    async set(items) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve, reject) => {
            storage.set(items, () => {
                if (this.handleError()) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    async remove(keys) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.remove(keys, () => {
                this.handleError();
                resolve();
            });
        });
    }

    async clear(callback) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.clear(() => {
                this.handleError();
                if (callback) callback();
                resolve();
            });
        });
    }

    /**
     * Get bytes in use for quota monitoring
     */
    async getBytesInUse(keys = null) {
        const sync = await this.isSyncEnabled();
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        return new Promise((resolve) => {
            storage.getBytesInUse(keys, (bytes) => {
                resolve(bytes || 0);
            });
        });
    }

    /**
     * Migrates data from one storage to another
     * @param {boolean} toSync - Flag to indicate direction
     * @param {string} mode - 'overwrite' or 'merge'
     */
    async migrate(toSync, mode = 'overwrite') {
        const source = toSync ? chrome.storage.local : chrome.storage.sync;
        const target = toSync ? chrome.storage.sync : chrome.storage.local;

        return new Promise((resolve, reject) => {
            source.get(null, (sourceItems) => {
                if (this.handleError()) return reject(new Error('Failed to read source data'));

                target.get(null, async (targetItems) => {
                    if (this.handleError()) return reject(new Error('Failed to read target data'));

                    let dataToSet;
                    if (mode === 'merge') {
                        dataToSet = {
                            ...targetItems,
                            ...sourceItems
                        };
                    } else {
                        dataToSet = {
                            ...sourceItems
                        };
                    }

                    // Filter out the sync toggle itself to avoid confusion
                    delete dataToSet.googleSyncEnabled;

                    if (Object.keys(dataToSet).length > 0) {
                        target.set(dataToSet, () => {
                            if (this.handleError()) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            });
        });
    }
}

window.storageManager = new ExtensionStorage();