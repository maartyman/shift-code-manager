const urls = [
    "https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/",
    "https://www.rockpapershotgun.com/tiny-tinas-wonderlands-shift-codes"
];

async function fetchCodesFromWebsites(urls, game = 'tinytina') {
    let allCodes = new Set(); // Use a Set to automatically handle duplicates

    for (const url of urls) {
        try {
            // Fetch the page content
            const response = await fetch(url);
            const text = await response.text();

            // Use regex to extract SHIFT codes
            const regex = /\b[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g;
            const codes = text.match(regex) || []; // Match codes or fallback to an empty array

            // Add codes to the set to ensure uniqueness
            codes.forEach(code => allCodes.add(code));
        } catch (error) {
            console.error(`Failed to fetch codes from ${url}:`, error);
        }
    }

    // Store codes in local storage with state tracking
    try {
        // Get already stored codes and states
        const storedData = await browser.storage.local.get(["ShiftCodes", "gameNewCodes", "codeStates"]);
        let storedCodes = storedData.ShiftCodes || [];
        let gameNewCodes = storedData.gameNewCodes || {};
        let codeStates = storedData.codeStates || {};

        // Initialize game-specific storage if not exists
        if (!gameNewCodes[game]) {
            gameNewCodes[game] = [];
        }

        // Add only new codes
        const newCodes = [...allCodes].filter(code => !storedCodes.includes(code));
        storedCodes = [...storedCodes, ...newCodes];

        // Add new codes to game-specific storage
        const gameSpecificNewCodes = newCodes.filter(code => !gameNewCodes[game].includes(code));
        gameNewCodes[game] = [...gameNewCodes[game], ...gameSpecificNewCodes];

        // Initialize state for new codes
        newCodes.forEach(code => {
            // Initialize for all platforms using new key format
            const platforms = ['steam', 'xbox', 'nintendo', 'epic', 'psn', 'stadia'];
            platforms.forEach(platform => {
                const key = `${platform}:${game}:${code}`;
                if (!codeStates[key]) {
                    codeStates[key] = {
                        state: 'new',
                        timestamp: Date.now(),
                        game: game,
                        platform: platform,
                        retryCount: 0
                    };
                }
            });
        });

        // Store updated codes and states
        await browser.storage.local.set({ 
            ShiftCodes: storedCodes,
            gameNewCodes: gameNewCodes,
            codeStates: codeStates
        });

        console.info(`Stored ${gameSpecificNewCodes.length} new codes for ${game}.`);
        return { success: true, newCodes: gameSpecificNewCodes };
    } catch (error) {
        console.error("Failed to store codes:", error);
        return { success: false, error };
    }
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "fetchCodes") {
        const urls = message.urls || [
            "https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/",
            "https://www.rockpapershotgun.com/tiny-tinas-wonderlands-shift-codes"
        ];
        const game = message.game || 'tinytina';
        
        return fetchCodesFromWebsites(urls, game)
            .catch(error => ({ success: false, error: error?.message || String(error) }));
    }
    if (message.action === "updateNotificationSettings") {
        return updateNotificationAlarm(message.settings)
            .then(() => ({ success: true }))
            .catch(error => ({ success: false, error: error?.message || String(error) }));

    }
});

// Notification system implementation
async function updateNotificationAlarm(settings) {
    // Clear existing alarm
    browser.alarms.clear('dailyCodeCheck');
    
    if (settings.enabled) {
        // Use intervalMinutes from settings (defaults to 1440 for daily)
        const intervalMinutes = settings.intervalMinutes || 1440;
        const delayMinutes = Math.min(1, intervalMinutes); // Start quickly, but not longer than interval
        
        browser.alarms.create('dailyCodeCheck', {
            delayInMinutes: delayMinutes,
            periodInMinutes: intervalMinutes
        });
        
        // Determine mode for logging
        let mode;
        if (intervalMinutes < 60) {
            mode = `${intervalMinutes} minutes`;
        } else if (intervalMinutes < 1440) {
            mode = `${Math.round(intervalMinutes/60)} hours`;
        } else {
            mode = `${Math.round(intervalMinutes/1440)} days`;
        }
        
        console.info(`Code checking alarm enabled (${mode})`);
    } else {
        console.info('Code checking alarm disabled');
    }
}

// Handle alarm triggers
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyCodeCheck') {
        console.info('Running daily code check...');
        await performDailyCodeCheck();
    }
});

// Default URLs for each game
const gameDefaultUrls = {
    'borderlands4': [
        "https://mentalmars.com/game-news/borderlands-4-shift-codes/",
        "https://www.polygon.com/borderlands-4-active-shift-codes-redeem/"
    ],
    'borderlands3': [
        "https://mentalmars.com/game-news/borderlands-3-shift-codes/",
        "https://www.polygon.com/borderlands-3-active-shift-codes-redeem/"
    ],
    'borderlands2': [
        "https://mentalmars.com/game-news/borderlands-2-shift-codes/",
        "https://www.rockpapershotgun.com/borderlands-2-shift-codes"
    ],
    'borderlandsps': [
        "https://mentalmars.com/game-news/borderlands-pre-sequel-shift-codes/",
        "https://www.rockpapershotgun.com/borderlands-pre-sequel-shift-codes"
    ],
    'ttwonderlands': [
        "https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/",
        "https://www.rockpapershotgun.com/tiny-tinas-wonderlands-shift-codes"
    ]
};

