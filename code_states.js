const gameSelect = document.getElementById("gameSelect");
const platformSelect = document.getElementById("platformSelect");
const tableBody = document.getElementById("codesTableBody");
const newCodeInput = document.getElementById("newCodeInput");
const addCodeButton = document.getElementById("addCodeButton");

const browserApi = typeof browser !== 'undefined' ? browser : chrome;
const shiftConfig = globalThis.SHIFT_CONFIG || {};
const CONFIG_GAMES = Array.isArray(shiftConfig.games) ? shiftConfig.games : [];
const CONFIG_PLATFORMS = Array.isArray(shiftConfig.platforms) ? shiftConfig.platforms : [];

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

async function initialize() {
    // Check if critical elements exist
    if (!gameSelect || !platformSelect || !tableBody) {
        console.error("Critical elements missing");
        return;
    }

    // Initialize filter dropdowns
    if (CONFIG_GAMES.length > 0) {
        setSelectOptions(gameSelect, CONFIG_GAMES);
    }
    if (CONFIG_PLATFORMS.length > 0) {
        setSelectOptions(platformSelect, CONFIG_PLATFORMS);
    }

    // Load saved selections or defaults
    try {
        const result = await browserApi.storage.local.get(['selectedGame', 'selectedPlatform']);
        
        const defaultGame = CONFIG_GAMES[0]?.id || 'borderlands4';
        const selectedGame = result.selectedGame || defaultGame;
        if (Array.from(gameSelect.options).some(opt => opt.value === selectedGame)) {
            gameSelect.value = selectedGame;
        }

        const defaultPlatform = CONFIG_PLATFORMS[0]?.id || 'steam';
        const selectedPlatform = result.selectedPlatform || defaultPlatform;
        if (Array.from(platformSelect.options).some(opt => opt.value === selectedPlatform)) {
            platformSelect.value = selectedPlatform;
        }
    } catch (e) {
        console.error("Error loading settings", e);
    }

    // Apply dark mode
    applyDarkMode();

    // Initial data load
    loadData();

    // Event listeners
    gameSelect.addEventListener('change', () => {
        saveSelection();
        loadData();
    });
    platformSelect.addEventListener('change', () => {
        saveSelection();
        loadData();
    });

    if (addCodeButton) {
        addCodeButton.addEventListener('click', handleAddCode);
    }
}

function saveSelection() {
    browserApi.storage.local.set({
        selectedGame: gameSelect.value,
        selectedPlatform: platformSelect.value
    });
}

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

async function loadData() {
    const game = gameSelect.value;
    const platform = platformSelect.value;
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
    }

    try {
        const result = await browserApi.storage.local.get(['codeStates']);
        const codeStates = result.codeStates || {};

        const data = Object.entries(codeStates)
            .filter(([key, _]) => key.startsWith(`${platform}:${game}:`))
            .map(([key, value]) => ({
                code: key.split(':')[2],
                ...value
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Sort by newest first

        renderTable(data);
    } catch (error) {
        console.error("Error loading data:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error loading data: ${error.message}</td></tr>`;
        }
    }
}

function renderTable(data) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="no-data">No redemption history found for this game and platform.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        
        // Date formatting
        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A';
        
        row.innerHTML = `
            <td><code>${item.code}</code></td>
            <td><span class="state-badge state-${item.state}">${item.state}</span></td>
            <td>${dateStr}</td>
            <td>${item.retryCount || 0}</td>
            <td>
                <button class="action-button btn-retry" data-code="${item.code}">Retry</button>
                <button class="action-button btn-skip" data-code="${item.code}">Skip</button>
            </td>
        `;
        
        // Add listeners
        row.querySelector('.btn-retry').addEventListener('click', () => updateCodeState(item.code, 'new'));
        row.querySelector('.btn-skip').addEventListener('click', () => updateCodeState(item.code, 'invalid'));
        
        tableBody.appendChild(row);
    });
}

async function updateCodeState(code, newState) {
    const game = gameSelect.value;
    const platform = platformSelect.value;
    const key = `${platform}:${game}:${code}`;
    
    try {
        const result = await browserApi.storage.local.get(['codeStates']);
        const codeStates = result.codeStates || {};
        
        if (codeStates[key]) {
            codeStates[key].state = newState;
            codeStates[key].timestamp = Date.now();
            
            // If setting to new, maybe reset retries?
            if (newState === 'new') {
                codeStates[key].retryCount = 0;
            }
            
            await browserApi.storage.local.set({ codeStates });
            loadData(); // Reload table
        }
    } catch (error) {
        console.error("Error updating code state:", error);
        alert("Failed to update code state");
    }
}

async function handleAddCode() {
    const code = newCodeInput.value.trim().toUpperCase();
    if (!code) {
        alert("Please enter a code");
        return;
    }
    
    if (code.length < 5) {
         alert("Code seems too short");
         return;
    }

    const game = gameSelect.value;
    const platform = platformSelect.value;
    const key = `${platform}:${game}:${code}`;
    
    try {
        const result = await browserApi.storage.local.get(['codeStates']);
        const codeStates = result.codeStates || {};
        
        if (codeStates[key]) {
            if (!confirm(`Code ${code} already exists with state '${codeStates[key].state}'. Do you want to reset it to 'new'?`)) {
                return;
            }
        }
        
        codeStates[key] = {
            state: 'new',
            timestamp: Date.now(),
            game: game,
            platform: platform,
            retryCount: 0
        };
        
        await browserApi.storage.local.set({ codeStates });
        
        // Also ensure it's in the gameNewCodes list if we want it to show up in the main popup counters immediately
        // (Though the main popup logic might rely on codeStates too, let's be safe and add it to gameNewCodes if possible, 
        // but looking at popup.js, it seems to fallback to codeStates if gameNewCodes is cleared. 
        // Ideally we should add it to 'gameNewCodes' storage as well.)
        const codesResult = await browserApi.storage.local.get(['gameNewCodes']);
        const gameNewCodes = codesResult.gameNewCodes || {};
        if (!gameNewCodes[game]) {
            gameNewCodes[game] = [];
        }
        if (!gameNewCodes[game].includes(code)) {
            gameNewCodes[game].push(code);
            await browserApi.storage.local.set({ gameNewCodes });
        }

        newCodeInput.value = '';
        loadData();
        
    } catch (error) {
        console.error("Error adding code:", error);
        alert("Failed to add code");
    }
}

// Start

// Start
document.addEventListener('DOMContentLoaded', initialize);
