const statusElement = document.getElementById("status");
const gameSelect = document.getElementById("gameSelect");
const platformSelect = document.getElementById("platformSelect");

// Settings tab elements
const settingsUrlList = document.getElementById("settingsUrlList");
const settingsNewUrlInput = document.getElementById("settingsNewUrlInput");
const settingsAddUrlButton = document.getElementById("settingsAddUrlButton");
const settingsGameName = document.getElementById("settingsGameName");
const codeDelayInput = document.getElementById("codeDelay");
const retryDelayInput = document.getElementById("retryDelay");

// Notification settings elements
const notificationToggle = document.getElementById("notificationToggle");
const notificationGamesSection = document.getElementById("notificationGamesSection");
const checkPeriodSection = document.getElementById("checkPeriodSection");
const periodDays = document.getElementById("periodDays");
const periodHours = document.getElementById("periodHours");
const periodMinutes = document.getElementById("periodMinutes");
const notifyBorderlands4 = document.getElementById("notifyBorderlands4");
const notifyBorderlands3 = document.getElementById("notifyBorderlands3");
const notifyBorderlands2 = document.getElementById("notifyBorderlands2");
const notifyBorderlandsPS = document.getElementById("notifyBorderlandsPS");
const notifyTTWonderlands = document.getElementById("notifyTTWonderlands");

async function ensureOriginPermission(url) {
    if (!browser.permissions) {
        throw new Error('Permissions API unavailable');
    }

    const originPattern = `${new URL(url).origin}/*`;
    const permission = { origins: [originPattern] };

    const alreadyHasAccess = await browser.permissions.contains(permission);
    if (alreadyHasAccess) {
        return true;
    }

    return browser.permissions.request(permission);
}

// Redemption state tracking
let isRedeeming = false;
let shouldStopRedemption = false;

// Helper function to reset redemption button state
function resetRedeemButton() {
    const redeemButton = document.getElementById("redeemCodesButton");
    redeemButton.textContent = "Redeem Codes";
    redeemButton.disabled = false;
    isRedeeming = false;
    shouldStopRedemption = false;
}

// Helper function to check if user needs to log in
function isLoginRequired(url) {
    if (!url) return false;
    return url.includes("shift.gearboxsoftware.com/home") && 
           (url.includes("redirect_to=") || url.includes("login"));
}

// Tab switching function
window.switchTab = function(tabName, event) {
    try {
        // Hide all tab contents
        const allTabContents = document.querySelectorAll('.tab-content');
        allTabContents.forEach(content => {
            content.classList.remove('active');
        });
        
        // Remove active class from all tabs
        const allTabs = document.querySelectorAll('.tab');
        allTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show selected tab content
        const targetTab = document.getElementById(`${tabName}-tab`);
        if (targetTab) {
            targetTab.classList.add('active');
        } else {
            console.error(`Tab element ${tabName}-tab not found`);
            return;
        }
        
        // Add active class to selected tab
        if (event && event.target) {
            event.target.classList.add('active');
        } else {
            // Fallback: find the tab button
            allTabs.forEach(tab => {
                if (tab.textContent.toLowerCase().includes(tabName)) {
                    tab.classList.add('active');
                }
            });
        }
        
        // Update settings tab when switching to it
        if (tabName === 'settings') {
            setTimeout(() => {
                updateSettingsTab().catch(error => {
                    console.error('Error updating settings tab:', error);
                });
            }, 100);
        } else if (tabName === 'main') {
            setTimeout(() => {
                updateCodeOverview().catch(error => {
                    console.error('Error updating code overview:', error);
                });
            }, 100);
        }
        
    } catch (error) {
        console.error('Error in switchTab:', error);
    }
};

// Update settings tab with current game info
async function updateSettingsTab() {
    const game = gameSelect.value;
    const gameNames = {
        borderlands4: 'Borderlands 4',
        tinytina: "Tiny Tina's Wonderlands",
        borderlands3: 'Borderlands 3',
        borderlands2: 'Borderlands 2'
    };
    
    settingsGameName.textContent = gameNames[game] || game;
    await loadSettingsUrls(game);
    await loadTimingSettings();
    await loadNotificationSettings();
}

