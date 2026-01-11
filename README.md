<div align="center">

# Atlas

**Your Personal Command Center**

A privacy-focused desktop app that keeps everything local — no cloud, no tracking, just you and your data.

[![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_2-FFC131?style=flat-square&logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-Powered-DEA584?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![Python](https://img.shields.io/badge/Python-ML_Workers-3776AB?style=flat-square&logo=python)](https://python.org)

---

</div>

## What is Atlas?

Atlas is a local-first desktop application that combines media tools, machine learning, and system monitoring into one sleek interface. Everything runs on your machine — your data never leaves.

<br>

## Features

| | Feature | Description |
|:---:|:---|:---|
| **🎬** | **Media Downloads** | Grab YouTube videos in any quality with yt-dlp |
| **🎧** | **Audio Processing** | Separate audio tracks using local ML models |
| **🎮** | **Valorant Tracker** | Check your daily store and track history |
| **📊** | **Performance Monitor** | Real-time CPU, GPU & RAM metrics |
| **🕹️** | **Gaming Analysis** | Detect bottlenecks while you play |
| **🖥️** | **Server Management** | SSH into remote machines with ease |

<br>

## Tech Stack

```
┌─────────────────────────────────────────────────────┐
│   UI          React  •  TypeScript  •  Tailwind    │
├─────────────────────────────────────────────────────┤
│   Core        Rust  •  Tauri 2  •  Tokio           │
├─────────────────────────────────────────────────────┤
│   Compute     Python  •  PyTorch  •  yt-dlp        │
└─────────────────────────────────────────────────────┘
```

<br>

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/atlas.git
cd atlas
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

### Requirements

- Node.js 16+
- Rust toolchain
- Python 3.8+
- NVIDIA drivers *(optional, for GPU monitoring)*

<br>

## Project Layout

```
atlas/
├── src/                 → React frontend
├── src-tauri/           → Rust backend
└── python_workers/      → ML & processing scripts
```

<br>

---

<div align="center">

**Built with care for privacy enthusiasts**

</div>
