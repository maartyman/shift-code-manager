const fs = require('fs');
const path = require('path');
const { loadSavedDom } = require('./utils/loadSavedDom');
const { createRedeemRunner, createRedemptionController } = require('../redeem-runner');

const PLATFORM_LABELS = {
  steam: ['steam'],
  xbox: ['xbox'],
  nintendo: ['nintendo', 'switch'],
  epic: ['epic'],
  psn: ['psn', 'playstation'],
  stadia: ['stadia']
};

function getBackgroundListener() {
  const calls = browser.runtime.onMessage.addListener.mock.calls;
  if (!calls || calls.length === 0) {
    throw new Error('No listeners registered on browser.runtime.onMessage');
  }
  const [listener] = calls[calls.length - 1];
  return listener;
}

function callListener(listener, message) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const sendResponse = (payload) => {
      resolved = true;
      resolve(payload);
    };

    try {
      const result = listener(message, undefined, sendResponse);
      if (!resolved && result !== true && result !== undefined) {
        resolved = true;
        resolve(result);
      }
    } catch (error) {
      if (!resolved) {
        reject(error);
      }
    }
  });
}

function loadHandler() {
  // Ensure config is loaded globally as it would be in the extension
  if (!global.SHIFT_CONFIG) {
    require(path.join('..', 'shift-config.js'));
  }
  
  jest.isolateModules(() => {
    require(path.join('..', 'shift-handler.js'));
  });
  const listener = getBackgroundListener();
  return (message) => callListener(listener, message);
}

function setupFormMocking() {
  const capturedForms = [];
  
  const mockForm = (form) => {
    form.submit = jest.fn(() => form.remove());
    
    // Determine platform for tracking
    const button = form.querySelector('.redeem_button');
    let platform = 'unknown';
    if (button) {
        const label = String(button.value || '').toLowerCase();
        platform = Object.keys(PLATFORM_LABELS).find((key) =>
          PLATFORM_LABELS[key].some((term) => label.includes(term))
        ) || 'unknown';
    }
    capturedForms.push({ platform, form });
  };

  // Mock existing forms
  document.querySelectorAll('form').forEach(mockForm);

  // Mock future forms
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const forms = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
          forms.forEach(mockForm);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return { capturedForms, observer };
}

function simulateResultUpdate() {
  const checkButton = document.getElementById('shift_code_check');
  const results = document.getElementById('code_results');
  
  if (checkButton && results) {
    // Enable button so it can be clicked (snapshots might have it disabled)
    checkButton.removeAttribute('disabled');

    // Capture the content that SHOULD be there (from the snapshot)
    // We assume the snapshot represents the "result" state.
    const resultHtml = results.innerHTML;
    
    checkButton.addEventListener('click', () => {
      setTimeout(() => {
        // Restore the content, simulating the site responding
        results.innerHTML = resultHtml;
      }, 100);
    });
  }
}

function getCodeResultsMarkup(snapshotName) {
  const html = fs.readFileSync(path.join(__dirname, 'saves', `${snapshotName}.html`), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const results = parsed.getElementById('code_results');
  return results ? results.innerHTML : '';
}

async function flushAllTimers() {
  let safety = 100;
  while (jest.getTimerCount() > 0 && safety-- > 0) {
    await jest.runOnlyPendingTimersAsync();
  }
  if (jest.getTimerCount() > 0) {
    throw new Error('Timers did not settle');
  }
}

function createTestDeps(overrides = {}) {
  const codeStates = {};

  const deps = {
    browserApi: {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }]),
        create: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
        update: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
        get: jest.fn().mockResolvedValue({ url: 'https://shift.gearboxsoftware.com/rewards' }),
        sendMessage: jest.fn(),
        onUpdated: {
          addListener: jest.fn((listener) => listener(1, { status: 'complete' })),
          removeListener: jest.fn(),
          hasListener: jest.fn()
        }
      }
    },
    injectContentScript: jest.fn().mockResolvedValue(),
    evaluateInTab: jest.fn().mockResolvedValue(null),
    checkFinalResult: jest.fn().mockResolvedValue({ success: false, state: 'invalid' }),
    isLoginRequired: jest.fn().mockReturnValue(false),
    setCodeState: jest.fn(async (code, state, game, platform) => {
      const key = `${platform}:${game}:${code}`;
      codeStates[key] = state;
    }),
    updateCodeOverview: jest.fn().mockResolvedValue(),
    incrementRetryCount: jest.fn().mockResolvedValue(),
    sleep: jest.fn().mockResolvedValue(),
    states: {
      NEW: 'new',
      CHECKING: 'checking',
      EXPIRED: 'expired',
      INVALID: 'invalid',
      REDEEMED: 'redeemed',
      VALIDATED: 'validated',
      ERROR: 'error',
      TO_BE_REDEEMED: 'to_be_redeemed',
      CHECKED: 'checked'
    },
    __codeStates: codeStates
  };

  return { ...deps, ...overrides };
}