// Update code overview in main tab
async function updateCodeOverview() {
    const game = gameSelect.value;
    const platform = platformSelect.value;
    const codeStates = await getCodeStates();
    const storedData = await browser.storage.local.get("gameNewCodes");
    const gameNewCodes = storedData.gameNewCodes || {};
    const gameSpecificCodes = gameNewCodes[game] || [];
    
    // Get states for current platform+game combination
    const currentStates = Object.entries(codeStates)
        .filter(([key, _]) => key.startsWith(`${platform}:${game}:`))
        .map(([key, value]) => ({
            code: key.split(':')[2], // platform:game:code format
            ...value
        }));
    
    // Count codes by state
    const counts = {
        new: 0,
        redeemed: 0,
        validated: 0,
        expired: 0,
        error: 0,
        checked: 0,
        invalid: 0
    };
    
    // Create a set of codes that already have states for this platform+game
    const codesWithStates = new Set(currentStates.map(gs => gs.code));
    
    // Count codes from currentStates (codes that have been processed for this platform+game)
    currentStates.forEach(codeInfo => {
        if (counts.hasOwnProperty(codeInfo.state)) {
            counts[codeInfo.state]++;
        }
    });
    
    // Count unprocessed codes (exist in gameNewCodes but not processed for this platform+game yet)
    const unprocessedCodesForCurrentPlatform = gameSpecificCodes.filter(code => !codesWithStates.has(code));
    counts.new += unprocessedCodesForCurrentPlatform.length;
    
    // Combine expired and invalid as "expired"
    counts.expired += counts.invalid;
    
    // Calculate total
    const total = counts.new + counts.redeemed + counts.validated + counts.expired + counts.error + counts.checked;
    
    // Update UI
    document.getElementById('newCount').textContent = counts.new;
    document.getElementById('redeemedCount').textContent = counts.redeemed;
    document.getElementById('validatedCount').textContent = counts.validated;
    document.getElementById('expiredCount').textContent = counts.expired;
    document.getElementById('errorCount').textContent = counts.error;
    document.getElementById('totalCount').textContent = total;
}

// Load timing settings
async function loadTimingSettings() {
    const result = await browser.storage.local.get(['timingSettings']);
    const settings = result.timingSettings || {
        codeDelay: 5,
        retryDelay: 15
    };
    
    codeDelayInput.value = settings.codeDelay;
    retryDelayInput.value = settings.retryDelay;
}

// Save timing settings
document.getElementById("saveTimingSettings").addEventListener("click", async () => {
    const codeDelay = parseInt(codeDelayInput.value) || 5;
    const retryDelay = parseInt(retryDelayInput.value) || 15;
    
    // Validate settings
    if (codeDelay < 1 || codeDelay > 60) {
        document.getElementById("settingsStatus").textContent = "Code delay must be between 1 and 60 seconds";
        document.getElementById("settingsStatus").style.color = "red";
        return;
    }
    if (retryDelay < 5 || retryDelay > 120) {
        document.getElementById("settingsStatus").textContent = "Retry delay must be between 5 and 120 seconds";
        document.getElementById("settingsStatus").style.color = "red";
        return;
    }
    
    const settings = {
        codeDelay: codeDelay,
        retryDelay: retryDelay
    };
    
    await browser.storage.local.set({ timingSettings: settings });
    
    document.getElementById("settingsStatus").textContent = "Timing settings saved successfully!";
    document.getElementById("settingsStatus").style.color = "green";
    setTimeout(() => {
        document.getElementById("settingsStatus").textContent = "";
    }, 3000);
});

// Load notification settings
async function loadNotificationSettings() {
    const result = await browser.storage.local.get(['notificationSettings']);
    const settings = result.notificationSettings || {
        enabled: false,
        intervalMinutes: 1440, // Default: 24 hours
        period: { days: 1, hours: 0, minutes: 0 },
        games: {
            borderlands4: false,
            borderlands3: false,
            borderlands2: false,
            borderlandsps: false,
            ttwonderlands: false
        }
    };
    
    // Update toggle switch state
    if (settings.enabled) {
        notificationToggle.classList.add('active');
    } else {
        notificationToggle.classList.remove('active');
    }
    
    // Set period values (with fallback to calculate from intervalMinutes)
    if (settings.period) {
        periodDays.value = settings.period.days;
        periodHours.value = settings.period.hours;
        periodMinutes.value = settings.period.minutes;
    } else {
        // Legacy: convert intervalMinutes to period
        const totalMinutes = settings.intervalMinutes || 1440;
        const days = Math.floor(totalMinutes / (24 * 60));
        const remainingMinutes = totalMinutes % (24 * 60);
        const hours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;
        
        periodDays.value = days;
        periodHours.value = hours;
        periodMinutes.value = minutes;
    }
    
    notifyBorderlands4.checked = settings.games.borderlands4;
    notifyBorderlands3.checked = settings.games.borderlands3;
    notifyBorderlands2.checked = settings.games.borderlands2;
    notifyBorderlandsPS.checked = settings.games.borderlandsps;
    notifyTTWonderlands.checked = settings.games.ttwonderlands;
    
    // Update visibility and preview
    const isEnabled = settings.enabled;
    notificationGamesSection.style.display = isEnabled ? 'block' : 'none';
    checkPeriodSection.style.display = isEnabled ? 'block' : 'none';
}

