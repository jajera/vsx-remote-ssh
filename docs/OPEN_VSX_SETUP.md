# Open VSX Registry Publishing Setup

## 🔑 Getting Your Open VSX Token

1. **Create an account** at [https://open-vsx.org](https://open-vsx.org)
2. **Go to User Settings** → [https://open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens)
3. **Generate a new token** with publish permissions
4. **Copy the token** (you'll only see it once!)

## ⚙️ Setting Up GitHub Secrets

1. **Go to your GitHub repository**
2. **Navigate to Settings** → **Secrets and variables** → **Actions**
3. **Add a new repository secret:**
   - **Name:** `OVSX_PAT`
   - **Value:** Your Open VSX token

## 🔧 Publisher Name Configuration

**IMPORTANT:** Your Open VSX Registry account name must match the publisher in `package.json`!

### Current Configuration

```json
{
  "publisher": "vsx-remote-ssh"
}
```

### If your Open VSX account is different

1. **Option A:** Update `package.json` publisher to match your account
2. **Option B:** Create a new Open VSX account with name `vsx-remote-ssh`

## 🚀 Publishing Process

The workflow will automatically:

1. ✅ Run tests and security audit
2. ✅ Auto-increment version if needed
3. ✅ Package the extension
4. ✅ Publish to Open VSX Registry
5. ✅ Create GitHub release

## 🔍 Troubleshooting

### Error: "User not authorized"

- ✅ Check your `OVSX_PAT` secret is set correctly
- ✅ Verify your Open VSX account matches the publisher name
- ✅ Ensure the token has publish permissions

### Error: "Extension already exists"

- ✅ The workflow will auto-increment version
- ✅ Check if the extension name is available

### Error: "Invalid publisher"

- ✅ Update `package.json` publisher field to match your Open VSX account
- ✅ Or create a new Open VSX account with the current publisher name

## 📦 Manual Publishing (if needed)

```bash
# Install vsce
npm install -g @vscode/vsce

# Package extension
npm run package

# Publish to Open VSX Registry
npx @vscode/vsce publish -p YOUR_TOKEN --registry https://open-vsx.org
```

## 🔗 Useful Links

- [Open VSX Registry](https://open-vsx.org)
- [Open VSX User Settings](https://open-vsx.org/user-settings/tokens)
- [VS Code Extension Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Open VSX Publishing Guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)
