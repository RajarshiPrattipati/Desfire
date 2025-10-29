# .gitignore Configuration Guide

## Overview

Comprehensive `.gitignore` configuration for the DESFire Card Management System, covering Node.js backend, React Native mobile app, and security-critical files.

---

## 🔒 Critical Security Ignores

### Keys & Secrets (NEVER COMMIT!)
```
keys/                    # Encrypted key storage directory
*.key                    # Key files (AES, RSA, etc.)
*.pem, *.p12, *.pfx     # Certificate files
*.jks, *.keystore       # Java keystores (Android)
credentials.json         # Service account credentials
secrets.json            # API keys, tokens
```

### Environment Variables
```
.env                    # All environment files
.env.local
.env.*.local
.env.development.local
.env.test.local
.env.production.local
```

**⚠️ IMPORTANT**: Never commit these files! They contain sensitive data like:
- Master encryption passwords
- API keys
- Database credentials
- Card keys and secrets

---

## 📦 Dependencies

```
node_modules/           # NPM packages
*.log                   # Log files from package managers
.pnpm-store/           # PNPM store
bun.lockb              # Bun lock file
```

**Note**: `package-lock.json` is tracked to ensure consistent installations.

---

## 🏗️ Build Output

```
dist/                   # TypeScript compiled output
build/                  # Production builds
out/                    # Alternative output directory
*.js.map               # Source maps
*.tsbuildinfo          # TypeScript incremental builds
```

---

## 📱 Mobile App

The entire `mobile/` directory is ignored because it's a separate repository with its own `.gitignore`.

If you need to track mobile code in this repo, remove `mobile/` from `.gitignore` and uncomment the mobile-specific entries:

### React Native / Expo
```
.expo/
.expo-shared/
*.mobileprovision
web-build/
```

### Android
```
*.apk, *.aab           # Build artifacts
android/app/build/
android/.gradle/
android/local.properties
```

### iOS
```
ios/Pods/              # CocoaPods dependencies
ios/build/
*.xcuserstate
xcuserdata/
DerivedData/
*.ipa, *.dSYM.zip
```

---

## 💻 IDEs & Editors

### VSCode
```
.vscode/
*.code-workspace
```

### IntelliJ IDEA
```
.idea/
*.iml, *.iws, *.ipr
```

### Vim
```
*.swp, *.swo, *~
```

### Sublime Text
```
*.sublime-project
*.sublime-workspace
```

---

## 🖥️ Operating System Files

### macOS
```
.DS_Store              # Finder metadata
._*                    # Resource forks
.Spotlight-V100        # Spotlight index
.Trashes              # Trash metadata
```

### Windows
```
Thumbs.db             # Thumbnail cache
Desktop.ini           # Folder settings
$RECYCLE.BIN/        # Recycle bin
```

### Linux
```
.directory            # Dolphin directory settings
.Trash-*              # Trash files
```

---

## 🧪 Testing & Coverage

```
coverage/             # Code coverage reports
.nyc_output/         # NYC coverage
*.lcov               # LCOV coverage format
.jest/               # Jest cache
__tests__/__snapshots__/  # Jest snapshots
```

---

## 🗄️ Database Files

```
*.sqlite, *.sqlite3   # SQLite databases
*.db                  # Generic database files
*.db-journal          # SQLite journals
```

---

## 📝 Optional Ignores

### NFC/Card Testing Data
Currently commented out. Uncomment if needed:
```gitignore
# test-cards/
# card-dumps/
# *.dump
```

### Package Manager Lock Files
Currently all lock files are tracked. To ignore specific ones:
```gitignore
# package-lock.json    # NPM
# yarn.lock           # Yarn
# pnpm-lock.yaml      # PNPM
# bun.lockb           # Bun
```

**Recommendation**: Track at least one lock file for reproducible builds.

---

## ✅ What Should Be Tracked

### Always Track
- ✅ Source code (`src/`)
- ✅ Configuration files (`package.json`, `tsconfig.json`)
- ✅ Documentation (`*.md`)
- ✅ Type declarations (`src/types/`)
- ✅ Example files (`.env.example`)
- ✅ Scripts and tools

