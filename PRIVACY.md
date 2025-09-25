# Borderlands SHIFT Code Manager – Privacy Policy

_Last updated: 2025-09-24_

## Data Collection
The extension does **not** collect, transmit, or sell any personal data. All code handling and state tracking occurs entirely within your browser.

## Local Storage
The following information is stored locally using the browser's `storage` API:
- Extension settings (selected game, timing preferences, notification options)
- Code states (redeemed, validated, expired, error metadata)
- Custom code source URLs that you add manually

Local storage can be cleared at any time from the extension settings or your browser data controls.

## Network Requests
The extension fetches SHIFT code listings and opens the SHIFT redemption portal on your behalf. By default it accesses:
- `https://shift.gearboxsoftware.com/`
- `https://mentalmars.com/`
- `https://www.rockpapershotgun.com/`
- `https://www.polygon.com/`

When you add a custom code source the extension will prompt for permission to access that specific site. No background traffic occurs until permission is granted.

## Permissions
- `storage`, `activeTab`, `tabs`, `alarms`, `notifications`
- Host permissions for the sites listed above
- Optional host permissions only when you approve access for a custom domain

## Third-Party Services
The extension does not integrate with analytics, advertising, social media, or other third-party tracking services.

## Contact
Questions or concerns? Open an issue on the project repository or reach out via the contact method listed in the store submission.
