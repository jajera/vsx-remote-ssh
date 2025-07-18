# Publishing SSH Remote Extension to VS Code Marketplace

## Overview

This guide explains how to publish the SSH Remote extension to the Visual Studio Code marketplace.

## Prerequisites

### 1. **Microsoft Account**

- Create a Microsoft account if you don't have one
- Go to [Microsoft Partner Center](https://partner.microsoft.com/)

### 2. **VS Code Publisher Account**

- Visit [Visual Studio Marketplace](https://marketplace.visualstudio.com/)
- Sign in with your Microsoft account
- Create a publisher account
- Choose a unique publisher ID (e.g., `vsx-remote-ssh`)

### 3. **Personal Access Token (PAT)**

- Go to [Azure DevOps](https://dev.azure.com/)
- Create a new organization or use existing
- Go to User Settings → Personal Access Tokens
- Create a new token with Marketplace (Publish) permissions
- Save the token securely

## Publishing Steps

### Step 1: Prepare the Extension

#### Update package.json

```bash
# Update version number
npm version patch  # or minor/major
```

#### Update README.md

```markdown
# SSH Remote Extension

Connect to and develop on remote servers via SSH with full VS Code integration.

## Features
- Secure SSH connections
- Remote file system access
- Integrated terminal
- Performance monitoring
- Workspace management
- Connection caching

## Usage
1. Add SSH host configuration
2. Connect to remote server
3. Open remote workspace
4. Develop with full VS Code features

## Requirements
- VS Code 1.74.0 or higher
- SSH server access
```

### Step 2: Create Marketplace Assets

#### Create Icon

```bash
# Create a 128x128 PNG icon
# Save as: resources/icon.png
```

#### Create Screenshots

```bash
# Take screenshots of the extension in action
# Save as: resources/screenshot1.png, screenshot2.png, etc.
```

#### Create README for Marketplace

```markdown
# SSH Remote Extension

Connect to and develop on remote servers via SSH with full VS Code integration.

## Features

### 🔐 Secure SSH Connections
- Password and SSH key authentication
- Connection caching and reconnection
- Multiple host management

### 📁 Remote File System
- Browse remote directories
- Edit files directly on remote server
- File synchronization and caching

### 🖥️ Integrated Terminal
- SSH terminal integration
- Multiple terminal sessions
- Command history and completion

### 📊 Performance Monitoring
- Connection latency tracking
- Memory usage monitoring
- Performance statistics

### 🗂️ Workspace Management
- Save workspace contexts
- Quick workspace switching
- Remote workspace persistence

## Quick Start

1. **Add SSH Host**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Add SSH Host"
   - Enter your server details

2. **Connect to Host**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Connect to Host via SSH"
   - Select your configured host

3. **Open Remote Workspace**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Open Remote Workspace"
   - Enter remote path

## Commands

| Command | Description |
|---------|-------------|
| `Remote SSH: Add SSH Host` | Add new SSH host configuration |
| `Remote SSH: Connect to Host via SSH` | Connect to configured host |
| `Remote SSH: Disconnect` | Disconnect from current host |
| `Remote SSH: Open Remote Terminal` | Open SSH terminal |
| `Remote SSH: Open Remote Workspace` | Open workspace on remote host |
| `Remote SSH: Show Active Connections` | View active SSH connections |
| `Remote SSH: Manage SSH Hosts` | Manage host configurations |

## Configuration

### SSH Host Configuration
```json
{
  "name": "My Server",
  "host": "example.com",
  "port": 22,
  "username": "user",
  "authMethod": "password",
  "password": "your-password"
}
```

### Extension Settings

```json
{
  "remote-ssh.defaultPort": 22,
  "remote-ssh.connectTimeout": 15000,
  "remote-ssh.reconnectAttempts": 3
}
```

## Requirements

- **VS Code**: 1.74.0 or higher
- **SSH Server**: Any SSH-compatible server
- **Authentication**: Password or SSH key

## Support

- **Issues**: [GitHub Issues](https://github.com/jajera/vsx-remote-ssh/issues)
- **Documentation**: [README.md](README.md) - User guide
- **Discussions**: [GitHub Discussions](https://github.com/jajera/vsx-remote-ssh/discussions)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This extension is licensed under the MIT License. See [LICENSE](LICENSE) for details.

### Step 3: Package the Extension

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Package the extension
npm run package

# This creates: vsx-remote-ssh-1.0.0.vsix
```

### Step 4: Publish to Marketplace

#### Method 1: Using vsce (Recommended)

```bash
# Login with your Personal Access Token
vsce login <publisher-name>

# Publish the extension
vsce publish

# Or publish with specific version
vsce publish patch  # patch, minor, major
```

#### Method 2: Using Azure DevOps

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Navigate to your organization
3. Go to Artifacts → Feeds
4. Create a new feed or use existing
5. Upload the .vsix file
6. Publish to marketplace

### Step 5: Verify Publication

1. Check [Visual Studio Marketplace](https://marketplace.visualstudio.com/)
2. Search for your extension
3. Verify all information is correct
4. Test installation in a clean VS Code instance

## Publishing Checklist

### Before Publishing

- [ ] Update version in package.json
- [ ] Update README.md with proper documentation
- [ ] Create marketplace icon (128x128 PNG)
- [ ] Take screenshots of extension in action
- [ ] Test extension thoroughly
- [ ] Run all tests: `npm test`
- [ ] Check for linting errors: `npm run lint`
- [ ] Package extension: `npm run package`
- [ ] Test the packaged extension locally

### Marketplace Requirements

- [ ] Unique extension ID
- [ ] Clear description
- [ ] Proper categorization
- [ ] High-quality icon
- [ ] Screenshots showing functionality
- [ ] Detailed README
- [ ] License information
- [ ] Privacy policy (if collecting data)

### Post-Publishing

- [ ] Monitor marketplace listing
- [ ] Respond to user feedback
- [ ] Address issues promptly
- [ ] Plan future updates

## Version Management

### Semantic Versioning

```bash
# Patch release (bug fixes)
npm version patch

# Minor release (new features)
npm version minor

# Major release (breaking changes)
npm version major
```

### Release Notes

Create `CHANGELOG.md`:

```markdown
# Changelog

## [1.0.0] - 2024-01-15
### Added
- Initial release
- SSH connection management
- Remote file system access
- Integrated terminal
- Performance monitoring
- Workspace management

## [1.0.1] - 2024-01-20
### Fixed
- Command registration issues
- Connection timeout handling
- File cache performance

### Changed
- Improved error messages
- Enhanced status bar display
```

## Troubleshooting

### Common Issues

#### "Publisher not found"

- Verify publisher account creation
- Check Personal Access Token permissions
- Ensure correct publisher ID

#### "Extension ID already exists"

- Choose a different extension ID
- Update package.json with new ID

#### "Invalid package"

- Check package.json syntax
- Verify all required fields
- Ensure proper file structure

#### "Publish failed"

- Check network connection
- Verify PAT token validity
- Try again after a few minutes

### Support Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Marketplace Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Next Steps

After successful publication:

1. **Monitor Analytics**
   - Track downloads and ratings
   - Monitor user feedback
   - Analyze usage patterns

2. **Maintain Quality**
   - Regular updates and bug fixes
   - Performance improvements
   - Feature enhancements

3. **Community Engagement**
   - Respond to issues and discussions
   - Provide documentation and examples
   - Gather user feedback

4. **Marketing**
   - Share on social media
   - Write blog posts
   - Present at conferences

## Legal Considerations

- **License**: Ensure proper licensing
- **Privacy**: Respect user privacy
- **Terms of Service**: Follow marketplace terms
- **Intellectual Property**: Respect third-party licenses

## Revenue Options

### Free Extension

- Open source
- Community contributions
- Sponsorship opportunities

### Paid Extension

- One-time purchase
- Subscription model
- Enterprise licensing

### Freemium Model

- Basic features free
- Premium features paid
- Enterprise add-ons
