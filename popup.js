const statusElement = document.getElementById("status");
const gameSelect = document.getElementById("gameSelect");
const platformSelect = document.getElementById("platformSelect");
const skipCurrentButton = document.getElementById("skipCurrentButton");

// Settings tab elements
const settingsUrlList = document.getElementById("settingsUrlList");
const settingsNewUrlInput = document.getElementById("settingsNewUrlInput");
const settingsAddUrlButton = document.getElementById("settingsAddUrlButton");
const settingsGameName = document.getElementById("settingsGameName");
const codeDelayInput = document.getElementById("codeDelay");
const retryDelayInput = document.getElementById("retryDelay");
const darkModeToggle = document.getElementById("darkModeToggle");

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

const browserApi = typeof browser !== 'undefined' ? browser : chrome;
const actionApi = browserApi.action || browserApi.browserAction;
const REWARDS_URL = "https://shift.gearboxsoftware.com/rewards";
const shiftConfig = globalThis.SHIFT_CONFIG || {};
const CONFIG_GAMES = Array.isArray(shiftConfig.games) ? shiftConfig.games : [];
const CONFIG_PLATFORMS = Array.isArray(shiftConfig.platforms) ? shiftConfig.platforms : [];
const defaultUrlsByGame = CONFIG_GAMES.reduce((acc, game) => {
    if (game && game.id) {
        acc[game.id] = Array.isArray(game.defaultUrls) ? game.defaultUrls : [];
    }
    return acc;
}, {});
const gameLabelsById = CONFIG_GAMES.reduce((acc, game) => {
    if (game && game.id) {
        acc[game.id] = game.label || game.id;
    }
    return acc;
}, {});

function setSelectOptions(select, options) {
    if (!select || options.length === 0) {
        return;
    }
    const currentValue = select.value;
    select.innerHTML = '';
    options.forEach((option) => {
        const value = option.id || option.value || option;
        const label = option.label || option.name || value;
        if (!value) {
            return;
        }
        const entry = document.createElement('option');
        entry.value = value;
        entry.textContent = label;
        select.appendChild(entry);
    });
    if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
        select.value = currentValue;
    }
}

function hasSelectOption(select, value) {
    if (!select) {
        return false;
    }
    return Array.from(select.options).some((option) => option.value === value);
}

function initializeSelectOptions() {
    if (CONFIG_GAMES.length > 0) {
        setSelectOptions(gameSelect, CONFIG_GAMES);
    }
    if (CONFIG_PLATFORMS.length > 0) {
        setSelectOptions(platformSelect, CONFIG_PLATFORMS);
    }
}
const redemptionController = globalThis.RedeemRunner?.createRedemptionController
    ? globalThis.RedeemRunner.createRedemptionController()
    : null;

// Redemption state tracking
let isRedeeming = false;
let currentRedeemCode = null;
let currentRedemptionTabId = null;

// Helper function to reset redemption button state
function resetRedeemButton() {
    const redeemButton = document.getElementById("redeemCodesButton");
    redeemButton.textContent = "Redeem Codes";
    redeemButton.disabled = false;
    isRedeeming = false;
    currentRedeemCode = null;
    currentRedemptionTabId = null;
    redemptionController?.reset();
    if (skipCurrentButton) {
        skipCurrentButton.disabled = true;
    }
}

async function refreshRedemptionTab() {
    if (!currentRedemptionTabId) {
        return;
    }

    try {
        await browserApi.tabs.update(currentRedemptionTabId, { url: REWARDS_URL });
    } catch (error) {
        console.error("Error refreshing redemption tab:", error);
    }
}

async function requestSkipCurrentCode() {
    if (!isRedeeming || !currentRedeemCode) {
        statusElement.textContent = "No code currently processing to skip.";
        return;
    }

    statusElement.textContent = `Skipping ${currentRedeemCode}...`;
    redemptionController?.requestSkip();

    await refreshRedemptionTab();
}

if (skipCurrentButton) {
    skipCurrentButton.addEventListener("click", () => {
        requestSkipCurrentCode().catch((error) => {
            console.error("Skip failed:", error);
        });
    });
}

async function injectContentScript(tabId, file) {
    if (browserApi.scripting?.executeScript) {
        await browserApi.scripting.executeScript({
            target: { tabId },
            files: [file]
        });
    } else if (browserApi.tabs?.executeScript) {
        await browserApi.tabs.executeScript(tabId, { file });
    } else {
        throw new Error('No available API to inject scripts');
    }
}

