const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const { OBSWebSocket } = require('obs-websocket-js');

// Internal Modules
const hwDetect = require('./hw_detect');
const telemetry = require('./telemetry');
const licensing = require('./licensing');

// Configuration
let recordingBasePath = 'E:\\RECORDINGS'; // Default
const HANDSHAKE_PORT = 8080;

let mainWindow;
let ffmpegProcess = null;
let currentRecordingPath = '';
let currentRecordingFolder = '';
let recordingStartTime = 0;
let machineBConnected = false;
let bufferTimeout = null;
let obs = new OBSWebSocket();
let isOBSConnected = false;
let licenseStatus = { licensed: false, trialExpired: false };

// Express Setup for Handshake
const server = express();
server.use(cors());
server.use(express.json());

server.get('/status', (req, res) => {
  res.json({
    status: ffmpegProcess ? 'recording' : 'idle',
    filePath: currentRecordingPath,
    startTimestamp: Math.floor(recordingStartTime / 1000),
    delayTargetSeconds: 600,
    license: licenseStatus
  });
});

server.post('/ping', (req, res) => {
  machineBConnected = true;
  if (mainWindow) {
    mainWindow.webContents.send('machine-b-status', { connected: true, lastPing: new Date().toLocaleTimeString() });
  }
  res.sendStatus(200);
});

server.listen(HANDSHAKE_PORT, () => {
  console.log(`Handshake API running on port ${HANDSHAKE_PORT}`);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 950,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'ATEM Delayed Streamer - Machine A'
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); 
}

app.whenReady().then(async () => {
  createWindow();

  // 1. Initial License Check
  licenseStatus = await licensing.checkStatus();
  
  // Start Hardware Polling
  setInterval(async () => {
    const devices = await hwDetect.pollDevices();
    const atem = hwDetect.findATEM(devices);
    if (mainWindow) {
      mainWindow.webContents.send('hw-status', { 
        connected: !!atem, 
        deviceName: atem || 'No ATEM Detected',
        allDevices: devices 
      });
      // Periodically refresh license UI state
      mainWindow.webContents.send('license-status', licenseStatus);
    }
  }, 3000);

  // Start Telemetry Polling
  setInterval(async () => {
    const disk = await telemetry.checkDisk(recordingBasePath);
    let fileSize = '0.00';
    let healthy = true;

    if (ffmpegProcess && currentRecordingPath) {
      fileSize = telemetry.getFileSizeMB(currentRecordingPath);
      healthy = telemetry.checkFileGrowth(currentRecordingPath);
      
      if (!healthy) {
        mainWindow.webContents.send('critical-error', 'CRITICAL: Recording Stagnant! (USB Link Failure?)');
      }
    }

    if (mainWindow) {
      mainWindow.webContents.send('telemetry-update', {
        disk,
        fileSize,
        recording: !!ffmpegProcess
      });
    }
  }, 5000);
});

// Licensing IPC
ipcMain.handle('check-license', async () => {
    licenseStatus = await licensing.checkStatus();
    return licenseStatus;
});

ipcMain.handle('submit-license', async (event, key) => {
    const success = await licensing.saveLicense(key);
    if (success) {
        licenseStatus = await licensing.checkStatus();
        return { success: true, status: licenseStatus };
    }
    return { success: false, message: 'Invalid License Key' };
});

// IPC Folder Selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    recordingBasePath = result.filePaths[0];
    return recordingBasePath;
  }
  return null;
});

ipcMain.on('update-base-path', (event, newPath) => {
  recordingBasePath = newPath;
});

// Helper to format date for path: YYYY-MM-DD_HH-MM-SS
function getTimestampedFolder() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${dateStr}_${timeStr}`;
}

// IPC Handlers
ipcMain.handle('test-obs-connection', async (event, config) => {
  const tempObs = new OBSWebSocket();
  try {
    const url = `ws://${config.ip}:${config.port}`;
    await tempObs.connect(url, config.password);
    await tempObs.disconnect();
    return true;
  } catch (err) {
    console.error('OBS Connection Test Failed:', err);
    return false;
  }
});

ipcMain.on('trigger-panic', async () => {
  console.log(`[${new Date().toISOString()}] PANIC TRIGGERED: Switching to SAFE_SCENE`);
  if (isOBSConnected) {
    try {
      await obs.call('SetCurrentProgramScene', { sceneName: 'SAFE_SCENE' });
    } catch (err) {
      console.error('Failed to trigger panic scene:', err);
    }
  }
});

