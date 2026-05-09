const { ipcRenderer, clipboard } = require('electron');

// UI Elements
const actionBtn = document.getElementById('action-btn');
const hwDot = document.getElementById('hw-dot');
const hwText = document.getElementById('hw-text');
const captureVal = document.getElementById('capture-val');
const diskVal = document.getElementById('disk-val');
const fileSizeVal = document.getElementById('file-size-val');
const bufferVal = document.getElementById('buffer-val');
const countdownVal = document.getElementById('countdown-val');
const fpsVal = document.getElementById('fps-val');
const bitrateVal = document.getElementById('bitrate-val');
const dropVal = document.getElementById('drop-val');
const sourceVal = document.getElementById('source-val');
const criticalMsg = document.getElementById('critical-msg');

// New UI Elements
const bufferDelayInput = document.getElementById('buffer-delay');
const obsIpInput = document.getElementById('obs-ip');
const obsPortInput = document.getElementById('obs-port');
const obsPasswordInput = document.getElementById('obs-password');
const testObsBtn = document.getElementById('test-obs-btn');
const obsToggleBtn = document.getElementById('obs-toggle-btn');
const obsStatusDot = document.getElementById('obs-status-dot');
const obsStatusText = document.getElementById('obs-status-text');
const currentPathInput = document.getElementById('current-path');
const copyPathBtn = document.getElementById('copy-path-btn');
const panicBtn = document.getElementById('panic-btn');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeModal = document.getElementById('close-modal');
const basePathInput = document.getElementById('base-path');
const selectPathBtn = document.getElementById('select-path-btn');

const togglePasswordBtn = document.getElementById('toggle-password-btn');

// Licensing Elements
const licensingPanel = document.getElementById('licensing-panel');
const licenseBadge = document.getElementById('license-badge');
const trialDaysText = document.getElementById('trial-days');
const displayHwidInput = document.getElementById('display-hwid');
const copyHwidBtn = document.getElementById('copy-hwid-btn');
const licenseInput = document.getElementById('license-input');
const activateBtn = document.getElementById('activate-btn');
const licenseMsg = document.getElementById('license-msg');

let currentDevice = null;
let isRecording = false;
let startTime = null;
let timerInterval = null;
let isOBSActive = false;
let obsIntegrationEnabled = localStorage.getItem('obs-enabled') !== 'false';
let globalLicenseStatus = { licensed: false, trialExpired: false };

// Load persisted settings immediately
obsIpInput.value = localStorage.getItem('obs-ip') || '127.0.0.1';
obsPortInput.value = localStorage.getItem('obs-port') || '4455';
obsPasswordInput.value = localStorage.getItem('obs-password') || '';
basePathInput.value = localStorage.getItem('base-path') || 'E:\\RECORDINGS';
ipcRenderer.send('update-base-path', basePathInput.value);

// Licensing Logic
async function updateLicenseUI(status) {
    globalLicenseStatus = status;
    displayHwidInput.value = status.hwId;

    if (status.licensed) {
        licensingPanel.style.display = 'none';
        licenseBadge.style.background = 'rgba(34, 197, 94, 0.1)';
        licenseBadge.style.color = 'var(--accent-green)';
        licenseBadge.innerText = 'PRO LICENSE ACTIVE';
        actionBtn.disabled = !currentDevice;
    } else {
        licensingPanel.style.display = 'grid';
        trialDaysText.innerText = status.trialDaysLeft;
        
        if (status.trialExpired) {
            licenseBadge.innerText = 'TRIAL EXPIRED';
            actionBtn.disabled = true;
            actionBtn.innerText = 'License Required';
        } else {
            actionBtn.disabled = !currentDevice;
        }
    }
}

ipcRenderer.on('license-status', (event, status) => {
    updateLicenseUI(status);
});

activateBtn.addEventListener('click', async () => {
    const key = licenseInput.value.trim();
    if (!key) return;

    activateBtn.disabled = true;
    activateBtn.innerText = 'Verifying...';

    const result = await ipcRenderer.invoke('submit-license', key);
    
    if (result.success) {
        licenseMsg.innerText = 'Success! Application Unlocked.';
        licenseMsg.style.color = 'var(--accent-green)';
        updateLicenseUI(result.status);
    } else {
        licenseMsg.innerText = 'Invalid Key. Please check and try again.';
        licenseMsg.style.color = 'var(--accent-red)';
        activateBtn.disabled = false;
        activateBtn.innerText = 'Activate Now';
    }
});

