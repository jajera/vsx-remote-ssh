# GitHub Actions Setup for Open VSX Registry Publishing

This document explains how to set up automatic publishing to the [Open VSX Registry](https://open-vsx.org/) when merging to the main branch.

## Overview

The GitHub Action workflow (`.github/workflows/publish-open-vsx.yml`) automatically:

1. Runs tests to ensure code quality
2. Builds and packages the extension
3. Publishes to Open VSX Registry
4. Creates a GitHub release with the VSIX file

## Setup Instructions

### 1. Get Open VSX Personal Access Token

1. Go to [Open VSX Registry](https://open-vsx.org/)
2. Sign in with your GitHub account
3. Go to your profile settings
4. Generate a Personal Access Token (PAT)
5. Copy the token

### 2. Add GitHub Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `OVSX_PAT`
5. Value: Paste your Open VSX PAT
6. Click **Add secret**

### 3. Verify Workflow

The workflow will trigger on:

- **Push to main branch**: Publishes to Open VSX Registry and creates GitHub release
- **Pull request to main**: Runs tests only (no publishing)

## Workflow Steps

1. **Checkout**: Gets the latest code
2. **Setup Node.js**: Installs Node.js 18 with npm caching
3. **Install dependencies**: Runs `npm ci`
4. **Run tests**: Executes `npm test` to ensure quality
5. **Build extension**: Compiles TypeScript with `npm run compile`
6. **Package extension**: Creates VSIX file with `npm run package`
7. **Publish to Open VSX**: Publishes using your PAT (only on main branch)
8. **Create Release**: Creates GitHub release with VSIX file (only on main branch)

## Manual Publishing

If you need to publish manually:

```bash
# Build and package
npm run compile
npm run package

# Publish to Open VSX Registry
npx @vscode/vsce publish -p YOUR_OVSX_PAT
```

## Troubleshooting

### Common Issues

1. **Authentication failed**: Check that `OVSX_PAT` secret is correctly set
2. **Build errors**: Ensure all dependencies are installed and tests pass
3. **Publishing errors**: Verify the extension metadata in `package.json`

### Debugging

- Check the GitHub Actions logs for detailed error messages
- Verify the Open VSX PAT has the correct permissions
- Ensure the extension name and publisher are unique

## Benefits of Open VSX Registry

- **Open Source**: Free and open alternative to VS Code Marketplace
- **Community Driven**: Supported by the VS Code community
- **No Vendor Lock-in**: Independent of Microsoft's marketplace
- **Privacy**: No tracking or analytics
- **Compatibility**: Works with VS Code, VSCodium, and other editors

## Extension Discovery

Once published, users can find your extension at:

- **Open VSX Registry**: [https://open-vsx.org/extension/vsx-remote-ssh/vsx-remote-ssh]
- **VS Code**: Search for "SSH Remote" in the Extensions panel
- **Direct URL**: [https://open-vsx.org/extension/vsx-remote-ssh/vsx-remote-ssh]
