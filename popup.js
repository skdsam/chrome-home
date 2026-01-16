document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (tab) {
        document.getElementById('site-title').textContent = tab.title;
        document.getElementById('site-url').textContent = new URL(tab.url).hostname;
    }

    document.getElementById('save-btn').addEventListener('click', async () => {
        if (!tab) return;

        const storage = await window.storageManager.get('shortcuts');
        const shortcuts = storage.shortcuts || [];

        const newShortcut = {
            id: Date.now(),
            url: tab.url,
            title: tab.title,
            icon: `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=64`
        };

        shortcuts.push(newShortcut);
        await window.storageManager.set({
            shortcuts
        });

        // Add notification
        const notifications = (await window.storageManager.get('notifications')).notifications || [];
        notifications.unshift({
            id: Date.now(),
            title: 'Shortcut Added',
            message: `Added shortcut for ${tab.title}`,
            timestamp: new Date().toISOString()
        });
        if (notifications.length > 50) notifications.pop();
        await window.storageManager.set({
            notifications
        });

        document.getElementById('save-btn').style.display = 'none';
        document.getElementById('success-msg').style.display = 'block';

        setTimeout(() => {
            window.close();
        }, 1000);
    });
});