copyHwidBtn.addEventListener('click', () => {
    clipboard.writeText(displayHwidInput.value);
    copyHwidBtn.innerText = 'Copied!';
    setTimeout(() => { copyHwidBtn.innerText = 'Copy'; }, 2000);
});

// Save settings helper
function saveSettings() {
    localStorage.setItem('obs-ip', obsIpInput.value);
    localStorage.setItem('obs-port', obsPortInput.value);
    localStorage.setItem('obs-password', obsPasswordInput.value);
    localStorage.setItem('base-path', basePathInput.value);
    ipcRenderer.send('update-base-path', basePathInput.value);
}

// Auto-save on change
[obsIpInput, obsPortInput, obsPasswordInput, basePathInput].forEach(el => {
    el.addEventListener('input', saveSettings);
});

function updateObsToggle() {
    if (obsIntegrationEnabled) {
        obsToggleBtn.innerText = 'Enabled';
        obsToggleBtn.style.background = 'var(--accent-green)';
        obsIpInput.disabled = false;
        obsPortInput.disabled = false;
        obsPasswordInput.disabled = false;
        testObsBtn.disabled = false;
    } else {
        obsToggleBtn.innerText = 'Disabled';
        obsToggleBtn.style.background = '#334155';
        obsIpInput.disabled = true;
        obsPortInput.disabled = true;
        obsPasswordInput.disabled = true;
        testObsBtn.disabled = true;
        obsStatusDot.className = 'dot';
        obsStatusText.innerText = 'OFFLINE';
        obsStatusText.style.color = 'var(--text-main)';
        isOBSActive = false;
        updatePanicState();
    }
    localStorage.setItem('obs-enabled', obsIntegrationEnabled);
}

obsToggleBtn.addEventListener('click', () => {
    obsIntegrationEnabled = !obsIntegrationEnabled;
    updateObsToggle();
});

// initialize
updateObsToggle();

// Select Path Button
selectPathBtn.addEventListener('click', async () => {
    const newPath = await ipcRenderer.invoke('select-folder');
    if (newPath) {
        basePathInput.value = newPath;
        saveSettings();
    }
});

// Password Toggle
togglePasswordBtn.addEventListener('click', () => {
    if (obsPasswordInput.type === 'password') {
        obsPasswordInput.type = 'text';
        togglePasswordBtn.innerText = 'Hide';
    } else {
        obsPasswordInput.type = 'password';
        togglePasswordBtn.innerText = 'Show';
    }
});

function updateTimer() {
    if (!startTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(elapsedSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsedSeconds % 60).toString().padStart(2, '0');
    
    bufferVal.innerText = `${h}:${m}:${s}`;
    
    const delayTarget = parseInt(bufferDelayInput.value) || 600;

    if (elapsedSeconds < delayTarget) {
        const remaining = delayTarget - elapsedSeconds;
        const rm = Math.floor(remaining / 60);
        const rs = remaining % 60;
        countdownVal.innerText = `Streaming ready in ${rm}m ${rs}s`;
        countdownVal.style.color = 'var(--accent-yellow)';
    } else {
        countdownVal.innerText = 'READY TO STREAM';
        countdownVal.style.color = 'var(--accent-green)';
        countdownVal.style.fontWeight = 'bold';
    }
}

// Hardware Status
ipcRenderer.on('hw-status', (event, status) => {
    if (status.connected) {
        hwDot.className = 'dot active';
        hwText.innerText = 'ATEM Connected';
        currentDevice = status.deviceName;
        sourceVal.innerText = currentDevice;
        if (!isRecording) actionBtn.disabled = false;
    } else {
        hwDot.className = 'dot';
        hwText.innerText = 'Searching hardware...';
        currentDevice = null;
        sourceVal.innerText = 'None';
        if (!isRecording) actionBtn.disabled = true;
    }
});

// Telemetry Updates
ipcRenderer.on('telemetry-update', (event, data) => {
    diskVal.innerText = `${data.disk.freeGB} GB Free`;
    diskVal.style.color = data.disk.status === 'critical' ? 'var(--accent-red)' : 
                          data.disk.status === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-blue)';
    
    fileSizeVal.innerText = `File size: ${data.fileSize} MB`;
});

// FFmpeg Stats
ipcRenderer.on('ffmpeg-stats', (event, stats) => {
    fpsVal.innerText = `${stats.fps} FPS`;
    bitrateVal.innerText = stats.bitrate;
    dropVal.innerText = stats.drop;
    
    if (parseFloat(stats.fps) < 50 && isRecording) {
        fpsVal.style.color = 'var(--accent-yellow)';
    } else {
        fpsVal.style.color = 'var(--accent-blue)';
    }
});