ipcMain.on('start-buffering', async (event, { deviceName, bufferDelay, obsConfig }) => {
  if (ffmpegProcess) return;

  // Final Gatekeeper: Block if trial expired and not licensed
  if (licenseStatus.trialExpired && !licenseStatus.licensed) {
      console.warn('Block: Trial Expired');
      return;
  }

  // Generate Path
  const folderName = getTimestampedFolder();
  currentRecordingFolder = path.join(recordingBasePath, folderName);
  
  try {
    if (!fs.existsSync(recordingBasePath)) {
      fs.mkdirSync(recordingBasePath, { recursive: true });
    }
    fs.mkdirSync(currentRecordingFolder);
  } catch (err) {
    console.error('Folder creation error:', err);
    return;
  }

  currentRecordingPath = path.join(currentRecordingFolder, 'stream.ts');
  recordingStartTime = Date.now();

  // Determine FFmpeg Path (Local Bundle)
  const ffmpegPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg')
    : path.join(__dirname, 'bin', 'ffmpeg');

  console.log('Using FFmpeg from:', ffmpegPath);

  // Connect to OBS
  if (obsConfig.enabled) {
    try {
      const url = `ws://${obsConfig.ip}:${obsConfig.port}`;
      await obs.connect(url, obsConfig.password);
      isOBSConnected = true;
      console.log('OBS connected for session');
      
      // Explicitly switch to SAFE_SCENE at start of buffering
      await obs.call('SetCurrentProgramScene', { sceneName: 'SAFE_SCENE' });
    } catch (err) {
      console.error('Failed to connect to OBS for session:', err);
      isOBSConnected = false;
    }
  } else {
    console.log('OBS Integration disabled, skipping connection.');
    isOBSConnected = false;
  }

  const args = process.platform === 'darwin' ? [
    '-f', 'avfoundation',
    '-i', `${deviceName}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-g', '60',
    '-f', 'mpegts',
    currentRecordingPath
  ] : [
    '-f', 'dshow',
    '-rtbufsize', '1024M',
    '-i', `video=${deviceName}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-g', '60',
    '-f', 'mpegts',
    currentRecordingPath
  ];

  ffmpegProcess = spawn(ffmpegPath, args);

  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const stats = parseFFmpegStats(output);
    if (stats && mainWindow) {
      mainWindow.webContents.send('ffmpeg-stats', stats);
    }
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg exited with code ${code}`);
    ffmpegProcess = null;
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
      bufferTimeout = null;
    }
    if (isOBSConnected) {
      obs.disconnect();
      isOBSConnected = false;
    }
    if (mainWindow) {
      mainWindow.webContents.send('capture-stopped', code);
    }
  });

  // Set timeout for OBS trigger
  bufferTimeout = setTimeout(async () => {
    console.log(`[${new Date().toISOString()}] Buffer delay reached (${bufferDelay}s).`);
    if (isOBSConnected) {
      console.log(`Switching to DELAYED_STREAM`);
      try {
        await obs.call('SetCurrentProgramScene', { sceneName: 'DELAYED_STREAM' });
      } catch (err) {
        console.error('Failed to switch to DELAYED_STREAM:', err);
      }
    }
  }, bufferDelay * 1000);

  event.reply('capture-started', { 
    path: currentRecordingPath, 
    startTime: recordingStartTime 
  });
});

ipcMain.on('stop-buffering', () => {
  if (bufferTimeout) {
    clearTimeout(bufferTimeout);
    bufferTimeout = null;
  }
  if (ffmpegProcess) {
    ffmpegProcess.stdin.write('q'); 
    setTimeout(() => {
      if (ffmpegProcess) ffmpegProcess.kill('SIGKILL');
    }, 2000);
  }
});

function parseFFmpegStats(data) {
  const fpsMatch = data.match(/fps=\s*([\d.]+)/);
  const bitrateMatch = data.match(/bitrate=\s*([\d.]+\w+\/s)/);
  const frameMatch = data.match(/frame=\s*(\d+)/);
  const dropMatch = data.match(/drop=\s*(\d+)/);

  if (fpsMatch || bitrateMatch) {
    return {
      fps: fpsMatch ? fpsMatch[1] : '0',
      bitrate: bitrateMatch ? bitrateMatch[1] : '0',
      frame: frameMatch ? frameMatch[1] : '0',
      drop: dropMatch ? dropMatch[1] : '0'
    };
  }
  return null;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGKILL');
  }
});