### Never Track
- ❌ Secrets and keys (`keys/`, `.env`)
- ❌ Dependencies (`node_modules/`)
- ❌ Build output (`dist/`, `build/`)
- ❌ OS files (`.DS_Store`, `Thumbs.db`)
- ❌ IDE settings (`.vscode/`, `.idea/`)
- ❌ Logs (`*.log`)

---

## 🔍 Verify .gitignore

### Check what's ignored
```bash
git status
```

### Check if specific file is ignored
```bash
git check-ignore -v keys/app_000001.key
# Should output: .gitignore:9:keys/
```

### List all ignored files
```bash
git ls-files --others --ignored --exclude-standard
```

### See what would be added
```bash
git add --dry-run .
```

---

## 🚀 Git Status After Setup

Current untracked files (should be committed):
```
✅ .gitignore              # This file
✅ README_APP.md           # Documentation
✅ KEY_MANAGEMENT.md       # Documentation
✅ SETUP_COMPLETE.md       # Documentation
✅ package.json            # Dependencies
✅ package-lock.json       # Lock file
✅ tsconfig.json           # TypeScript config
✅ src/                    # Source code
```

Correctly ignored:
```
🔒 keys/                   # Encrypted keys (when created)
🔒 mobile/                 # Separate repo
🔒 node_modules/           # Dependencies
🔒 dist/                   # Build output
🔒 .env                    # Environment (when created)
```

---

## 🛡️ Security Checklist

Before committing, verify:
- [ ] No `keys/` directory in git
- [ ] No `.env` files committed
- [ ] No `*.key` or `*.pem` files
- [ ] No `credentials.json` or `secrets.json`
- [ ] No hardcoded passwords in code
- [ ] No API keys in tracked files

### Pre-commit Hook (Recommended)
Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
# Prevent committing sensitive files

if git diff --cached --name-only | grep -E '\.env$|\.key$|\.pem$|keys/|credentials\.json'; then
  echo "❌ ERROR: Attempting to commit sensitive files!"
  echo "Please remove them from the commit."
  exit 1
fi
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

---

## 📚 Additional Resources

### Create .env.example
```bash
# Copy your .env but remove sensitive values
cp .env .env.example
# Edit .env.example and replace values with placeholders
# Commit .env.example (but never .env!)
```

### Clean ignored files
```bash
# Remove all ignored files (WARNING: destructive!)
git clean -fdX

# Dry run first
git clean -fdXn
```

### Update .gitignore after files are tracked
```bash
# If you accidentally tracked a file
git rm --cached keys/app_000001.key
git commit -m "Remove accidentally tracked key file"
```

---

## 🎯 Best Practices

1. **Review before committing**: Always check `git status` and `git diff --cached`
2. **Use .env files**: Never hardcode secrets
3. **Document ignored patterns**: Comment complex patterns
4. **Keep .gitignore updated**: Add patterns as needed
5. **Test on fresh clone**: Verify setup works for other developers

---

## 📖 Current Configuration

The current `.gitignore`:
- ✅ 200+ lines of comprehensive coverage
- ✅ Organized into logical sections
- ✅ Security-first approach
- ✅ Supports multiple package managers
- ✅ Cross-platform compatible
- ✅ Mobile app ready
- ✅ Well documented

---

## 🆘 Troubleshooting

### File still tracked after adding to .gitignore
```bash
# .gitignore only affects untracked files
# To untrack already-tracked files:
git rm --cached <file>
git commit -m "Stop tracking <file>"
```

### Need to track a file in ignored directory
```bash
# Use ! to negate ignore
# In .gitignore:
keys/
!keys/README.md    # Track this one file
```

### Check why file is ignored
```bash
git check-ignore -v path/to/file
```

---

## ✨ Summary

Your `.gitignore` is properly configured to:
- 🔒 Protect sensitive data (keys, env files)
- 🏗️ Exclude build artifacts and dependencies
- 💻 Ignore IDE and OS files
- 📱 Support mobile development
- ✅ Track important configuration and source code

The DESFire project is now secure and ready for version control!
