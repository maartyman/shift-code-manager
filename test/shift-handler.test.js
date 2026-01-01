const fs = require('fs');
const path = require('path');
const { loadSavedDom } = require('./utils/loadSavedDom');

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

function loadHandler() {
  jest.isolateModules(() => {
    require(path.join('..', 'shift-handler.js'));
  });
  return getBackgroundListener();
}

function stubRedeemForms() {
  return Array.from(document.querySelectorAll('form'))
    .map((form) => {
      const button = form.querySelector('.redeem_button');
      if (!button) {
        return null;
      }

      const label = String(button.value || '').toLowerCase();
      const platform =
        Object.keys(PLATFORM_LABELS).find((key) =>
          PLATFORM_LABELS[key].some((term) => label.includes(term))
        ) || 'unknown';

      form.submit = jest.fn(() => form.remove());
      return { platform, form };
    })
    .filter(Boolean);
}

function simulateResultUpdate() {
  const checkButton = document.getElementById('shift_code_check');
  if (checkButton) {
    checkButton.addEventListener('click', () => {
      setTimeout(() => {
        const results = document.getElementById('code_results');
        if (results) {
          results.insertAdjacentHTML('beforeend', '<!-- updated -->');
        }
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
      jest.useFakeTimers();
      const trackedForms = stubRedeemForms();

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

      trackedForms.forEach(({ form }) => {
        expect(form.isConnected).toBe(false);
      });
    });

    test('returns platform not available when button missing', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('only_xbox_live');
      simulateResultUpdate();

      const listener = loadHandler();
      jest.useFakeTimers();
      const trackedForms = stubRedeemForms();

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

      trackedForms.forEach(({ platform, form }) => {
        if (platform === 'xbox') {
          expect(form.isConnected).toBe(false);
        }
      });
    });

    test('gracefully skips requested platform unavailable for Borderlands 2', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('borderlands2_psn_only');
      simulateResultUpdate();

      const listener = loadHandler();
      jest.useFakeTimers();
      const trackedForms = stubRedeemForms();

      const redeemPromise = listener({
        action: 'redeemCode',
        code: 'NO-STEAM-HERE',
        game: 'borderlands2',
        platforms: ['steam']
      });

      await flushAllTimers();
      const response = await redeemPromise;

      if (!response.success) {
        const stack = errorSpy.mock.calls[0]?.[1]?.stack;
        const suffix = stack ? `\n${stack}` : '';
        throw new Error(`borderlands2_psn_only response ${JSON.stringify(response)}${suffix}`);
      }

      expect(response).toEqual({
        success: true,
        state: 'submitted',
        platforms: [{ platform: 'steam', success: false, error: 'Platform not available' }]
      });

      trackedForms.forEach(({ platform, form }) => {
        if (platform === 'psn') {
          expect(form.isConnected).toBe(true);
        }
      });
    });

    test('waits for results before attempting platform redemption', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('empty_redeem');

      const listener = loadHandler();
      jest.useFakeTimers();

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
      const trackedForms = stubRedeemForms();

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

      trackedForms.forEach(({ form }) => {
        expect(form.isConnected).toBe(false);
      });
    });

    test('supports consecutive redeems as the page resets between submissions', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loadSavedDom('choose_platform');
      simulateResultUpdate();

      const listener = loadHandler();
      jest.useFakeTimers();
      let trackedForms = stubRedeemForms();

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
      // Simulate the page updating after the first redemption.
      loadSavedDom('choose_platform_after_redeem');
      simulateResultUpdate();
      trackedForms = stubRedeemForms();

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
    });

    test('correctly identifies unavailable platform even if mentioned in text (mixed platform bug)', async () => {
      loadSavedDom('mixed_platform_bug');
      simulateResultUpdate();
      const listener = loadHandler();
      jest.useFakeTimers();
      
      // We simulate the button NOT disappearing immediately to mimic a potential "hang" or retry loop
      // if the button doesn't go away, it will retry 10 times (10 seconds)
      const trackedForms = stubRedeemForms(false);

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
      const xboxForm = trackedForms.find(f => f.platform === 'xbox');
      expect(xboxForm.form.submit).not.toHaveBeenCalled();
    });

    test('waits for new results when previous result was expired', async () => {
      loadSavedDom('expired_code');
      const listener = loadHandler();
      jest.useFakeTimers();

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
  });
});