// Critical Errors
ipcRenderer.on('critical-error', (event, msg) => {
    criticalMsg.innerText = msg;
    criticalMsg.style.display = 'block';
});

// OBS Connection Test
testObsBtn.addEventListener('click', async () => {
    testObsBtn.disabled = true;
    testObsBtn.innerText = 'Testing...';
    saveSettings();
    
    const config = {
        ip: obsIpInput.value || '127.0.0.1',
        port: obsPortInput.value || '4455',
        password: obsPasswordInput.value
    };

    const success = await ipcRenderer.invoke('test-obs-connection', config);
    
    if (success) {
        obsStatusDot.className = 'dot active';
        obsStatusText.innerText = 'ACTIVE';
        obsStatusText.style.color = 'var(--accent-green)';
        isOBSActive = true;
    } else {
        obsStatusDot.className = 'dot error';
        obsStatusText.innerText = 'FAILED';
        obsStatusText.style.color = 'var(--accent-red)';
        isOBSActive = false;
    }
    
    updatePanicState();
    testObsBtn.disabled = false;
    testObsBtn.innerText = 'Test Connection';
});

// Copy Path
copyPathBtn.addEventListener('click', () => {
    if (currentPathInput.value) {
        clipboard.writeText(currentPathInput.value);
        copyPathBtn.innerText = 'Copied!';
        setTimeout(() => { copyPathBtn.innerText = 'Copy'; }, 2000);
    }
});

// Panic Button
panicBtn.addEventListener('click', () => {
    ipcRenderer.send('trigger-panic');
    panicBtn.innerText = 'PANIC SENT!';
    panicBtn.style.background = 'white';
    panicBtn.style.color = 'var(--accent-red)';
    setTimeout(() => {
        panicBtn.innerText = 'EMERGENCY PANIC (CUT TO SAFE)';
        panicBtn.style.background = 'var(--accent-red)';
        panicBtn.style.color = 'white';
    }, 3000);
});

// Help Modal
helpBtn.addEventListener('click', () => { helpModal.style.display = 'flex'; });
closeModal.addEventListener('click', () => { helpModal.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target == helpModal) helpModal.style.display = 'none'; });

function updatePanicState() {
    panicBtn.disabled = !(isRecording && isOBSActive);
}

// Action Button Control
actionBtn.addEventListener('click', () => {
    if (!isRecording) {
        if (currentDevice) {
            saveSettings();
            const obsConfig = {
                enabled: obsIntegrationEnabled,
                ip: obsIpInput.value || '127.0.0.1',
                port: obsPortInput.value || '4455',
                password: obsPasswordInput.value
            };

            ipcRenderer.send('start-buffering', {
                deviceName: currentDevice,
                bufferDelay: parseInt(bufferDelayInput.value) || 600,
                obsConfig
            });
            
            isRecording = true;
            actionBtn.innerText = 'Stop Buffering';
            actionBtn.className = 'stop';
            captureVal.innerText = 'Buffering...';
            captureVal.style.color = 'var(--accent-green)';
            criticalMsg.style.display = 'none';
            bufferDelayInput.disabled = true;
            updatePanicState();
        }
    } else {
        ipcRenderer.send('stop-buffering');
        isRecording = false;
        actionBtn.innerText = 'Start Buffering';
        actionBtn.className = 'start';
        captureVal.innerText = 'Idle';
        captureVal.style.color = 'var(--accent-blue)';
        bufferDelayInput.disabled = false;
        updatePanicState();
    }
});

ipcRenderer.on('capture-started', (event, data) => {
    console.log('Capture started at:', data.path);
    currentPathInput.value = data.path;
    startTime = data.startTime;
    timerInterval = setInterval(updateTimer, 1000);
    updatePanicState();
});

ipcRenderer.on('capture-stopped', (event, code) => {
    isRecording = false;
    startTime = null;
    clearInterval(timerInterval);
    actionBtn.innerText = 'Start Buffering';
    actionBtn.className = 'start';
    captureVal.innerText = 'Idle';
    captureVal.style.color = 'var(--accent-blue)';
    fpsVal.innerText = '0 FPS';
    bufferVal.innerText = '00:00:00';
    countdownVal.innerText = 'Buffer Cleared';
    countdownVal.style.color = 'var(--text-dim)';
    currentPathInput.value = '';
    bufferDelayInput.disabled = false;
    updatePanicState();
});