// Perform daily code check for enabled games
async function performDailyCodeCheck() {
    try {
        console.info('=== DAILY CODE CHECK STARTED ===');
        
        // Get notification settings
        const result = await browser.storage.local.get(['notificationSettings', 'customUrls']);
        const notificationSettings = result.notificationSettings;
        const customUrls = result.customUrls || {};
        
        console.debug('Notification settings:', notificationSettings);
        console.debug('Custom URLs:', customUrls);
        
        if (!notificationSettings || !notificationSettings.enabled) {
            console.info('Notifications disabled, skipping daily check');
            return;
        }
        
        let totalNewCodes = 0;
        const gameResults = {};
        
        // Check each enabled game
        for (const [game, enabled] of Object.entries(notificationSettings.games)) {
            if (enabled) {
                console.debug(`Checking for new codes in ${game}...`);
                
                // Use custom URLs if available, otherwise use defaults
                const urls = customUrls[game] || gameDefaultUrls[game] || [];
                console.debug(`URLs for ${game}:`, urls);
                
                if (urls.length > 0) {
                    const result = await fetchCodesFromWebsites(urls, game);
                    console.debug(`Fetch result for ${game}:`, result);
                    
                    if (result.success && result.newCodes.length > 0) {
                        gameResults[game] = result.newCodes.length;
                        totalNewCodes += result.newCodes.length;
                        console.info(`Found ${result.newCodes.length} new codes for ${game}`);
                    }
                } else {
                    console.warn(`No URLs configured for ${game}`);
                }
            }
        }
        
        console.info(`Total new codes found: ${totalNewCodes}`);
        
        // Show notification if new codes found
        if (totalNewCodes > 0) {
            console.info('Showing notification...');
            await showNewCodesNotification(gameResults, totalNewCodes);
            await updateBadge(totalNewCodes);
        } else {
            console.info('No new codes found in daily check');
            await updateBadge(0);
        }
        
        console.info('=== DAILY CODE CHECK COMPLETED ===');
        
    } catch (error) {
        console.error('Error in daily code check:', error);
    }
}

// Show notification for new codes
async function showNewCodesNotification(gameResults, totalCount) {
    const gameNames = {
        'borderlands4': 'Borderlands 4',
        'borderlands3': 'Borderlands 3', 
        'borderlands2': 'Borderlands 2',
        'borderlandsps': 'Borderlands Pre-Sequel',
        'ttwonderlands': 'Tiny Tina\'s Wonderlands'
    };
    
    let message = '';
    const games = Object.keys(gameResults);
    
    if (games.length === 1) {
        const game = games[0];
        message = `Found ${gameResults[game]} new codes for ${gameNames[game]}`;
    } else {
        message = `Found ${totalCount} new codes across ${games.length} games`;
    }
    
    // Create notification options
    const notificationOptions = {
        type: 'basic',
        iconUrl: 'icon-48.png',
        title: 'New SHIFT Codes Available!',
        message: message
    };
    
    // Only add buttons for Chrome (Firefox doesn't support them)
    const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
    if (!isFirefox) {
        notificationOptions.buttons = [
            { title: 'View Codes' },
            { title: 'Dismiss' }
        ];
    }
    
    browser.notifications.create('newCodesFound', notificationOptions);
}

// Update extension badge
async function updateBadge(count) {
    if (count > 0) {
        browser.browserAction.setBadgeText({ text: count.toString() });
        browser.browserAction.setBadgeBackgroundColor({ color: '#007cba' });
    } else {
        browser.browserAction.setBadgeText({ text: '' });
    }
}

// Handle notification clicks
browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'newCodesFound') {
        // Open extension popup
        browser.browserAction.openPopup();
    }
});

// Handle notification button clicks (Chrome only)
const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
if (!isFirefox && browser.notifications.onButtonClicked) {
    browser.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
        if (notificationId === 'newCodesFound') {
            if (buttonIndex === 0) { // View Codes button
                browser.browserAction.openPopup();
            }
            // Dismiss button (index 1) does nothing, notification will close
            browser.notifications.clear(notificationId);
        }
    });
}

// Initialize notification system on extension startup
browser.runtime.onStartup.addListener(async () => {
    const result = await browser.storage.local.get(['notificationSettings']);
    const settings = result.notificationSettings;
    if (settings) {
        await updateNotificationAlarm(settings);
    }
});

// Also initialize on extension install
browser.runtime.onInstalled.addListener(async () => {
    const result = await browser.storage.local.get(['notificationSettings']);
    const settings = result.notificationSettings;
    if (settings) {
        await updateNotificationAlarm(settings);
    }
});