async function evaluateInTab(tabId, func) {
    if (browserApi.scripting?.executeScript) {
        const [result] = await browserApi.scripting.executeScript({
            target: { tabId },
            func
        });
        return result?.result;
    }

    if (browserApi.tabs?.executeScript) {
        const [result] = await browserApi.tabs.executeScript(tabId, {
            code: `(${func.toString()})();`
        });
        return result;
    }

    throw new Error('No available API to evaluate scripts');
}

// Function to check final redemption result by sending message to content script
async function checkFinalResult(tabId, code) {
    try {
        const result = await browserApi.tabs.sendMessage(tabId, {
            action: "checkFinalResult",
            code: code
        });

        return result || { success: false, state: 'error', error: 'No result from content script' };
    } catch (error) {
        console.error(`Error checking final result for ${code}:`, error);
        return { success: false, state: 'error', error: error.message };
    }
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
    settingsGameName.textContent = gameLabelsById[game] || game;
    await loadSettingsUrls(game);
    await loadTimingSettings();
    await loadNotificationSettings();
    await loadAppearanceSettings();
}

// Update code overview in main tab
async function updateCodeOverview() {
    const game = gameSelect.value;
    const platform = platformSelect.value;
    const codeStates = await getCodeStates();
    const storedData = await browserApi.storage.local.get("gameNewCodes");
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
    // counts.expired += counts.invalid;
    
    // Calculate total
    const total = counts.new + counts.redeemed + counts.validated + counts.expired + counts.error + counts.checked + counts.invalid;
    
    // Update UI
    document.getElementById('newCount').textContent = counts.new;
    document.getElementById('redeemedCount').textContent = counts.redeemed;
    document.getElementById('validatedCount').textContent = counts.validated;
    document.getElementById('expiredCount').textContent = counts.expired;
    document.getElementById('invalidCount').textContent = counts.invalid;
    document.getElementById('errorCount').textContent = counts.error;
    document.getElementById('totalCount').textContent = total;
}

// Load timing settings
async function loadTimingSettings() {
    const result = await browserApi.storage.local.get(['timingSettings']);
    const settings = result.timingSettings || {
        codeDelay: 5,
        retryDelay: 15
    };
    
    codeDelayInput.value = settings.codeDelay;
    retryDelayInput.value = settings.retryDelay;
}

// Save timing settings
document.getElementById("saveTimingSettings").addEventListener("click", async () => {
    try {
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
        
        await browserApi.storage.local.set({ timingSettings: settings });
        
        document.getElementById("settingsStatus").textContent = "Timing settings saved successfully!";
        document.getElementById("settingsStatus").style.color = "green";
        setTimeout(() => {
            document.getElementById("settingsStatus").textContent = "";
        }, 3000);
    } catch (error) {
        console.error("Failed to save timing settings:", error);
        document.getElementById("settingsStatus").textContent = "Failed to save settings!";
        document.getElementById("settingsStatus").style.color = "red";
    }
});

