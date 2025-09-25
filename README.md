# Borderlands SHIFT Code Manager

A comprehensive browser extension that automatically fetches and redeems SHIFT codes for Borderlands games across multiple platforms with intelligent notifications.

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
*Coming soon - under review*

### Manual Installation (Developer Mode)
1. Download clone this repository
2. Open your browser's extension management page:
   - **Firefox**: `about:debugging`
3. Click "Load Temporary Add-on..." and select the `manifest.json` in the cloned repository

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

### Building for Production
```bash
# Create production build
make build

# Output: dist/shift-code-manager-production.zip
# Ready for upload to browser stores
```

### Available Make Targets
- `make help` - Show all available commands
- `make test-server` - Start development test server  
- `make build` - Create production package
- `make clean` - Remove generated files

## 📁 Project Structure

```
shift-code-manager/
├── manifest.json           # Extension manifest
├── popup.html             # Extension popup interface
├── popup.js               # Main extension logic
├── background.js          # Background service worker
├── shift-handler.js       # Content script for SHIFT website
├── assets/                # Extension icons and images
├── test/
│   └── test-server.py     # Development test server
├── dist/                  # Build output directory
├── Makefile              # Production build system
├── README.md             # Project documentation
└── PRIVACY.md            # Privacy policy for store submissions
```

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Firefox | ✅ Full | Native manifest v2 support |
| Chrome | ❌ Not Compatible | Future Work |
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
- `https://mentalmars.com/*`, `https://www.rockpapershotgun.com/*`, `https://www.polygon.com/*` - Fetch known SHIFT code sources
- `Optional site access` - Prompted on demand when you add a custom code source URL

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
