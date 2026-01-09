var browserApi = typeof browser !== 'undefined' ? browser : chrome;

var shiftHandlerOnMessage = async (message) => {
    if (message.action === "heartbeat") {
        return { status: "alive" };
    }
    
    if (message.action === "checkFinalResult") {
        const pageText = document.body.textContent.toLowerCase();
        const pageHtml = document.body.innerHTML.toLowerCase();
        
        // Check if we're on the redemption results page
        if (window.location.href.includes('code_redemptions') || 
            window.location.href.includes('code-redemptions')) {
            
            if (pageText.includes('successfully redeemed') || 
                pageText.includes('your code was successfully') ||
                pageText.includes('code was redeemed') ||
                pageHtml.includes('successfully redeemed')) {
                return { success: true, state: 'redeemed' };
            }
            
            if (pageText.includes('already been redeemed') || 
                pageText.includes('already redeemed') ||
                pageText.includes('shift code has already been redeemed')) {
                return { success: false, state: 'checked' };
            }
            
            if (pageText.includes('expired')) {
                return { success: false, state: 'expired' };
            }
            
            if (pageText.includes('invalid') || pageText.includes('not valid') || pageText.includes('does not exist')) {
                return { success: false, state: 'invalid' };
            }
        }
        
        // Check for alert messages on rewards page
        const alertDiv = document.querySelector('.alert.notice');
        if (alertDiv) {
            const alertText = alertDiv.textContent.toLowerCase();
            
            if (alertText.includes('successfully redeemed')) {
                return { success: true, state: 'redeemed' };
            }
            
            if (alertText.includes('already been redeemed')) {
                return { success: false, state: 'checked' };
            }
            
            if (alertText.includes('expired')) {
                return { success: false, state: 'expired' };
            }
            
            if (alertText.includes('invalid') || alertText.includes('does not exist')) {
                return { success: false, state: 'invalid' };
            }
        }
        
        // Default to error if we can't determine the result
        return { success: false, state: 'error', error: 'Could not determine result' };
    }
    
    if (message.action === "redeemCode") {
        const code = message.code;
        const game = message.game || 'tinytina';
        const platforms = message.platforms || ['steam']; // Array of platforms to redeem
        
        // Game name mappings
        const gameSearchTerms = {
            borderlands4: ['Borderlands 4'],
            tinytina: ['Tina', 'Wonderlands'],
            borderlands3: ['Borderlands 3'],
            borderlands2: ['Borderlands 2', 'Borderlands: The Pre-Sequel']
        };

        // Platform button selectors
        const platformSelectors = {
            steam: ['steam'],
            xbox: ['xbox', 'microsoft'],
            nintendo: ['nintendo', 'switch'],
            epic: ['epic'],
            psn: ['playstation', 'psn', 'ps4', 'ps5'],
            stadia: ['stadia']
        };

        try {
            // Step 1: Put the code in
            const inputField = document.getElementById("shift_code_input");
            if (!inputField) {
                return { success: false, error: "Input field not found", state: "error" };
            }
            
            inputField.value = code;
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
            inputField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

            const resultsNode = document.getElementById("code_results");
            if (resultsNode) {
                resultsNode.innerHTML = "";
            }

            // Step 2: Press check
            const checkButton = document.getElementById("shift_code_check");
            if (!checkButton) {
                return { success: false, error: "Check button not found", state: "error" };
            }
            
            checkButton.removeAttribute('disabled');
            
            checkButton.click();

            // Step 3: Wait for result and see if there's an error or if it can be redeemed
            const checkResult = await new Promise((resolve, reject) => {
                let attempts = 0;
                const checkForResult = () => {
                    attempts++;
                    if (attempts > 30) {
                        reject({ error: "Check took too long", state: "error" });
                        return;
                    }
                    
                    const results = document.getElementById("code_results");
                    const currentHtml = results ? results.innerHTML.trim() : "";

                    if (!results || !currentHtml) {
                        setTimeout(checkForResult, 500);
                        return;
                    }

                    const resultText = results.innerHTML.toLowerCase();

                    // Check for various states
                    if (resultText.includes("expired")) {
                        resolve({ state: "expired" });
                    } else if (resultText.includes("already been redeemed")) {
                        resolve({ state: "checked" });
                    } else if (resultText.includes("invalid") || resultText.includes("not valid") || resultText.includes("does not exist")) {
                        resolve({ state: "invalid" });
                    } else if (results.querySelectorAll("h2").length > 0) {
                        resolve({ state: "can_redeem" });
                    } else {
                        setTimeout(checkForResult, 1000);
                    }
                };
                checkForResult();
            });

            // If can't redeem, return the state immediately (no redirect happens)
            if (checkResult.state !== "can_redeem") {
                return { success: false, state: checkResult.state };
            }

            // Step 4: Find the game section
            const elements = document.getElementById("code_results").querySelectorAll("h2");
            const searchTerms = gameSearchTerms[game] || gameSearchTerms['tinytina'];
            let gameElement = null;

            for (const element of elements) {
                const gameMatches = searchTerms.some(term => 
                    element.innerText.toLowerCase().includes(term.toLowerCase())
                );
                
                if (gameMatches) {
                    gameElement = element;
                    break;
                }
            }

            if (!gameElement) {
                return { success: false, error: "Game section not found", state: "error" };
            }

            // Step 5: Redeem for each selected platform
            const redemptionResults = [];
            
            for (const platform of platforms) {
                
                const platformSearchTerms = platformSelectors[platform] || [platform];
                let platformButton = null;
                
                // Look for platform button in siblings after the game element
                let currentElement = gameElement.nextElementSibling;
                while (currentElement && !platformButton) {
                    // Find all potential buttons in this container
                    const buttons = currentElement.querySelectorAll('.redeem_button, input[type="submit"]');
                    
                    for (const btn of buttons) {
                        const form = btn.closest('form');
                        const dataPlatform = form ? form.getAttribute('data-platform') : null;
                        const btnValue = btn.value || '';
                        
                        // Check data-platform
                        if (dataPlatform && platformSearchTerms.some(term => dataPlatform.toLowerCase().includes(term.toLowerCase()))) {
                            platformButton = btn;
                            break;
                        }
                        
                        // Check button value
                        if (platformSearchTerms.some(term => btnValue.toLowerCase().includes(term.toLowerCase()))) {
                            platformButton = btn;
                            break;
                        }
                    }
                    
                    if (platformButton) break;
                    currentElement = currentElement.nextElementSibling;
                }

                if (!platformButton) {
                    redemptionResults.push({ platform, success: false, error: "Platform not available" });
                    continue;
                }

                // Keep clicking the platform button until it's gone
                let clickAttempts = 0;
                let buttonFound = true;
                
                while (clickAttempts < 10 && buttonFound) {
                    clickAttempts++;
                    
                    // Re-find the button (it might change after clicking)
                    currentElement = gameElement.nextElementSibling;
                    platformButton = null;
                    
                    while (currentElement && !platformButton) {
                        const elementText = currentElement.innerHTML?.toLowerCase() || '';
                        const platformMatches = platformSearchTerms.some(term => 
                            elementText.includes(term.toLowerCase())
                        );
                        
                        if (platformMatches) {
                            platformButton = currentElement.querySelector('.redeem_button, input[type="submit"]');
                            break;
                        }
                        currentElement = currentElement.nextElementSibling;
                    }

                    if (!platformButton) {
                        buttonFound = false;
                        break;
                    }

                    // Click the button
                    const form = platformButton.closest('form');
                    if (form) {
                        form.submit();
                    } else {
                        platformButton.click();
                    }

                    // Wait 1 second between pressing
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                redemptionResults.push({ platform, success: true, attempts: clickAttempts });
            }

            const anyPlatformSucceeded = redemptionResults.some(result => result.success);

            if (!anyPlatformSucceeded) {
                return {
                    success: false,
                    state: "invalid",
                    error: "Platform not available",
                    platforms: redemptionResults
                };
            }

            // Step 6: All platforms processed - let popup handle the result checking
            return { success: true, state: "submitted", platforms: redemptionResults };

        } catch (error) {
            console.error("Error redeeming code:", error);
            return { 
                success: false, 
                error: error.error || error.message, 
                state: error.state || "error"
            };
        }
    }
};

if (!globalThis.__shiftHandlerListenerAdded) {
    globalThis.__shiftHandlerListenerAdded = true;
    browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        Promise.resolve(shiftHandlerOnMessage(message, sender))
            .then((result) => {
                sendResponse(result);
            })
            .catch((error) => {
                sendResponse({
                    success: false,
                    state: "error",
                    error: error?.message || String(error)
                });
            });

        // Keep the response channel open for async work (required by Chrome).
        return true;
    });
}
