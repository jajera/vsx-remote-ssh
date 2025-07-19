# Open VSX Registry Publishing Setup

## 🔑 Getting Your Open VSX Token

1. **Create an account** at [https://open-vsx.org](https://open-vsx.org)
2. **Go to User Settings** → [https://open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens)
3. **Generate a new token** with publish permissions
4. **Copy the token** (you'll only see it once!)

## 🏗️ First Time Setup - Create Namespace

**IMPORTANT:** Before publishing, you must create your publisher namespace!

### Option 1: Using ovsx CLI (Recommended)

```bash
# Install ovsx CLI
npm install -g ovsx

# Create namespace for your publisher (replace with your GitHub username)
ovsx create-namespace YOUR_GITHUB_USERNAME

# You'll be prompted to log in to Open VSX Registry
# Use your Open VSX account credentials
```

### Option 2: Using Web Interface

1. **Go to** [https://open-vsx.org](https://open-vsx.org)
2. **Sign in** with your account
3. **Navigate to your profile** or publisher settings
4. **Create namespace** with your GitHub username

### Option 3: Using GitHub Actions (One-time)

```bash
# Run this command locally or in a temporary workflow
npx ovsx create-namespace YOUR_GITHUB_USERNAME
```

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
  "publisher": "jajera"
}
```

**Note:** The workflow dynamically reads the publisher from `package.json` and uses `${{ github.repository_owner }}` for the GitHub username.

### If your Open VSX account is different

1. **Option A:** Update `package.json` publisher to match your account
2. **Option B:** Create a new Open VSX account with your GitHub username

## 🚀 Publishing Process

The workflow will automatically:

1. ✅ Run tests and security audit
2. ✅ Check if version is new
3. ✅ Package the extension
4. ✅ Publish to Open VSX Registry
5. ✅ Create GitHub release

## 🔍 Troubleshooting

### Error: "Unknown publisher"

- ✅ **Create namespace first:** `ovsx create-namespace YOUR_GITHUB_USERNAME`
- ✅ Verify your Open VSX account matches the publisher name
- ✅ Make sure you're logged in to Open VSX Registry

### Error: "User not authorized"

- ✅ Check your `OVSX_PAT` secret is set correctly
- ✅ Verify your Open VSX account matches the publisher name
- ✅ Ensure the token has publish permissions

### Error: "Extension already exists"

- ✅ The workflow will skip if version already released
- ✅ Check if the extension name is available

### Error: "Invalid publisher"

- ✅ Update `package.json` publisher field to match your Open VSX account
- ✅ Or create a new Open VSX account with the current publisher name

## 📦 Manual Publishing (if needed)

```bash
# Install ovsx
npm install -g ovsx

# Create namespace (first time only)
ovsx create-namespace YOUR_GITHUB_USERNAME

# Package extension
npm run package

# Publish to Open VSX Registry
ovsx publish --packagePath *.vsix
```

## 🔗 Useful Links

- [Open VSX Registry](https://open-vsx.org)
- [Open VSX User Settings](https://open-vsx.org/user-settings/tokens)
- [VS Code Extension Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Open VSX Publishing Guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)
