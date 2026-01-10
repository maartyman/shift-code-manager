(function() {
    const browserApi = typeof browser !== 'undefined' ? browser : chrome;
    
    async function applyDarkMode() {
        try {
            const result = await browserApi.storage.local.get(['appearanceSettings']);
            const settings = result.appearanceSettings || { darkMode: false };
            if (settings.darkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        } catch (error) {
            console.error('Error applying dark mode:', error);
        }
    }

    // Initial load
    applyDarkMode();
    
    // Listen for changes
    if (browserApi.storage && browserApi.storage.onChanged) {
        browserApi.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.appearanceSettings) {
                applyDarkMode();
            }
        });
    }
})();