describe('shift-handler message listener', () => {
  describe('checkFinalResult', () => {
    test('reports redeemed state when success text present', async () => {
      loadSavedDom('successful_redeem');
      const listener = loadHandler();

      const response = await listener({ action: 'checkFinalResult' });

      expect(response).toEqual({ success: true, state: 'redeemed' });
    });

    test('reports already redeemed state when alert contains notice', async () => {
      loadSavedDom('already_redeemed');
      const listener = loadHandler();

      const response = await listener({ action: 'checkFinalResult' });

      expect(response).toEqual({ success: false, state: 'checked' });
    });

    test('falls back to error when result text is ambiguous', async () => {
      loadSavedDom('check_error');
      const listener = loadHandler();

      const response = await listener({ action: 'checkFinalResult' });

      expect(response).toEqual({
        success: false,
        state: 'error',
        error: 'Could not determine result'
      });
    });
  });

  describe('redeemCode', () => {
    beforeEach(() => {
      jest.spyOn(console, 'info').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    test('submits forms for each requested platform when redemption is possible', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('choose_platform');
      simulateResultUpdate();

      const listener = loadHandler();
      const { capturedForms, observer } = setupFormMocking();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'T9RJB-BFKRR-3RBTW-B33TB-KCZB9',
        game: 'borderlands4',
        platforms: ['steam', 'xbox']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      if (!response.success) {
        const stack = errorSpy.mock.calls[0]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`choose_platform response ${JSON.stringify(response)}${suffix}`);
      }
      expect(response.state).toBe('submitted');
      expect(response.platforms).toEqual([
        { platform: 'steam', success: true, attempts: 2 },
        { platform: 'xbox', success: true, attempts: 2 }
      ]);

      // We check if we captured forms for both platforms
      // Note: capturedForms contains both initial (removed) and restored forms.
      // We need to check if ANY form for the platform was submitted.
      const steamForms = capturedForms.filter(f => f.platform === 'steam');
      const xboxForms = capturedForms.filter(f => f.platform === 'xbox');
      
      expect(steamForms.length).toBeGreaterThan(0);
      expect(xboxForms.length).toBeGreaterThan(0);
      
      expect(steamForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(true);
      expect(xboxForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(true);
      
      observer.disconnect();
    });

    test('returns platform not available when button missing', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('only_xbox_live');
      simulateResultUpdate();

      const listener = loadHandler();
      const { capturedForms, observer } = setupFormMocking();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'ANY-CODE',
        game: 'borderlands4',
        platforms: ['steam', 'xbox']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      if (!response.success) {
        const stack = errorSpy.mock.calls[0]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`only_xbox_live response ${JSON.stringify(response)}${suffix}`);
      }
      expect(response.state).toBe('submitted');
      expect(response.platforms).toEqual([
        expect.objectContaining({ platform: 'steam', success: false, error: 'Platform not available' }),
        expect.objectContaining({ platform: 'xbox', success: true, attempts: 2 })
      ]);

      const xboxForms = capturedForms.filter(f => f.platform === 'xbox');
      expect(xboxForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(true);
      
      observer.disconnect();
    });

    test('returns invalid when requested platform is unavailable for Borderlands 2', async () => {
      loadSavedDom('borderlands2_psn_only');
      simulateResultUpdate();

      const listener = loadHandler();
      const { capturedForms, observer } = setupFormMocking();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'NO-STEAM-HERE',
        game: 'borderlands2',
        platforms: ['steam']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      expect(response).toEqual({
        success: false,
        state: 'invalid',
        error: 'Platform not available',
        platforms: [{ platform: 'steam', success: false, error: 'Platform not available' }]
      });

      const psnForms = capturedForms.filter(f => f.platform === 'psn');
      expect(psnForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(false);
      
      observer.disconnect();
    });

    test('Works with borderlandsgameoftheyear', async () => {
      loadSavedDom('borderlandsgameoftheyear');
      simulateResultUpdate();

      const listener = loadHandler();
      const { capturedForms, observer } = setupFormMocking();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: '96RBT-ZTC33-T3T33-JT3BT-9BHZJ',
        game: 'borderlandsgameoftheyear',
        platforms: ['steam']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      expect(response).toEqual({
        success: true,
        state: 'submitted',
        platforms: [{ platform: 'steam', success: true, attempts: 2 }]
      });

      observer.disconnect();
    });

    test('waits for results before attempting platform redemption', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('empty_redeem');

      const listener = loadHandler();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'WAIT-ON-RESULT',
        game: 'borderlands4',
        platforms: ['steam', 'xbox']
      });

      // First poll should see empty results and schedule another check.
      await jest.runOnlyPendingTimersAsync();
      const results = document.getElementById('code_results');
      results.innerHTML = getCodeResultsMarkup('choose_platform');
      
      // We need to mock the forms that just appeared
      const { capturedForms, observer } = setupFormMocking();

      await flushAllTimers();
      const response = await redeemPromise;

      if (!response.success) {
        const stack = errorSpy.mock.calls[0]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`empty_redeem response ${JSON.stringify(response)}${suffix}`);
      }
      expect(response.state).toBe('submitted');
      expect(response.platforms).toEqual([
        { platform: 'steam', success: true, attempts: 2 },
        { platform: 'xbox', success: true, attempts: 2 }
      ]);

      const steamForms = capturedForms.filter(f => f.platform === 'steam');
      const xboxForms = capturedForms.filter(f => f.platform === 'xbox');
      expect(steamForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(true);
      expect(xboxForms.some(f => f.form.submit.mock.calls.length > 0)).toBe(true);
      
      observer.disconnect();
    });

    test('supports consecutive redeems as the page resets between submissions', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('choose_platform');
      simulateResultUpdate();

      const listener = loadHandler();
      let { capturedForms, observer } = setupFormMocking();

      const firstRedeem = listener({
        action: 'redeemCode',
        code: 'FIRST-CODE',
        game: 'borderlands4',
        platforms: ['steam']
      });

      await flushAllTimers();
      const firstResponse = await firstRedeem;

      if (!firstResponse.success) {
        const stack = errorSpy.mock.calls[0]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`firstRedeem response ${JSON.stringify(firstResponse)}${suffix}`);
      }
      expect(firstResponse).toEqual({
        success: true,
        state: 'submitted',
        platforms: [{ platform: 'steam', success: true, attempts: 2 }]
      });
      
      observer.disconnect();
      
      // Simulate the page updating after the first redemption.
      loadSavedDom('choose_platform_after_redeem');
      simulateResultUpdate();
      
      // Re-setup mocking for new DOM
      const secondMock = setupFormMocking();
      capturedForms = secondMock.capturedForms;
      observer = secondMock.observer;

      const secondRedeem = listener({
        action: 'redeemCode',
        code: 'SECOND-CODE',
        game: 'borderlands4',
        platforms: ['xbox']
      });

      await flushAllTimers();
      const secondResponse = await secondRedeem;

      if (!secondResponse.success) {
        const stack = errorSpy.mock.calls[1]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`secondRedeem response ${JSON.stringify(secondResponse)}${suffix}`);
      }
      expect(secondResponse).toEqual({
        success: true,
        state: 'submitted',
        platforms: [{ platform: 'xbox', success: true, attempts: 2 }]
      });
      
      observer.disconnect();
    });

    test('correctly identifies unavailable platform even if mentioned in text (mixed platform bug)', async () => {
      loadSavedDom('mixed_platform_bug');
      simulateResultUpdate();
      const listener = loadHandler();
      
      // We simulate the button NOT disappearing immediately to mimic a potential "hang" or retry loop
      // if the button doesn't go away, it will retry 10 times (10 seconds)
      // setupFormMocking mocks submit -> remove by default.
      // To simulate "not disappearing", we need to override the mock.
      
      const { capturedForms, observer } = setupFormMocking();
      
      // Override mock for this test to NOT remove the form
      // But wait, setupFormMocking applies to all forms.
      // We can iterate capturedForms and change the mock implementation?
      // But capturedForms is populated as they are found.
      // The initial forms are already in capturedForms.
      
      capturedForms.forEach(({ form }) => {
          form.submit = jest.fn(); // Do nothing, so form stays
      });

      // Request Steam, but only Xbox is available (and Steam is mentioned in text)
      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'BUG-CODE',
        game: 'borderlands2',
        platforms: ['steam']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      // It should correctly identify that Steam is not available
      expect(response.platforms).toEqual([
        expect.objectContaining({ platform: 'steam', success: false, error: 'Platform not available' })
      ]);

      // It should NOT have clicked the Xbox button
      const xboxForm = capturedForms.find(f => f.platform === 'xbox');
      expect(xboxForm.form.submit).not.toHaveBeenCalled();
      
      observer.disconnect();
    });

    test('waits for new results when previous result was expired', async () => {
      loadSavedDom('expired_code');
      const listener = loadHandler();

      // Mock the behavior of the site: clicking check eventually updates the results
      const checkButton = document.getElementById('shift_code_check');
      checkButton.addEventListener('click', () => {
        setTimeout(() => {
          // Simulate a successful check result appearing after a delay
          const results = document.getElementById('code_results');
          results.innerHTML = '<h2>Borderlands 3</h2><div class="redeem_button_container"><form data-platform="steam"><input type="submit" class="redeem_button" value="Redeem for Steam"></form></div>';
        }, 2000);
      });

      // Mock submit on newly added forms
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const forms = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
              forms.forEach(form => {
                form.submit = jest.fn(() => form.remove());
              });
            }
          });
        });
      });
      observer.observe(document.getElementById('code_results'), { childList: true, subtree: true });

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'NEW-VALID-CODE',
        game: 'borderlands3',
        platforms: ['steam']
      });

      // Advance timers to trigger the click handler's timeout and polling
      await jest.advanceTimersByTimeAsync(3000);

      const response = await redeemPromise;

      // If the bug exists, it will see the initial "expired" text and return 'expired'
      // If fixed, it should wait for the update and return 'submitted'
      expect(response.state).not.toBe('expired');
      expect(response.state).toBe('submitted');
      
      observer.disconnect();
    });

    test('handles consecutive identical results by clearing previous results', async () => {
      loadSavedDom('expired_code');
      const listener = loadHandler();

      // Mock the behavior: clicking check puts the SAME content back after a delay
      const checkButton = document.getElementById('shift_code_check');
      checkButton.addEventListener('click', () => {
        setTimeout(() => {
          loadSavedDom('expired_code');
        }, 2000);
      });

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'ANOTHER-EXPIRED-CODE',
        game: 'borderlands3',
        platforms: ['steam']
      });

      // Advance timers
      await jest.advanceTimersByTimeAsync(3000);

      const response = await redeemPromise;

      // If buggy, it times out waiting for change (because content is identical)
      // If fixed (by clearing), it sees the "new" (re-added) text
      expect(response.state).toBe('expired');
    });

    test('handles unexpected error occurred message', async () => {
      loadSavedDom('empty_redeem');
      const listener = loadHandler();

      // Mock the behavior of the site: clicking check eventually updates the results
      const checkButton = document.getElementById('shift_code_check');
      checkButton.addEventListener('click', () => {
        setTimeout(() => {
          // Simulate a successful check result appearing after a delay
          loadSavedDom('unexpected_error');
        }, 1000);
      });

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'NEW-VALID-CODE',
        game: 'borderlands4',
        platforms: ['steam']
      });

      const response = await redeemPromise;
    
      expect(response.state).toBe('error');
    });

    test('handles "does not exist" message as invalid state', async () => {
      loadSavedDom('does_not_exist');
      const listener = loadHandler();
      simulateResultUpdate();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'NON-EXISTENT-CODE',
        game: 'borderlands3',
        platforms: ['steam']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      expect(response.success).toBe(false);
      expect(response.state).toBe('invalid');
    });
  });

});