// Save notification settings
// **Save Notification Settings**
document.getElementById("saveNotificationSettings").addEventListener("click", async () => {
    // Calculate total minutes from period inputs
    const days = parseInt(periodDays.value) || 0;
    const hours = parseInt(periodHours.value) || 0;
    const minutes = parseInt(periodMinutes.value) || 0;
    
    // Calculate total minutes (with minimum of 1 minute)
    const totalMinutes = Math.max(1, (days * 24 * 60) + (hours * 60) + minutes);
    
    const settings = {
        enabled: notificationToggle.classList.contains('active'),
        intervalMinutes: totalMinutes,
        period: {
            days: days,
            hours: hours,
            minutes: minutes
        },
        games: {
            borderlands4: notifyBorderlands4.checked,
            borderlands3: notifyBorderlands3.checked,
            borderlands2: notifyBorderlands2.checked,
            borderlandsps: notifyBorderlandsPS.checked,
            ttwonderlands: notifyTTWonderlands.checked
        }
    };
    
    await browser.storage.local.set({ notificationSettings: settings });
    
    // Send message to background script to update alarm
    if (typeof browser !== 'undefined' && browser.runtime) {
        browser.runtime.sendMessage({
            action: 'updateNotificationSettings',
            settings: settings
        });
    }
    
    document.getElementById("notificationStatus").textContent = "Notification settings saved successfully!";
    document.getElementById("notificationStatus").style.color = "green";
    setTimeout(() => {
        document.getElementById("notificationStatus").textContent = "";
    }, 3000);
});

// Toggle switch functionality
notificationToggle.addEventListener('click', () => {
    const isActive = notificationToggle.classList.contains('active');
    
    if (isActive) {
        notificationToggle.classList.remove('active');
        notificationGamesSection.style.display = 'none';
        checkPeriodSection.style.display = 'none';
    } else {
        notificationToggle.classList.add('active');
        notificationGamesSection.style.display = 'block';
        checkPeriodSection.style.display = 'block';
    }
});

// Load URLs for settings tab
async function loadSettingsUrls(game) {
    const result = await browser.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    const gameUrls = customUrls[game] || defaultUrls[game] || [];
    displaySettingsUrls(gameUrls);
}

// Display URLs in settings tab
function displaySettingsUrls(urls) {
    settingsUrlList.innerHTML = '';
    
    urls.forEach((url, index) => {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-item';
        
        const urlText = document.createElement('div');
        urlText.className = 'url-text';
        urlText.textContent = url;
        
        const urlControls = document.createElement('div');
        urlControls.className = 'url-controls';
        
        const removeButton = document.createElement('button');
        removeButton.className = 'small-button';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => removeSettingsUrl(index));
        
        urlControls.appendChild(removeButton);
        urlItem.appendChild(urlText);
        urlItem.appendChild(urlControls);
        settingsUrlList.appendChild(urlItem);
    });
}

// Remove URL from settings
async function removeSettingsUrl(index) {
    const game = gameSelect.value;
    const result = await browser.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    if (!customUrls[game]) {
        customUrls[game] = [...(defaultUrls[game] || [])];
    }
    
    customUrls[game].splice(index, 1);
    await browser.storage.local.set({ customUrls });
    await loadSettingsUrls(game);
    statusElement.textContent = "URL removed successfully";
}

// Add URL from settings
settingsAddUrlButton.addEventListener('click', async () => {
    const newUrl = settingsNewUrlInput.value.trim();
    if (!newUrl) {
        statusElement.textContent = "Please enter a valid URL";
        return;
    }
    
    try {
        new URL(newUrl); // Validate URL
    } catch {
        statusElement.textContent = "Please enter a valid URL";
        return;
    }
    
    const game = gameSelect.value;

    try {
        const permissionGranted = await ensureOriginPermission(newUrl);
        if (!permissionGranted) {
            statusElement.textContent = "Site access denied. URL not added";
            return;
        }
    } catch (error) {
        console.error('Error ensuring permission for URL:', error);
        statusElement.textContent = "Unable to request permission for this URL";
        return;
    }

    const result = await browser.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    if (!customUrls[game]) {
        customUrls[game] = [...(defaultUrls[game] || [])];
    }
    
    if (!customUrls[game].includes(newUrl)) {
        customUrls[game].push(newUrl);
        await browser.storage.local.set({ customUrls });
        await loadSettingsUrls(game);
        settingsNewUrlInput.value = '';
        statusElement.textContent = "URL added successfully";
    } else {
        statusElement.textContent = "URL already exists";
    }
});

