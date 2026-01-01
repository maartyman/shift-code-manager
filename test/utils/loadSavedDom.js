const fs = require('fs');
const path = require('path');

function loadSavedDom(snapshotName, options = {}) {
  const { url } = options;
  const basePath = path.join(__dirname, '..', 'saves');
  const htmlPath = path.join(basePath, `${snapshotName}.html`);

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Snapshot HTML not found: ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');

  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  const defaultUrl = 'https://shift.gearboxsoftware.com/code_redemptions';
  const target = url || defaultUrl;
  const resolvedUrl = target.startsWith('http')
    ? target
    : new URL(target, defaultUrl).href;

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: resolvedUrl,
      toString() {
        return this.href;
      }
    }
  });

  return { htmlPath };
}

module.exports = {
  loadSavedDom
};