describe('redeem-runner', () => {
  test('skip marks current code invalid and continues to next code', async () => {
    const controller = createRedemptionController();
    let rejectPending = null;
    let redeemStartedResolve = null;

    const redeemStarted = new Promise((resolve) => {
      redeemStartedResolve = resolve;
    });

    const deps = createTestDeps({
      browserApi: {
        tabs: {
          query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }]),
          create: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
          update: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
          get: jest.fn().mockResolvedValue({ url: 'https://shift.gearboxsoftware.com/rewards' }),
          onUpdated: {
            addListener: jest.fn((listener) => listener(1, { status: 'complete' })),
            removeListener: jest.fn(),
            hasListener: jest.fn()
          },
          sendMessage: jest.fn((tabId, message) => {
            if (message?.action === 'heartbeat') {
              return Promise.resolve({ status: 'alive' });
            }
            if (message?.action === 'redeemCode') {
              if (message.code === 'SKIP-ME') {
                redeemStartedResolve();
                return new Promise((_, reject) => {
                  rejectPending = reject;
                });
              }
              return Promise.resolve({ success: false, state: 'invalid' });
            }
            if (message?.action === 'checkFinalResult') {
              return Promise.resolve({ success: false, state: 'invalid' });
            }
            return Promise.resolve();
          })
        }
      }
    });

    const runner = createRedeemRunner(deps);

    const runPromise = runner.run({
      codesToProcess: [{ code: 'SKIP-ME' }, { code: 'NEXT-CODE' }],
      game: 'borderlands2',
      platform: 'steam',
      timingSettings: { codeDelay: 0, retryDelay: 0 },
      controller,
      setStatus: jest.fn()
    });

    await redeemStarted;
    controller.requestSkip();
    rejectPending(new Error('Tab reloaded'));

    await runPromise;

    expect(deps.__codeStates['steam:borderlands2:SKIP-ME']).toBe('invalid');
    const redeemCalls = deps.browserApi.tabs.sendMessage.mock.calls
      .filter(([, message]) => message?.action === 'redeemCode');
    expect(redeemCalls.some(([, message]) => message.code === 'NEXT-CODE')).toBe(true);
  });

  test('stop resets current code to new and exits early', async () => {
    const controller = createRedemptionController();
    let rejectPending = null;
    let redeemStartedResolve = null;

    const redeemStarted = new Promise((resolve) => {
      redeemStartedResolve = resolve;
    });

    const deps = createTestDeps({
      browserApi: {
        tabs: {
          query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }]),
          create: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
          update: jest.fn().mockResolvedValue({ id: 1, url: 'https://shift.gearboxsoftware.com/rewards' }),
          get: jest.fn().mockResolvedValue({ url: 'https://shift.gearboxsoftware.com/rewards' }),
          onUpdated: {
            addListener: jest.fn((listener) => listener(1, { status: 'complete' })),
            removeListener: jest.fn(),
            hasListener: jest.fn()
          },
          sendMessage: jest.fn((tabId, message) => {
            if (message?.action === 'heartbeat') {
              return Promise.resolve({ status: 'alive' });
            }
            if (message?.action === 'redeemCode') {
              if (message.code === 'STOP-ME') {
                redeemStartedResolve();
                return new Promise((_, reject) => {
                  rejectPending = reject;
                });
              }
              return Promise.resolve({ success: false, state: 'invalid' });
            }
            if (message?.action === 'checkFinalResult') {
              return Promise.resolve({ success: false, state: 'invalid' });
            }
            return Promise.resolve();
          })
        }
      }
    });

    const runner = createRedeemRunner(deps);

    const runPromise = runner.run({
      codesToProcess: [{ code: 'STOP-ME' }, { code: 'NEXT-CODE' }],
      game: 'borderlands2',
      platform: 'steam',
      timingSettings: { codeDelay: 0, retryDelay: 0 },
      controller,
      setStatus: jest.fn()
    });

    await redeemStarted;
    controller.requestStop();
    rejectPending(new Error('Tab reloaded'));

    const result = await runPromise;

    expect(result.state).toBe('stopped');
    expect(deps.__codeStates['steam:borderlands2:STOP-ME']).toBe('new');
    const redeemCalls = deps.browserApi.tabs.sendMessage.mock.calls
      .filter(([, message]) => message?.action === 'redeemCode');
    expect(redeemCalls.some(([, message]) => message.code === 'NEXT-CODE')).toBe(false);
  });
});