// Export Settings functionality
document.getElementById("exportSettings").addEventListener("click", async () => {
    try {
        // Gather all settings data
        const settingsData = await browser.storage.local.get([
            'selectedGame',
            'customUrls', 
            'timingSettings',
            'notificationSettings'
        ]);
        
        // Create export object with metadata
        const exportData = {
            exportDate: new Date().toISOString(),
            version: "2.0",
            extensionName: "Borderlands SHIFT Code Manager",
            settings: settingsData
        };
        
        // Convert to JSON
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Create download blob
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `shift-code-manager-settings-${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        const backupStatus = document.getElementById("backupStatus");
        backupStatus.textContent = "Settings exported successfully!";
        backupStatus.className = "backup-status success";
        setTimeout(() => {
            backupStatus.textContent = "";
            backupStatus.className = "backup-status";
        }, 3000);
        
    } catch (error) {
        console.error("Export error:", error);
        const backupStatus = document.getElementById("backupStatus");
        backupStatus.textContent = "Export failed: " + error.message;
        backupStatus.className = "backup-status error";
    }
});

// Import Settings functionality
document.getElementById("importSettings").addEventListener("click", () => {
    // Trigger file picker
    document.getElementById("importFileInput").click();
});

document.getElementById("importFileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Read file content
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate import data structure
        if (!importData.settings || typeof importData.settings !== 'object') {
            throw new Error("Invalid settings file format");
        }
        
        // Validate that it's from the correct extension
        if (importData.extensionName && !importData.extensionName.includes("SHIFT Code Manager")) {
            const confirmed = confirm("This file appears to be from a different extension. Continue importing?");
            if (!confirmed) return;
        }
        
        // Import settings
        const settingsToImport = importData.settings;
        
        // Validate and set each setting
        if (settingsToImport.selectedGame) {
            await browser.storage.local.set({ selectedGame: settingsToImport.selectedGame });
            gameSelect.value = settingsToImport.selectedGame;
        }
        
        if (settingsToImport.customUrls) {
            await browser.storage.local.set({ customUrls: settingsToImport.customUrls });
        }
        
        if (settingsToImport.timingSettings) {
            await browser.storage.local.set({ timingSettings: settingsToImport.timingSettings });
        }
        
        if (settingsToImport.notificationSettings) {
            await browser.storage.local.set({ notificationSettings: settingsToImport.notificationSettings });
            // Update background alarm with new settings
            browser.runtime.sendMessage({
                action: 'updateNotificationSettings',
                settings: settingsToImport.notificationSettings
            });
        }
        
        // Refresh UI
        await loadSettings();
        await updateSettingsTab();
        
        // Show success message
        const backupStatus = document.getElementById("backupStatus");
        backupStatus.textContent = `Settings imported successfully! (from ${importData.exportDate ? new Date(importData.exportDate).toLocaleDateString() : 'unknown date'})`;
        backupStatus.className = "backup-status success";
        setTimeout(() => {
            backupStatus.textContent = "";
            backupStatus.className = "backup-status";
        }, 5000);
        
    } catch (error) {
        console.error("Import error:", error);
        const backupStatus = document.getElementById("backupStatus");
        backupStatus.textContent = "Import failed: " + error.message;
        backupStatus.className = "backup-status error";
    }
    
    // Clear file input
    event.target.value = '';
});

// Code states
const CODE_STATES = {
    NEW: 'new',
    CHECKING: 'checking',
    EXPIRED: 'expired',
    INVALID: 'invalid',
    REDEEMED: 'redeemed',
    VALIDATED: 'validated',
    ERROR: 'error',
    TO_BE_REDEEMED: 'to_be_redeemed',
    CHECKED: 'checked'
};

// Code state management functions
async function getCodeStates() {
    const result = await browser.storage.local.get(['codeStates']);
    return result.codeStates || {};
}

async function setCodeState(code, state, game, platform) {
    const codeStates = await getCodeStates();
    const key = `${platform}:${game}:${code}`;
    
    // Protect redeemed and validated codes from being changed to error or expired states
    const currentState = codeStates[key]?.state;
    if ((currentState === CODE_STATES.REDEEMED || currentState === CODE_STATES.VALIDATED) && 
        (state === CODE_STATES.ERROR || state === CODE_STATES.EXPIRED || state === CODE_STATES.INVALID)) {
        return;
    }
    
    // Allow validation promotion from redeemed to validated
    if (currentState === CODE_STATES.REDEEMED && state === CODE_STATES.VALIDATED) {
    }
    
    codeStates[key] = {
        state: state,
        timestamp: Date.now(),
        game: game,
        platform: platform,
        retryCount: codeStates[key]?.retryCount || 0
    };
    
    await browser.storage.local.set({ codeStates });
}

async function getCodeState(code, game, platform) {
    const codeStates = await getCodeStates();
    const key = `${platform}:${game}:${code}`;
    return codeStates[key] || { state: CODE_STATES.NEW, retryCount: 0 };
}

async function incrementRetryCount(code, game, platform) {
    const codeStates = await getCodeStates();
    const key = `${platform}:${game}:${code}`;
    if (codeStates[key]) {
        codeStates[key].retryCount = (codeStates[key].retryCount || 0) + 1;
        codeStates[key].timestamp = Date.now();
        await browser.storage.local.set({ codeStates });
    }
}

// Default URLs for different games
const defaultUrls = {
    borderlands4: [
        "https://www.polygon.com/borderlands-4-active-shift-codes-redeem/",
        "https://mentalmars.com/game-news/borderlands-4-shift-codes/"
    ],
    tinytina: [
        "https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/",
        "https://www.rockpapershotgun.com/tiny-tinas-wonderlands-shift-codes"
    ],
    borderlands3: [
    ],
    borderlands2: [
    ]
};

// Load settings from storage
async function loadSettings() {
    const result = await browser.storage.local.get(['selectedGame', 'customUrls', 'gameNewCodes']);
    
    // Set selected game
    const selectedGame = result.selectedGame || 'borderlands4';
    gameSelect.value = selectedGame;
    
    // Load URLs for the selected game
    await loadUrlsForGame(selectedGame);
    
    // Update code overview
    await updateCodeOverview();
}

// Load URLs for a specific game (for main tab reference only)
async function loadUrlsForGame(game) {
    const result = await browser.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    // Get URLs for this game (custom URLs or default ones)
    const gameUrls = customUrls[game] || defaultUrls[game] || [];
    
    // No need to display URLs on main tab anymore
    return gameUrls;
}

// Handle game selection change
gameSelect.addEventListener('change', async () => {
    const selectedGame = gameSelect.value;
    await browser.storage.local.set({ selectedGame });
    await loadUrlsForGame(selectedGame);
    statusElement.textContent = `Switched to ${gameSelect.options[gameSelect.selectedIndex].text}`;
    
    // Update code overview for new game
    await updateCodeOverview();
    
    // Update settings tab if it's active
    if (document.getElementById('settings-tab').classList.contains('active')) {
        await updateSettingsTab();
    }
});

// Handle platform selection change
platformSelect.addEventListener('change', async () => {
    // Update code overview for new platform
    await updateCodeOverview();
});

// **Reset storage Button**
document.getElementById("resetStorage").addEventListener("click", async () => {
    // Show confirmation dialog
    const confirmed = confirm(
        "Are you sure you want to reset storage?\n\n" +
        "This will permanently delete:\n" +
        "- All stored SHIFT codes\n" +
        "- All code redemption states\n" +
        "- Code processing history\n\n" +
        "This action cannot be undone!"
    );
    
    if (!confirmed) {
        return; // User cancelled, do nothing
    }
    
    await browser.storage.local.remove("ShiftCodes");
    await browser.storage.local.remove("newShiftCodes");
    await browser.storage.local.remove("gameNewCodes");
    await browser.storage.local.remove("codeStates");
    statusElement.textContent = "Storage reset successfully";
    // Update code overview after reset
    await updateCodeOverview();
});

// **View Code States Button**
document.getElementById("viewStatesButton").addEventListener("click", async () => {
    const game = gameSelect.value;
    const platform = platformSelect.value;
    const codeStates = await getCodeStates();
    
    // Filter for current platform+game combination
    const platformGameStates = Object.entries(codeStates)
        .filter(([key, _]) => key.startsWith(`${platform}:${game}:`))
        .map(([key, value]) => ({
            code: key.split(':')[2], // platform:game:code format
            platform: key.split(':')[0],
            game: key.split(':')[1],
            ...value
        }));

    if (platformGameStates.length === 0) {
        statusElement.textContent = `No codes found for ${platform} - ${game}`;
        return;
    }

    // Group by state
    const stateGroups = {};
    platformGameStates.forEach(codeInfo => {
        if (!stateGroups[codeInfo.state]) {
            stateGroups[codeInfo.state] = [];
        }
        stateGroups[codeInfo.state].push(codeInfo);
    });

    let message = `Code states for ${platform} - ${game}:\n`;
    Object.entries(stateGroups).forEach(([state, codes]) => {
        message += `${state.toUpperCase()}: ${codes.length} codes\n`;
        codes.slice(0, 3).forEach(code => {
            message += `  - ${code.code} (retries: ${code.retryCount})\n`;
        });
        if (codes.length > 3) {
            message += `  - ... and ${codes.length - 3} more\n`;
        }
    });

    alert(message);
});

// **Fetch Codes Button**
document.getElementById("fetchCodesButton").addEventListener("click", async () => {
    statusElement.textContent = "Fetching new codes...";

    try {
        // Get current game and its URLs
        const game = gameSelect.value;
        const result = await browser.storage.local.get(['customUrls']);
        const customUrls = result.customUrls || {};
        const gameUrls = customUrls[game] || defaultUrls[game] || [];
        
        if (gameUrls.length === 0) {
            statusElement.textContent = "No URLs configured for this game";
            return;
        }

        // Send a message to the background script to fetch codes
        const response = await browser.runtime.sendMessage({ 
            action: "fetchCodes", 
            urls: gameUrls,
            game: game
        });

        // Handle response
        if (response && response.success) {
            statusElement.textContent = `Fetched and stored ${response.newCodes.length} new codes!`;
            // Update code overview after fetching new codes
            await updateCodeOverview();
        } else {
            statusElement.textContent = "Failed to fetch codes!";
            console.error("Fetch failed:", response ? response.error : "response undefined");
        }
    } catch (error) {
        console.error("Error fetching codes:", error);
        statusElement.textContent = "Error fetching codes!";
    }
});

// **Redeem Codes Button**
document.getElementById("redeemCodesButton").addEventListener("click", async () => {
    const redeemButton = document.getElementById("redeemCodesButton");
    
    // If already redeeming, stop the process
    if (isRedeeming) {
        shouldStopRedemption = true;
        redeemButton.textContent = "Stopping...";
        redeemButton.disabled = true;
        statusElement.textContent = "Stopping redemption process...";
        return;
    }
    
    // Start redemption process
    isRedeeming = true;
    shouldStopRedemption = false;
    redeemButton.textContent = "Stop Redeeming";
    statusElement.textContent = "Starting redemption process...";

    // Get selected game and platform
    const game = gameSelect.value;
    const platform = platformSelect.value;

    // Load timing settings
    const timingResult = await browser.storage.local.get(['timingSettings']);
    const timingSettings = timingResult.timingSettings || {
        codeDelay: 5,
        retryDelay: 15
    };

    // Retrieve stored codes for this specific game
    const storedData = await browser.storage.local.get("gameNewCodes");
    const gameNewCodes = storedData.gameNewCodes || {};
    let allCodes = gameNewCodes[game] || [];
    
    // If gameNewCodes is empty but we have codeStates, reconstruct the codes from codeStates
    if (allCodes.length === 0) {
        const codeStates = await getCodeStates();
        const codesFromStates = Object.keys(codeStates)
            .filter(key => key.includes(`:${game}:`)) // Any platform for this game
            .map(key => key.split(':')[2]) // Extract code from platform:game:code
            .filter((code, index, self) => self.indexOf(code) === index); // Remove duplicates
        
        allCodes = codesFromStates;
    }

    if (allCodes.length === 0) {
        statusElement.textContent = `No codes available for ${game.charAt(0).toUpperCase() + game.slice(1)}! Use 'Fetch Codes' to get new codes.`;
        resetRedeemButton();
        return;
    }

    // Filter codes that need to be processed for this platform+game combination
    const codesToProcess = [];
    for (const code of allCodes) {
        const codeState = await getCodeState(code, game, platform);
        // Process codes that are new, errored, or marked to be redeemed
        // Skip redeemed and validated codes
        if (!codeState || ['new', 'error', 'to_be_redeemed'].includes(codeState.state)) {
            codesToProcess.push({ code, state: codeState?.state || 'new' });
        }
    }

    if (codesToProcess.length === 0) {
        statusElement.textContent = `No codes need redemption for ${platform.charAt(0).toUpperCase() + platform.slice(1)} on ${game.charAt(0).toUpperCase() + game.slice(1)}! All codes are already processed.`;
        resetRedeemButton();
        return;
    }

    // Check if stop was requested during setup
    if (shouldStopRedemption) {
        statusElement.textContent = "Redemption stopped by user";
        resetRedeemButton();
        return;
    }

    try {
        const waitForReloadAndInject = async () => {
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === "complete") {
                        browser.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                browser.tabs.onUpdated.addListener(listener);
            });

            const response = await browser.tabs.sendMessage(tab.id, {
                action: "heartbeat"
            });
            if (response && response.status === "alive") {
                return;
            }
            await browser.tabs.executeScript(tab.id, {
                file: "shift-handler.js"
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
        };

        // Function to check final redemption result by sending message to content script
        const checkFinalResult = async (tabId, code) => {
            try {
                // Send message to content script to check the page content
                const result = await browser.tabs.sendMessage(tabId, {
                    action: "checkFinalResult",
                    code: code
                });
                
                return result || { success: false, state: 'error', error: 'No result from content script' };
                
            } catch (error) {
                console.error(`Error checking final result for ${code}:`, error);
                return { success: false, state: 'error', error: error.message };
            }
        };

        const processCode = async (code, retryCount = 0) => {
            // Set code as being checked
            await setCodeState(code, CODE_STATES.CHECKING, game, platform);

            try {
                // Send message to the injected content script to start redemption
                
                let redemptionResult = null;
                try {
                    // Try to get a response - this will work for error cases (expired/invalid/already redeemed)
                    // but will fail for successful redemptions due to page redirect
                    redemptionResult = await browser.tabs.sendMessage(tab.id, {
                        action: "redeemCode",
                        code: code,
                        game: game,
                        platforms: [platform], // Single platform array
                        maxRetries: 0,
                        currentRetry: retryCount
                    });
                } catch (messageError) {
                    // No immediate response (likely successful redemption with redirect)
                }
                
                // If we got an immediate error response (expired/invalid/already redeemed), handle it
                if (redemptionResult && !redemptionResult.success && redemptionResult.state !== 'submitted') {
                    if (redemptionResult.state === 'checked') {
                        await setCodeState(code, CODE_STATES.VALIDATED, game, platform);
                        return { success: true, state: 'validated', alreadyRedeemed: true };
                    } else if (redemptionResult.state === 'expired') {
                        await setCodeState(code, CODE_STATES.EXPIRED, game, platform);
                        return { success: false, state: 'expired' };
                    } else if (redemptionResult.state === 'invalid') {
                        await setCodeState(code, CODE_STATES.INVALID, game, platform);
                        return { success: false, state: 'invalid' };
                    } else {
                        await setCodeState(code, CODE_STATES.ERROR, game, platform);
                        return { success: false, state: 'error', error: redemptionResult.error };
                    }
                }
                
                // Re-inject content script after redirect
                await waitForReloadAndInject();
                
                // Wait 500ms before checking the response
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Now check the final result on the page
                const finalResult = await checkFinalResult(tab.id, code);
                
                if (finalResult.state === 'redeemed') {
                    await setCodeState(code, CODE_STATES.REDEEMED, game, platform);
                    return { success: true, state: 'redeemed' };
                } else if (finalResult.state === 'checked') {
                    await setCodeState(code, CODE_STATES.VALIDATED, game, platform);
                    return { success: true, state: 'validated', alreadyRedeemed: true };
                } else if (finalResult.state === 'expired') {
                    await setCodeState(code, CODE_STATES.EXPIRED, game, platform);
                    return { success: false, state: 'expired' };
                } else if (finalResult.state === 'invalid') {
                    await setCodeState(code, CODE_STATES.INVALID, game, platform);
                    return { success: false, state: 'invalid' };
                } else {
                    await setCodeState(code, CODE_STATES.ERROR, game, platform);
                    return { success: false, state: 'error', error: finalResult.error || 'Unknown error' };
                }

            } catch (error) {
                console.error(`Error processing code ${code}:`, error);
                await setCodeState(code, CODE_STATES.ERROR, game, platform);
                return { success: false, state: 'error', error: error.message };
            }
        };

        const url = "https://shift.gearboxsoftware.com/rewards";

        let tab = (await browser.tabs.query({ url: url })).pop();
        if (!tab) {
            tab = await browser.tabs.create({ url: url });
        }

        await browser.tabs.update(tab.id, { url: url });
        await waitForReloadAndInject();

        // Check if user needs to log in
        const tabInfo = await browser.tabs.get(tab.id);
        if (isLoginRequired(tabInfo.url)) {
            statusElement.textContent = "Not logged in! Please log in to SHIFT in the opened tab and try again";
            resetRedeemButton();
            return;
        }

        let totalProcessed = 0;
        let redeemedCount = 0;
        let finalErrorCount = 0;
        let codeQueue = [...codesToProcess];
        let erroredCodes = [];
        let retryRound = 0;
        const maxRetryRounds = 3;

        // Main processing loop
        while (codeQueue.length > 0 && retryRound <= maxRetryRounds && !shouldStopRedemption) {
            if (retryRound > 0) {
                statusElement.textContent = `Retry round ${retryRound}/${maxRetryRounds} - ${codeQueue.length} codes remaining`;
                console.info(`Starting retry round ${retryRound} with ${codeQueue.length} codes`);
                
                // Update code overview at start of retry round
                await updateCodeOverview();
                
                // Use configurable retry delay
                const retryDelay = timingSettings.retryDelay * 1000 + (retryRound * 5000);
                statusElement.textContent = `Waiting ${retryDelay/1000}s before retry round ${retryRound}...`;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Reload page before retry round
                await browser.tabs.update(tab.id, { url: url });
                await waitForReloadAndInject();
                await new Promise(resolve => setTimeout(resolve, 3000)); // Longer page load wait
                
                // Check if user needs to log in after page reload
                const tabInfo = await browser.tabs.get(tab.id);
                if (isLoginRequired(tabInfo.url)) {
                    statusElement.textContent = "Session expired! Please log in to SHIFT in the opened tab and try again";
                    resetRedeemButton();
                    return;
                }
            }

            const currentBatch = [...codeQueue];
            codeQueue = [];
            erroredCodes = [];

            for (let i = 0; i < currentBatch.length; i++) {
                // Check if user wants to stop redemption
                if (shouldStopRedemption) {
                    console.info("Redemption process stopped by user");
                    statusElement.textContent = "Redemption stopped by user";
                    resetRedeemButton();
                    return;
                }
                
                const { code } = currentBatch[i];
                totalProcessed++;
                
                statusElement.textContent = `Round ${retryRound + 1}: Processing ${i + 1}/${currentBatch.length}: ${code}`;
                
                const result = await processCode(code, retryRound);
                
                if (result.success || result.state === 'validated' || result.state === 'redeemed' || result.state === 'checked') {
                    const statusMsg = result.validated ? 'Redeemed and validated' : 
                                     result.alreadyRedeemed ? 'Already redeemed (validated)' : 
                                     result.state === 'validated' ? 'Validated' :
                                     result.state === 'checked' ? 'Already redeemed (checked)' :
                                     'Redeemed successfully';
                    redeemedCount++;
                    // Update code overview immediately after successful redemption
                    await updateCodeOverview();
                } else if (result.state === 'error' && retryRound < maxRetryRounds) {
                    console.warn(`✗ Error with ${code}, will retry in next round`);
                    erroredCodes.push({ code, state: result });
                    await incrementRetryCount(code, game);
                    // Update code overview even for errors that will be retried
                    await updateCodeOverview();
                } else {
                    console.warn(`✗ Final result for ${code}: ${result.state} - ${result.error}`);
                    if (result.state === 'error') {
                        finalErrorCount++;
                    }
                    // Update code overview for ALL final states (including errors)
                    await updateCodeOverview();
                }

                // Safety net: Always update overview after each code processing
                // This ensures overview is updated even if we missed a case above
                try {
                    await updateCodeOverview();
                } catch (overviewError) {
                    console.error('Error updating overview:', overviewError);
                }

                // Use configurable delay between codes (longer if we did validation)
                if (i < currentBatch.length - 1) {
                    const baseDelay = timingSettings.codeDelay * 1000;
                    const extraDelayForValidation = (result.validated) ? 2000 : 0; // Extra 2s if we validated
                    const delay = retryRound === 0 ? baseDelay + extraDelayForValidation : baseDelay + extraDelayForValidation + (retryRound * 2000);
                    statusElement.textContent = `Round ${retryRound + 1}: Waiting ${delay/1000}s before next code...`;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                // Check for rate limiting message
                try {
                    const message = await browser.tabs.executeScript(tab.id, {
                        code: `
                            const notice = document.getElementsByClassName("alert notice")[0];
                            notice ? notice.innerHTML : null;
                        `
                    });
                    
                    if (message && message[0] && message[0].includes("To continue to redeem SHiFT codes, please launch a SHiFT-enabled title first!")) {
                        statusElement.textContent = "Rate limited - please launch a SHiFT-enabled game first!";
                        // Exit all loops
                        codeQueue = [];
                        erroredCodes = [];
                        retryRound = maxRetryRounds + 1;
                        break;
                    }
                } catch (e) {
                    // Ignore script execution errors
                }
            }

            // Prepare for next retry round
            if (erroredCodes.length > 0 && retryRound < maxRetryRounds) {
                codeQueue = erroredCodes;
                retryRound++;
            } else {
                break;
            }
        }

        // Check if process was stopped by user
        if (shouldStopRedemption) {
            statusElement.textContent = "Redemption process stopped by user";
            resetRedeemButton();
            return;
        }

        // Final status update
        const expiredCount = totalProcessed - redeemedCount - finalErrorCount;
        statusElement.textContent = `Completed! Redeemed: ${redeemedCount}, Errors: ${finalErrorCount}, Other: ${expiredCount}, Total: ${totalProcessed}`;
        
        // Update storage to remove codes that are successfully processed for the current platform
        // Don't modify the original gameNewCodes storage since it should be shared across platforms
        // Individual code states are tracked per platform:game:code, so we don't need to remove codes

        console.info(`Redemption process completed for ${platform} on ${game}.`);
        
        // Update code overview after redemption process
        await updateCodeOverview();
        
        // Reset button state
        resetRedeemButton();

    } catch (error) {
        console.error("Error in redemption process:", error);
        statusElement.textContent = "Error during redemption process!";
        resetRedeemButton();
    }
});

// Initialize popup
document.addEventListener('DOMContentLoaded', function() {

    // Clear badge when popup is opened
    if (typeof browser !== 'undefined' && browser.browserAction) {
        browser.browserAction.setBadgeText({ text: '' });
    }

    // Add event listeners to tab buttons
    const mainTabBtn = document.getElementById('mainTabBtn');
    const settingsTabBtn = document.getElementById('settingsTabBtn');

    if (mainTabBtn) {
        mainTabBtn.addEventListener('click', function(event) {
            switchTab('main', event);
        });
    }

    if (settingsTabBtn) {
        settingsTabBtn.addEventListener('click', function(event) {
            switchTab('settings', event);
        });
    }

    // Help button functionality (DOMContentLoaded)
    const helpButton = document.getElementById('helpButton');

    if (helpButton) {
        helpButton.addEventListener('click', () => {
            try {
                const helpUrl = browser.runtime.getURL('help.html');

                browser.tabs.create({
                    url: helpUrl,
                    active: true
                }).catch((error) => {
                    console.error("Error creating help tab (DOMContentLoaded):", error);
                });
            } catch (error) {
                console.error("Error in help button click handler (DOMContentLoaded):", error);
            }
        });
    } else {
        console.error("Help button not found in DOMContentLoaded!");
    }

    loadSettings().catch(error => {
        console.error('Error loading settings:', error);
    });
});

// Fallback initialization (in case DOMContentLoaded already fired)
if (document.readyState === 'loading') {
    // Document still loading
} else {
    // Document already loaded
    // Add event listeners immediately
    setTimeout(() => {
        const mainTabBtn = document.getElementById('mainTabBtn');
        const settingsTabBtn = document.getElementById('settingsTabBtn');
        
        if (mainTabBtn) {
            mainTabBtn.addEventListener('click', function(event) {
                switchTab('main', event);
            });
        }
        
        if (settingsTabBtn) {
            settingsTabBtn.addEventListener('click', function(event) {
                switchTab('settings', event);
            });
        }
    }, 100);
    
    // Help button functionality
    const helpButton = document.getElementById("helpButton");
    
    if (helpButton) {
        helpButton.addEventListener("click", () => {
            
            try {
                const helpUrl = browser.runtime.getURL("help.html");
                browser.tabs.create({
                    url: helpUrl,
                    active: true
                }).catch((error) => {
                    console.error("Error creating help tab:", error);
                });
            } catch (error) {
                console.error("Error in help button click handler:", error);
            }
        });
    } else {
        console.error("Help button not found! Available elements with 'help' in ID:");
        const allElements = document.querySelectorAll("*[id*='help'], *[id*='Help']");
        console.debug("Elements with 'help' in ID:", allElements);
        console.debug("All button elements:", document.querySelectorAll("button"));
    }
    
    loadSettings();
}
