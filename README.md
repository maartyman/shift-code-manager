# Borderlands SHIFT Code Manager

A comprehensive browser extension that automatically fetches and redeems SHIFT codes for Borderlands games across multiple platforms with intelligent notifications.

The SHIFT Code Manager extension makes redeeming Borderlands SHIFT codes quick and effortless. It automatically fetches the latest codes from trusted sources, notifies you when new ones are available, and redeems them on the official SHIFT website (shift.gearboxsoftware.com) with just a click. Supporting multiple platforms—including Steam, Xbox, PlayStation, Nintendo, Epic, and Stadia—the extension handles everything from tracking code states (new, redeemed, expired, or invalid) to managing redemption delays to avoid rate limits. With built-in settings, notifications, and backup options, it ensures you never miss out on golden keys or rewards again.

## ✨ Features

### 🎯 Game Support
- **Borderlands 4**
- **Tiny Tina's Wonderlands**
- **Borderlands 3**
- **Borderlands 2**
- **Borderlands Pre-Sequel**

### 🔔 Smart Notifications
- **Automatic Code Detection** - Monitors websites for new SHIFT codes
- **Per-Game Notifications** - Choose which games to monitor

### 🛡️ Advanced Features
- **State Management** - Tracks redeemed, validated, expired, and error codes
- **URL Management** - Add custom SHIFT code sources
- **Data Backup** - Export/import settings and code states

## 🚀 Installation

### From Browser Store (Recommended)
- [Firefox Add-ons – Borderlands SHIFT Code Manager](https://addons.mozilla.org/en-US/firefox/addon/borderlands-shift-code-manager/)

### Manual Installation (Developer Mode)
1. Download clone this repository
2. Open your browser's extension management page:
   - **Firefox**: `about:debugging`
   - **Chrome**: `chrome://extensions/`
3. Load the Add-on into the browser:
   - **Firefox**: Run `make firefox`, then click "Load Temporary Add-on..." and select `manifest.json`
   - **Chrome**: Run `make chrome`, then click "Load unpacked" and select the folder of the cloned repository

## 🔧 Development

### Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/shift-code-manager.git
cd shift-code-manager
```

### Testing
The extension includes a comprehensive testing framework:

```bash
# Start the local test server (serves random SHIFT codes)
make test-server

# Test server runs on http://localhost:8000
# Provides random valid-format SHIFT codes for testing
```

#### Automated DOM Tests
Replay saved SHIFT portal states to exercise `shift-handler.js` without hitting the live site:

```bash
npm install
npm test
```

### Releasing a New Version
```bash
# Create a release
make build

# Version is bumped in manifest.chrome.json (keep manifest.firefox.json in sync)
# Changelog is regenerated automatically
# Output: dist/shift-code-manager-<version>.zip
```

### Available Make Targets
- `make help` - Show all available commands
- `make test-server` - Start development test server  
- `make build` - Create release: bump version, refresh changelog, package zip
- `make clean` - Remove generated files
- `make chrome` - Copy the manifest.chrome.json into manifest.json
- `make firefox` - Copy the manifest.firefox.json into manifest.json

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Firefox | ✅ Full | Manifest v2 |
| Chrome | ✅ Full | Manifest v3 |
| Edge | ❌ Not Compatible | Future Work |
| Safari | ❌ Not Compatible | Future Work |

## 🔒 Privacy & Security
- **No Data Collection**: Extension only stores data locally
- **No External Servers**: Operates entirely within browser
- **Source Code**: Open source - audit the code yourself
- **Permissions**: Only requests necessary site access for automation
- **Privacy Policy**: See [PRIVACY.md](PRIVACY.md) for the store-friendly statement

## 📝 Permissions Used

- `storage` - Save settings and code states locally
- `activeTab` / `tabs` - Attach to the active tab when needed
- `alarms` - Schedule automatic code checking
- `notifications` - Alert users about new codes
- `https://shift.gearboxsoftware.com/*` - Automate redemption on the SHIFT portal
- `http://*/`, `https://*/` - Allow fetching SHIFT codes from any site you configure

## 🐛 Troubleshooting

### Extension Not Working
1. Check browser compatibility
2. Ensure all permissions are granted
3. Try disabling other extensions temporarily
4. Check browser console for errors

### Codes Not Redeeming
1. Verify you're logged into SHIFT website
2. Check if codes are expired or already redeemed
3. Try different platforms (Steam, Epic, etc.)
4. Manually visit shift.gearboxsoftware.com to test

### Notifications Not Working  
1. Ensure notifications are enabled in browser settings
2. Check notification permissions for the extension
3. Verify notification settings in extension popup
4. Try shorter check intervals for testing

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Submit a pull request with detailed description

### Code Style
- Use clear, descriptive variable names
- Comment complex logic sections  
- Follow existing code formatting
- Test changes with `make test-server`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Gearbox Software** - For creating the Borderlands franchise and SHIFT system
- **Community** - SHIFT code websites and contributors who make this possible
- **Browser Vendors** - For providing extension APIs and development tools

## 📞 Support

- **Issues**: Report bugs or request features on GitHub Issues
- **Discussions**: Community support and questions on GitHub Discussions  
- **Security**: Report security concerns privately via GitHub Security tab

---

**Happy Code Hunting, Vault Hunters!** 🗝️