// Load notification settings
async function loadNotificationSettings() {
    const result = await browserApi.storage.local.get(['notificationSettings']);
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

function applyDarkModeClass(isEnabled) {
    if (isEnabled) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

async function loadAppearanceSettings() {
    try {
        const result = await browserApi.storage.local.get(['appearanceSettings']);
        const settings = result.appearanceSettings || { darkMode: false };
        applyDarkModeClass(settings.darkMode);
        if (darkModeToggle) {
            darkModeToggle.classList.toggle('active', settings.darkMode);
        }
    } catch (error) {
        console.error('Error loading appearance settings:', error);
    }
}

// Save notification settings
// **Save Notification Settings**
document.getElementById("saveNotificationSettings").addEventListener("click", async () => {
    try {
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
        
        await browserApi.storage.local.set({ notificationSettings: settings });
        
        // Send message to background script to update alarm
        if (browserApi.runtime?.sendMessage) {
            browserApi.runtime.sendMessage({
                action: 'updateNotificationSettings',
                settings: settings
            });
        }
        
        document.getElementById("notificationStatus").textContent = "Notification settings saved successfully!";
        document.getElementById("notificationStatus").style.color = "green";
        setTimeout(() => {
            document.getElementById("notificationStatus").textContent = "";
        }, 3000);
    } catch (error) {
        console.error("Failed to save notification settings:", error);
        document.getElementById("notificationStatus").textContent = "Failed to save settings!";
        document.getElementById("notificationStatus").style.color = "red";
    }
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

if (darkModeToggle) {
    darkModeToggle.addEventListener('click', async () => {
        const willEnable = !darkModeToggle.classList.contains('active');
        darkModeToggle.classList.toggle('active', willEnable);
        applyDarkModeClass(willEnable);
        try {
            await browserApi.storage.local.set({ appearanceSettings: { darkMode: willEnable } });
        } catch (error) {
            console.error('Error saving appearance settings:', error);
        }
    });
}

// Load URLs for settings tab
async function loadSettingsUrls(game) {
    const result = await browserApi.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    const gameUrls = customUrls[game] || defaultUrlsByGame[game] || [];
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
    const result = await browserApi.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    if (!customUrls[game]) {
        customUrls[game] = [...(defaultUrlsByGame[game] || [])];
    }
    
    customUrls[game].splice(index, 1);
    await browserApi.storage.local.set({ customUrls });
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

    const result = await browserApi.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    if (!customUrls[game]) {
        customUrls[game] = [...(defaultUrlsByGame[game] || [])];
    }
    
    if (!customUrls[game].includes(newUrl)) {
        customUrls[game].push(newUrl);
        await browserApi.storage.local.set({ customUrls });
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
        const settingsData = await browserApi.storage.local.get([
            'selectedGame',
            'selectedPlatform',
            'customUrls',
            'timingSettings',
            'notificationSettings',
            'appearanceSettings',
            'codeStates'
        ]);
        
        // Create export object with metadata
        const exportData = {
            exportDate: new Date().toISOString(),
            version: "2.1",
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
            await browserApi.storage.local.set({ selectedGame: settingsToImport.selectedGame });
            gameSelect.value = settingsToImport.selectedGame;
        }
        
        if (settingsToImport.selectedPlatform) {
            await browserApi.storage.local.set({ selectedPlatform: settingsToImport.selectedPlatform });
            if (platformSelect) {
                platformSelect.value = settingsToImport.selectedPlatform;
            }
        }

        if (settingsToImport.customUrls) {
            await browserApi.storage.local.set({ customUrls: settingsToImport.customUrls });
        }
        
        if (settingsToImport.timingSettings) {
            await browserApi.storage.local.set({ timingSettings: settingsToImport.timingSettings });
        }
        
        if (settingsToImport.notificationSettings) {
            await browserApi.storage.local.set({ notificationSettings: settingsToImport.notificationSettings });
            // Update background alarm with new settings
            browserApi.runtime.sendMessage({
                action: 'updateNotificationSettings',
                settings: settingsToImport.notificationSettings
            });
        }

        if (settingsToImport.appearanceSettings) {
            await browserApi.storage.local.set({ appearanceSettings: settingsToImport.appearanceSettings });
        }

        if (settingsToImport.codeStates) {
            await browserApi.storage.local.set({ codeStates: settingsToImport.codeStates });
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
    const result = await browserApi.storage.local.get(['codeStates']);
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
    
    await browserApi.storage.local.set({ codeStates });
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
        await browserApi.storage.local.set({ codeStates });
    }
}

// Load settings from storage
async function loadSettings() {
    const result = await browserApi.storage.local.get(['selectedGame', 'selectedPlatform', 'customUrls', 'gameNewCodes']);
    
    // Set selected game
    const defaultGame = CONFIG_GAMES[0]?.id || 'borderlands4';
    const selectedGame = result.selectedGame || defaultGame;
    gameSelect.value = hasSelectOption(gameSelect, selectedGame) ? selectedGame : defaultGame;

    // Set selected platform
    const defaultPlatform = CONFIG_PLATFORMS[0]?.id || 'steam';
    const selectedPlatform = result.selectedPlatform || defaultPlatform;
    if (platformSelect) {
        platformSelect.value = hasSelectOption(platformSelect, selectedPlatform) ? selectedPlatform : defaultPlatform;
    }
    
    // Load URLs for the selected game
    await loadUrlsForGame(selectedGame);
    
    // Load other settings
    await loadTimingSettings();
    await loadNotificationSettings();

    // Update code overview
    await updateCodeOverview();

    await loadAppearanceSettings();
}

// Load URLs for a specific game (for main tab reference only)
async function loadUrlsForGame(game) {
    const result = await browserApi.storage.local.get(['customUrls']);
    const customUrls = result.customUrls || {};
    
    // Get URLs for this game (custom URLs or default ones)
    const gameUrls = customUrls[game] || defaultUrlsByGame[game] || [];
    
    // No need to display URLs on main tab anymore
    return gameUrls;
}

// Handle game selection change
gameSelect.addEventListener('change', async () => {
    if (isRedeeming) {
        redemptionController?.requestStop();
        statusElement.textContent = "Stopping redemption due to game change...";
        await refreshRedemptionTab();
    }
    const selectedGame = gameSelect.value;
    await browserApi.storage.local.set({ selectedGame });
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
    if (isRedeeming) {
        redemptionController?.requestStop();
        statusElement.textContent = "Stopping redemption due to platform change...";
        await refreshRedemptionTab();
    }
    const selectedPlatform = platformSelect.value;
    await browserApi.storage.local.set({ selectedPlatform });
    
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
    
    await browserApi.storage.local.remove("ShiftCodes");
    await browserApi.storage.local.remove("newShiftCodes");
    await browserApi.storage.local.remove("gameNewCodes");
    await browserApi.storage.local.remove("codeStates");
    statusElement.textContent = "Storage reset successfully";
    // Update code overview after reset
    await updateCodeOverview();
});

// **Open Code States Page**
const openStatesBtn = document.getElementById("viewCodeStatesButton");
if (openStatesBtn) {
    openStatesBtn.addEventListener("click", () => {
        try {
            const statesUrl = browserApi.runtime.getURL("code_states.html");
            browserApi.tabs.create({
                url: statesUrl,
                active: true
            });
        } catch (error) {
            console.error("Error opening states page:", error);
        }
    });
}

// **Fetch Codes Button**
document.getElementById("fetchCodesButton").addEventListener("click", async () => {
    statusElement.textContent = "Fetching new codes...";

    try {
        // Get current game and its URLs
        const game = gameSelect.value;
        const result = await browserApi.storage.local.get(['customUrls']);
        const customUrls = result.customUrls || {};
        const gameUrls = customUrls[game] || defaultUrlsByGame[game] || [];
        
        if (gameUrls.length === 0) {
            statusElement.textContent = "No URLs configured for this game";
            return;
        }

        // Send a message to the background script to fetch codes
        const response = await browserApi.runtime.sendMessage({ 
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
        redeemButton.textContent = "Stopping...";
        redeemButton.disabled = true;
        if (skipCurrentButton) {
            skipCurrentButton.disabled = true;
        }
        statusElement.textContent = "Stopping redemption process...";
        redemptionController?.requestStop();
        await refreshRedemptionTab();
        return;
    }
    
    // Start redemption process
    isRedeeming = true;
    redeemButton.textContent = "Stop Redeeming";
    statusElement.textContent = "Starting redemption process...";
    if (skipCurrentButton) {
        skipCurrentButton.disabled = false;
    }

    // Get selected game and platform
    const game = gameSelect.value;
    const platform = platformSelect.value;

    // Load timing settings
    const timingResult = await browserApi.storage.local.get(['timingSettings']);
    const timingSettings = timingResult.timingSettings || {
        codeDelay: 5,
        retryDelay: 15
    };

    // Retrieve stored codes for this specific game
    const storedData = await browserApi.storage.local.get("gameNewCodes");
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

    try {
        if (!globalThis.RedeemRunner?.createRedeemRunner || !redemptionController) {
            statusElement.textContent = "Redeem runner not available.";
            resetRedeemButton();
            return;
        }

        const redeemRunner = globalThis.RedeemRunner.createRedeemRunner({
            browserApi,
            injectContentScript,
            evaluateInTab,
            checkFinalResult,
            isLoginRequired,
            setCodeState,
            updateCodeOverview,
            incrementRetryCount,
            states: CODE_STATES
        });

        redemptionController.reset();

        const result = await redeemRunner.run({
            codesToProcess,
            game,
            platform,
            timingSettings,
            controller: redemptionController,
            setStatus: (text) => {
                statusElement.textContent = text;
            },
            onCodeStart: (code) => {
                currentRedeemCode = code;
            },
            onCodeComplete: () => {
                currentRedeemCode = null;
            },
            onTabReady: (tab) => {
                currentRedemptionTabId = tab?.id || null;
            },
            rewardsUrl: REWARDS_URL
        });

        if (result?.state === "stopped" || result?.state === "login_required") {
            resetRedeemButton();
            return;
        }

        console.info(`Redemption process completed for ${platform} on ${game}.`);
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
    if (actionApi?.setBadgeText) {
        actionApi.setBadgeText({ text: '' });
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
                const helpUrl = browserApi.runtime.getURL('help.html');

                browserApi.tabs.create({
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

    initializeSelectOptions();
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
                const helpUrl = browserApi.runtime.getURL("help.html");
                browserApi.tabs.create({
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
    
    initializeSelectOptions();
    loadSettings();
}
