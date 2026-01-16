class NotificationManager {
    constructor() {
        this.storageKey = 'notifications';
    }

    async add(title, message) {
        const notifications = await this.getAll();
        const newNotification = {
            id: Date.now(),
            title,
            message,
            timestamp: new Date().toISOString()
        };
        notifications.unshift(newNotification); // Add to top
        // Limit to 50
        if (notifications.length > 50) notifications.pop();

        await window.storageManager.set({
            [this.storageKey]: notifications
        });
        this.updateBadge(notifications.length);
        return newNotification;
    }

    async getAll() {
        const result = await window.storageManager.get(this.storageKey);
        return result[this.storageKey] || [];
    }

    async clearAll() {
        await window.storageManager.set({
            [this.storageKey]: []
        });
        this.updateBadge(0);
    }

    async updateBadge(count) {
        // We can update a badge on the bell icon in newtab.html
        // Dispatch custom event or callback if needed, but for now we'll let newtab.js handle rendering
    }
}

// Export for usage if using modules, but since we are in vanilla extension without modules setup in manifest (yet), 
// we'll attach to window or just rely on global scope order.
window.NotificationManager = NotificationManager;