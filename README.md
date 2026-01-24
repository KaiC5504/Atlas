<div align="center">

<img src="src-tauri/icons/icon.png" alt="Atlas Logo" width="120" height="120">

# Atlas

**A personal desktop utility suite built with Tauri, React, and Python**

[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

## About

Atlas is a local-first desktop application that consolidates my frequently used tools into a single unified interface. It demonstrates full-stack desktop development combining a modern React frontend, a performant Rust backend via Tauri, and Python workers for ML and utility tasks.

This project serves as both a practical daily-use tool and a showcase of multi-runtime system architecture.

## Features

### System & Performance
- **Real-time System Monitoring** — Live CPU, RAM, and GPU metrics with NVIDIA NVML integration
- **Gaming Session Tracker** — Automatic game detection with performance logging and bottleneck analysis
- **Process Manager** — View and manage running processes with gaming optimization profiles

### Gaming Utilities
- **Multi-Platform Game Launcher** — Unified launcher for Steam, HoYoPlay, and Riot Games with automatic icon extraction
- **Gacha History Tracker** — Import and view warp history for Genshin Impact, Honkai: Star Rail, and Zenless Zone Zero
- **Valorant Store Checker** — Check daily store

### Media & ML
- **YouTube Downloader** — Download videos and audio with yt-dlp, featuring queue management and format selection
- **Audio Event Detection** — ONNX-based ML inference for audio classification
- **Audio Separation** — Separate vocals and instruments with model enhancement capabilities

### Server & Remote
- **SSH Terminal** — Integrated terminal with saved credential management
- **Server Status Monitor** — Track uptime and availability of configured servers
- **Remote File Management** — Browse and manage files on remote systems

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, Recharts |
| **Backend** | Tauri 2 (Rust), Tokio async runtime, serde |
| **ML/Workers** | Python, ONNX Runtime, audio-separator, Paramiko |
| **System** | sysinfo, nvml-wrapper (NVIDIA GPU), windows-registry |
| **Integrations** | Discord Rich Presence, yt-dlp, Riot RSO, HoYoverse API |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│            TypeScript  •  Vite  •  Tailwind              │
└────────────────────────────┬────────────────────────────┘
                             │ Tauri IPC
┌────────────────────────────▼────────────────────────────┐
│                     Rust Backend                         │
│   Commands  •  System Info  •  Gaming  •  Launcher       │
└────────────────────────────┬────────────────────────────┘
                             │ Subprocess / Sidecar
┌────────────────────────────▼────────────────────────────┐
│                    Python Workers                        │
│   ML Audio  •  SSH  •  yt-dlp  •  Gacha  •  Valorant    │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
atlas/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Route pages
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utilities and helpers
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands/       # Tauri command handlers
│       ├── gaming/         # Game detection and profiles
│       └── performance/    # System monitoring
└── src-python/             # Python workers
    ├── audio/              # ML audio processing
    ├── ssh/                # Remote access utilities
    └── api/                # External API integrations
```

## Technical Highlights

- **Multi-Runtime Architecture** — Seamless IPC between Rust, TypeScript, and Python processes
- **Real-Time Data Streaming** — Live system metrics with efficient polling and charting
- **Game Platform Integration** — Unified launcher with registry-based game discovery and icon extraction
- **ML Inference Pipeline** — ONNX model loading with support for model retraining workflows
- **API Integrations** — HoYoverse gacha API, Riot RSO authentication, Discord Rich Presence
- **Windows System APIs** — Process management, registry access, and system metrics collection

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run tauri dev

# Production build
npm run tauri build

# Run tests
npm test
```

This project is for personal use.
