# ATEM Delayed Streamer - Project Specification

**Role:** Expert Senior Software Engineer and Cross-Platform Desktop Architect.
**Task:** Build a production-grade Electron/Node.js application that captures video via USB, records it locally in a highly resilient format, and exposes a network handshake API to allow a secondary machine to stream the delayed file.
**Target OS:** Windows 10 (Prototype phase), but all filesystem operations and device polling logic MUST be abstracted to allow easy substitution for macOS (`avfoundation`) in the next sprint.

## 1. Core Architecture & Tech Stack
*   **Frontend:** Electron (UI should be Vanilla JS/HTML/CSS or lightweight React. No heavy frameworks).
*   **Backend:** Node.js (Electron Main Process).
*   **Capture Engine:** FFmpeg (Spawned as a child process).
*   **Network Handshake:** Express.js (Running on a lightweight local port, e.g., 8080).
*   **Container Format:** MPEG-TS (`.ts`) for crash resilience and continuous reading.
*   **Video Codec:** `libx264` (CPU encoding for compatibility during prototyping, `preset: veryfast`, `crf: 18` for high quality).

## 2. UI / UX Requirements
*   **No Video Preview:** The UI must NOT render the video feed.
*   **Telemetry Dashboard:** The UI must only display:
    *   Device Status Indicator (Waiting / Connected).
    *   Capture Status (Idle / Buffering).
    *   Storage Status (Drive E: space remaining, current file size).
    *   Network Status (Handshake server running, last ping received).
    *   FFmpeg Health (Current FPS, Bitrate, Dropped Frames).
*   **Controls:** A single, massive "START BUFFERING" / "STOP BUFFERING" button.

## 3. Storage & File System (Strict Requirements)
*   The primary save path is hardcoded for the Windows prototype: `E:\RECORDINGS\`.
*   Upon clicking "START", the app must generate a new subfolder using a timestamp: `E:\RECORDINGS\YYYY-MM-DD_HH-MM-SS\`.
*   Inside this folder, save the file as `stream.ts`.
*   **Agent Instruction:** Use Node's native `path` and `fs` modules strictly. Do not use hardcoded backslashes (`\`); use `path.join()` so the pathing translates cleanly to macOS later.

## 4. Feature Specifications & Step-by-Step Logic

### Step 4.1: Auto-Detecting the Hardware
*   Implement a polling mechanism (every 3 seconds) in the Main Process.
*   **Windows Implementation:** Execute `ffmpeg -list_devices true -f dshow -i dummy`.
*   Parse `stderr` for "Blackmagic Design" or similar identifiers indicating the ATEM Mini Pro is connected via USB.
*   Update the UI via IPC: Once detected, turn the status indicator GREEN and enable the "START" button.
*   **Fallback:** Provide a dropdown menu in the UI to manually select the input device if auto-detect regex fails.

### Step 4.2: The Capture Engine (FFmpeg Spawn)
*   When "START" is clicked, spawn an FFmpeg child process.
*   **Windows Command Signature:**
    `ffmpeg -f dshow -rtbufsize 1024M -i video="Blackmagic Design" -c:v libx264 -preset veryfast -crf 18 -g 60 -f mpegts <path_to_E_drive_folder>\stream.ts`
*   *Note on `-g 60`: Forces a keyframe every 60 frames (1 second at 60fps) to ensure the secondary machine can pick up the stream easily.*
*   **Error Handling:** Ensure the child process `stderr` is piped to a parsing function to extract `frame=`, `fps=`, `bitrate=`, and `drop=`. Send this data to the UI every 1 second.

### Step 4.3: The Network Handshake API
*   Start an Express.js server on port `8080` upon app launch.
*   Endpoint: `GET /status`
*   **Payload Requirements:**
    ```json
    {
      "status": "recording", // or "idle", "error"
      "filePath": "E:\\RECORDINGS\\2026-05-04_14-00-00\\stream.ts",
      "startTimestamp": 1714838400,
      "delayTargetSeconds": 600
    }
    ```
*   Add endpoint: `POST /ping` to allow Machine B to announce its presence. Update the UI with "Machine B Connected" when a ping is received.

### Step 4.4: Health Monitoring & Telemetry
*   **File Growth Watcher:** Implement a function that checks the file size of `stream.ts` every 5 seconds. If the file size remains identical for two consecutive checks while the status is "recording", emit a CRITICAL ERROR via IPC to the UI (indicates FFmpeg froze or USB disconnected).
*   **Disk Space Watcher:** Check remaining space on drive `E:`. If `< 20GB`, show a YELLOW warning on the UI (disk almost full). If `< 5GB`, show RED.
*   **Crash Recovery:** If the FFmpeg child process exits with a code other than `0` or `255`, automatically attempt to respawn it exactly once. If it fails again, halt and log the error.

## 5. OBS Setup Instructions (Print to UI or Console)
*   The application should include a static "Help" tab providing the following setup instructions for Machine B:
    1.  Ensure Machine B has network access to Machine A's `E:\RECORDINGS\` drive (via SMB shared folder).
    2.  In OBS on Machine B, add a "Media Source".
    3.  Uncheck "Local File".
    4.  Set Input to the network path (e.g., `smb://<Machine_A_IP>/RECORDINGS/<Current_Timestamp>/stream.ts`).
    5.  Set "Network Buffering" to `2 MB`.
    6.  Check "Hardware Decoding".

## 6. Implementation Deliverables
Agent, please generate the code in the following order:
1.  `package.json` with necessary scripts and dependencies (e.g., `electron`, `express`, `fluent-ffmpeg` or raw `child_process`).
2.  `main.js` (Electron Main process handling IPC, Express server, and FFmpeg spawning).
3.  `hw_detect.js` (Dedicated module for polling and regex parsing of dshow/avfoundation).
4.  `telemetry.js` (Dedicated module for file growth and disk space checking).
5.  `index.html` & `renderer.js` (Clean, dark-mode CSS UI with telemetry status boxes).
