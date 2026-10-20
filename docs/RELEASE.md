# Release & Versioning Guide (`yaKaggle`)

This document outlines the commands and workflow for updating the `yaKaggle` extension version and publishing a new release to the VS Code Marketplace.

---

## 1. Quick Commands (TL;DR)

Run one of the following commands from the root of the repository on the `main` branch depending on the type of release (current version is `0.1.5`):

```bash
# Patch release (bug fixes: 0.1.5 -> 0.1.6)
npm version patch -m "chore(release): bump version to %s"

# Minor release (new features: 0.1.5 -> 0.2.0)
npm version minor -m "chore(release): bump version to %s"

# Major release (breaking changes: 0.1.5 -> 1.0.0)
npm version major -m "chore(release): bump version to %s"
```

Then push the commit and tags to `main` to trigger the automated GitHub Actions release pipeline:

```bash
git push origin main --follow-tags
```

---

## 2. Step-by-Step Release Workflow

### Step 1: Sync with `main` and Verify Build
Ensure your working directory is clean, you are on the `main` branch, and all compilation and unit tests pass:

```bash
git checkout main
git pull origin main
npm run compile
npm run test:unit
```

### Step 2: Update the Version in `package.json`

#### Option A: Automatic Commit & Git Tag (Recommended)
`npm version` automatically updates `package.json` (and `package-lock.json`), creates a version commit, and tags it as `vX.Y.Z`:

```bash
# Choose patch, minor, major, or specify an exact version (e.g., 0.1.6)
npm version patch
```

#### Option B: Update `package.json` Without Creating a Git Commit/Tag
If you want to stage the version bump alongside other changes or write your own commit manually:

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to $(jq -r .version package.json)"
```

### Step 3: Push to `main` (Triggers GitHub Actions)
Our `.github/workflows/release.yml` workflow monitors pushes to `main` that modify `package.json`. When it detects that the `.version` field changed compared to the previous commit (`HEAD~1`), it automatically compiles and publishes the extension to the VS Code Marketplace:

```bash
git push origin main --follow-tags
```

---

## 3. Local Packaging & Manual Publishing (Optional)

If you want to test the extension package locally before releasing or publish manually from your machine:

### Generate a `.vsix` Package for Local Testing
```bash
npx @vscode/vsce package
```
To install the generated `.vsix` file locally in VS Code:
```bash
code --install-extension yaKaggle-$(jq -r .version package.json).vsix
```

### Publish Manually from CLI
If you need to bypass GitHub Actions and publish directly from your terminal (requires a Personal Access Token):
```bash
npx @vscode/vsce publish
# Or bump and publish in a single step:
npx @vscode/vsce publish patch
```