<div align="center">
  <img src="resources/icon.png" alt="yaKaggle Logo" width="140" height="140" />

# yaKaggle

### Yet Another Kaggle Extension for Visual Studio Code

[![Visual Studio Marketplace](https://img.shields.io/badge/VS_Code_Marketplace-yaKaggle-blue.svg?style=flat&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=rnascunha.yaKaggle)
[![CI](https://github.com/rnascunha/yaKaggle/actions/workflows/ci.yml/badge.svg)](https://github.com/rnascunha/yaKaggle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![GitHub issues](https://img.shields.io/github/issues/rnascunha/yaKaggle)](https://github.com/rnascunha/yaKaggle/issues)
[![GitHub stars](https://img.shields.io/github/stars/rnascunha/yaKaggle)](https://github.com/rnascunha/yaKaggle/stargazers)

  <p align="center">
    Seamlessly interact with Kaggle Kernels, Datasets, and Competitions directly from inside VS Code using the official Kaggle CLI.
  </p>

  <p align="center">
    <strong><a href="https://marketplace.visualstudio.com/items?itemName=rnascunha.yaKaggle">Install from the VS Code Marketplace</a></strong>
  </p>
</div>

---

> ⚠️ **Development Notice:** **yaKaggle** is currently under active development. While core workflows are functional, it has not yet been comprehensively tested across every OS distribution, shell, and virtual environment setup. If you run into unexpected behavior, please file a report on [GitHub Issues](https://github.com/rnascunha/yaKaggle/issues).

---

## Overview

**yaKaggle** bridges the gap between your local development environment and Kaggle's cloud platform. Instead of constantly switching between browser tabs, terminal commands, and editors, yaKaggle surfaces Kaggle Kernels, Datasets, and Competitions into structured, non-blocking VS Code TreeViews, output channels, and status bar monitors.

Whether pushing model updates, monitoring training jobs, browsing datasets, or tracking competition leaderboards, yaKaggle streamlines your workflow inside VS Code.

---

## Kaggle API Token & Authentication Setup

To use yaKaggle, you need an active Kaggle account and an official API token.

### 1. Generating Your Token on Kaggle

1. Sign in to your account at [kaggle.com](https://www.kaggle.com).
2. Click on your profile picture in the top-right corner and select **Settings** (or navigate directly to `https://www.kaggle.com/settings`).
3. Scroll down to the **API** section.
4. Click **Create New Token**.

### 2. Placing Your Credentials (Modern vs Legacy Format)

> ℹ️ **Notice on Token Deprecation:** Per the latest Kaggle CLI specifications, the classic `kaggle.json` file format is deprecated in favor of **`~/.kaggle/access_token`**.

- **Primary / Modern Standard (`access_token`):**
  Save your raw API token directly as text inside `access_token`:
  - **Linux / macOS:**

```bash
mkdir -p ~/.kaggle
echo "YOUR_API_TOKEN_HERE" > ~/.kaggle/access_token
chmod 600 ~/.kaggle/access_token
```

- **Windows:**
  Save the plain token string in:
  `C:\\Users\\<YourUsername>\\.kaggle\\access_token`

### 3. Verification Inside yaKaggle

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) in VS Code and run:

- **`yaKaggle: Verify Credentials`** to confirm the token is detected and valid.
- If your token is stored in a non-standard folder, configure `yaKaggle.kaggleConfigDir` in your VS Code settings.

---

## Features

### 🧠 Kernels & Notebooks

- **Local Workspace Detection**: Discovers `kernel-metadata.json` configurations across your workspace and pairs them with their local script or notebook file.
- **Missing File Alerts**: Inline visual warnings highlight metadata entries pointing to missing files on disk.
- **Schema Validation & Autocomplete**: Full JSON schema validation for `kernel-metadata.json`, featuring autocompletion, field descriptions, and real-time linting.
- **Remote Notebook Browsing**: View your remote Kaggle kernels with built-in pagination support.
- **Pull to In-Memory Buffer**: Download and preview remote notebooks or scripts directly into untitled VS Code editor tabs without creating local files.
- **One-Click Kernel Push**: Push code changes to Kaggle directly from the sidebar with background progress reporting.
- **Live Status Monitoring**: Monitors active/queued jobs, updates execution state in real-time, and streams execution logs to a dedicated VS Code Output Channel.
- **Artifact Extraction**: Download all generated output files, model weights, and logs from completed or running remote kernels.

### 💾 Datasets

- **Local Dataset Explorer**: Identifies `dataset-metadata.json` files and outlines directory trees.
- **Dataset Initialization Wizard**: Interactive command to scaffold a new dataset folder and generate standard metadata boilerplate.
- **Schema Validation**: Built-in validation schema for `dataset-metadata.json`.
- **Remote Dataset Management**: Lists all your hosted datasets with complete, untruncated titles and size information.
- **Lazy File Browsing**: Inspect files and folder hierarchies inside remote datasets on demand.
- **Flexible Downloading**: Download complete datasets as untouched `.zip` archives or grab individual files on demand while preserving folder hierarchy.
- **Web Shortcuts**: One-click actions to open any dataset directly on Kaggle.

### 🏆 Competitions

- **Dual-Category View**:
  1. **My Active Competitions**: Automatically surfaces ongoing competitions you have entered.
  2. **Recent & Featured**: Lists newly created competitions with "Load More..." pagination.
- **Status Badges & Urgency Icons**:
  - 🟢 **Active & Joined**: Green verified badge.
  - 🔵 **Closed & Joined**: Blue checkmark.
  - ⚪ **Closed & Not Entered**: Gray checkmark.
  - 🔥 / ⏰ / 🏆 **Active & Not Entered**: Dynamic icons highlighting approaching deadlines and urgency.
- **Detailed Tooltips**: Hover over entries to see category, prize pool, team counts, and human-readable countdowns.
- **Live Leaderboard Inspector**: View top-ranked teams along with your personal standing, score, and submission counts printed cleanly in a tabular log.
- **Data Download**: Download competition files directly into your workspace.

### ⚙️ Engine & Discovery

- **Dynamic Environment Resolution**: Automatically locates the `kaggle` executable in active virtual environments (`.venv`, `venv`, `conda`, `uv`) or system `PATH`.
- **Custom Binary Path Support**: Manually specify custom binary paths via VS Code settings or setup commands.
- **Credentials Helper**: Validates and inspects credential files, including automatic permission repair (`chmod 0600`) on Linux/macOS.

---

## End-User Installation

For standard use, install **yaKaggle** directly from the editor:

1. Open VS Code.
2. Press `Ctrl+P` (or `Cmd+P` on macOS), paste:

```text
ext install rnascunha.yaKaggle
```

and press **Enter**. 3. Or visit the [Visual Studio Marketplace page](https://marketplace.visualstudio.com/items?itemName=rnascunha.yaKaggle).

---

## Development Setup (Contributing & Local Testing)

> 🛠️ **Note:** The steps below are intended **only for developers** looking to build, debug, or contribute to yaKaggle from source.

### Prerequisites

1. **Node.js** (v22.x or higher) and **npm**.
2. **Kaggle CLI** installed in your active Python environment:

```bash
pip install kaggle
```

3. A configured Kaggle API token (see [Authentication Setup](#kaggle-api-token--authentication-setup)).

### Clone and Build from Source

1. Clone the repository:

```bash
git clone https://github.com/rnascunha/yaKaggle.git
cd yaKaggle
```

2. Install dependencies:

```bash
npm install
```

3. Compile TypeScript:

```bash
npm run compile
```

_(Or run `npm run watch` for continuous incremental builds)._

### Running and Debugging Locally

1. Open the project folder in VS Code:

```bash
code .
```

2. Press **`F5`** (or select **Run and Debug** -> **Run Extension**).
3. An **Extension Development Host** window will launch with **yaKaggle** loaded.
4. Click on the **yaKaggle** icon in the Activity Bar to test your changes.

### Running Tests

- **Run Fast Unit Tests** (Node-based with mock module hooks):

```bash
npm run test:unit
```

- **Run Full VS Code Integration Suite** (headless Electron runner):

```bash
npm test
```

---

## Extension Settings

yaKaggle provides the following settings (`Ctrl+,` or `Cmd+,`):

- `yaKaggle.kagglePath`: Custom path to your `kaggle` CLI executable or virtual environment root folder. If empty, yaKaggle auto-discovers it.
- `yaKaggle.kaggleConfigDir`: Custom directory path containing your credentials (`access_token` or `kaggle.json`, defaults to `~/.kaggle`).

---

## Feedback, Bugs & Contributing

Contributions, feature requests, and bug reports are welcome:

- **Found a bug?** Please submit reproduction steps and system details on our [GitHub Issues](https://github.com/rnascunha/yaKaggle/issues).
- **Have an idea?** Feel free to open an issue or start a discussion.
- **Want to contribute?** Fork the repository, create a branch (`git checkout -b feature/my-feature`), and open a Pull Request targeting the `dev` branch.

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
