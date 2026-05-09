# ATEM Delayed Streamer - Technical Specifications & Features

## 1. Core Technology Stack
The application is built as a high-performance, production-grade desktop utility for live broadcast environments.

*   **Runtime:** Electron (v28.0.0)
    *   Provides the cross-platform shell and native Windows API access.
    *   Separates concerns into a **Main Process** (system-level tasks) and **Renderer Process** (UI).
*   **Backend Logic:** Node.js
    *   Handles asynchronous system calls, file system monitoring, and process management.
*   **Video Engine:** FFmpeg
    *   **Version:** System-dependent (recommended v6.0+).
    *   **Role:** Performs the high-bitrate capture from ATEM Mini Pro via USB (DirectShow).
    *   **Format:** MPEG-TS (Transport Stream) chosen for crash resilience; files are playable even if the process is terminated abruptly.
*   **Networking:**
    *   **Express.js:** Hosts a local Handshake API (Port 8080) for Machine B to poll status.
    *   **obs-websocket-js (v5.x):** Protocol for low-latency remote control of Machine B's OBS instance.
*   **Frontend:**
    *   **Structure:** Semantic HTML5.
    *   **Styling:** Vanilla CSS3 with a "Modern Industrial" design system (Slate/Blue/Emerald palette).
    *   **Logic:** Pure JavaScript (ES6+) for ultra-low overhead.

---

## 2. Key System Architecture

### 2.1 Hardware Discovery (`hw_detect.js`)
*   Uses Windows Management Instrumentation (`wmic`) to poll the system's PnP device list.
*   Specifically filters for "Blackmagic Design" or "ATEM" hardware IDs to ensure the correct capture source is selected.
*   Polls every 3 seconds to handle hot-plugging.

### 2.2 Recording & Telemetry (`main.js` & `telemetry.js`)
*   **Dynamic Pathing:** Generates timestamped folders in the format `YYYY-MM-DD_HH-MM-SS`.
*   **Disk Monitoring:** Uses `check-disk-space` to provide real-time GB remaining on the selected target drive.
*   **Health Checks:** Monitors file growth every 5 seconds. If the file size stagnates while FFmpeg is running, a critical alert is triggered (detects USB link failures).

### 2.3 The Delay Protocol (Sprint 2 Logic)
*   **Automated Handshake:** Establishes a WebSocket connection to the secondary machine (Machine B).
*   **Synchronized Trigger:** Once buffering starts, a high-precision Node.js timer counts down the `Buffer Delay`. Upon completion, it fires a `SetCurrentProgramScene` request to switch OBS to the `DELAYED_STREAM` scene.
*   **Safe Start:** Immediately switches OBS to `SAFE_SCENE` when buffering begins to ensure no "dirty" transitions or black screens.

---

## 3. Detailed Feature Set

*   **Variable Buffer Timing:** User-adjustable delay (Default: 600s) to accommodate different broadcast requirements.
*   **Base Directory Selection:** Native Windows folder picker for selecting high-speed storage targets (SSD/RAID).
*   **Panic Protocol:** A dedicated "Emergency Panic" button that overrides all automation to cut Machine B to a safe holding graphic instantly.
*   **Persistent Configuration:** OBS credentials, IP addresses, and recording paths are saved to Chromium's `localStorage` and reloaded on boot.
*   **Clipboard Integration:** One-click copying of the complex SMB path for easy setup in OBS Media Sources.
*   **FFmpeg Real-time Telemetry:** Parses the FFmpeg stderr stream to display:
    *   Current encoding FPS.
    *   Real-time bitrate.
    *   Dropped frame count.

---

## 4. Production & Deployment (Phase 2)
The application is now fully packaged for Windows deployment using **Electron Builder**.

### 4.1 Local FFmpeg Bundling
*   To ensure zero-configuration for the client, the application now includes its own static **FFmpeg Windows Binary** (`v6.0+`).
*   **Location:** Packaged within `extraResources` and called dynamically by the Node.js backend.
*   **Path Logic:** The app automatically detects if it is running in a development environment or as a compiled package, adjusting its search path for `ffmpeg.exe` accordingly.

### 4.2 Installer (NSIS)
*   **Format:** A standard `.exe` installer with a guided wizard.
*   **Features:**
    *   Configurable installation directory.
    *   Automatic Desktop and Start Menu shortcut creation.
    *   Self-contained bundle including all native Node.js security modules (keytar, etc.).

---

## 5. Dependencies (`package.json`)
```json
{
  "dependencies": {
    "obs-websocket-js": "^5.0.8",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "check-disk-space": "^3.4.0",
    "axios": "^1.16.0",
    "keytar": "^7.9.0",
    "node-machine-id": "^1.1.12"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^26.8.1"
  }
}
```

---

## 6. Deployment Requirements
*   **OS:** Windows 10/11 (x64).
*   **Hardware:** ATEM Mini Pro/Extreme via USB-C.
*   **Network:** LAN/VLAN access for Machine B (SMB sharing enabled on recording target).
*   **OBS:** Version 28+ on Machine B (WebSocket enabled).
*   **FFmpeg:** **Included** (No system installation required).
