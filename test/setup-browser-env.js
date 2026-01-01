require('jest-webextension-mock');

const innerTextDescriptor = Object.getOwnPropertyDescriptor(
  global.HTMLElement.prototype,
  'innerText'
);

if (!innerTextDescriptor || typeof innerTextDescriptor.get !== 'function') {
  Object.defineProperty(global.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent;
    },
    set(value) {
      this.textContent = value;
    }
  });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  jest.resetModules();

  if (browser?.runtime?.onMessage?.hasOwnProperty('clearListeners')) {
    browser.runtime.onMessage.clearListeners();
  } else if (Array.isArray(browser?.runtime?.onMessage?.listeners)) {
    browser.runtime.onMessage.listeners = [];
  }

  if (typeof browser?.runtime?.onMessage?.addListener?.mockClear === 'function') {
    browser.runtime.onMessage.addListener.mockClear();
  }
});
