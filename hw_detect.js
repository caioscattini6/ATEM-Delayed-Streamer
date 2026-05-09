const { exec } = require('child_process');
const os = require('os');

/**
 * HWDetect Module
 * Abstractions for hardware polling on Windows (dshow) and macOS (avfoundation)
 */
class HWDetect {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.deviceList = [];
  }

  /**
   * Polls for connected video devices
   * @returns {Promise<Array>} List of device names
   */
  async pollDevices() {
    return new Promise((resolve) => {
      const command = this.isWindows 
        ? 'ffmpeg -list_devices true -f dshow -i dummy' 
        : 'ffmpeg -list_devices true -f avfoundation -i dummy';

      exec(command, (error, stdout, stderr) => {
        // FFmpeg outputs device list to stderr
        const output = stderr;
        const devices = this.parseDeviceOutput(output);
        this.deviceList = devices;
        resolve(devices);
      });
    });
  }

  /**
   * Parses FFmpeg output to extract device names
   * @param {string} output 
   * @returns {Array}
   */
  parseDeviceOutput(output) {
    const devices = [];
    if (this.isWindows) {
      // Windows dshow parsing
      // Example line: [dshow @ 0000021c608f6140]  "Blackmagic Design" (video)
      const lines = output.split('\n');
      lines.forEach(line => {
        const match = line.match(/\"(.*)\"\s\(video\)/);
        if (match && match[1]) {
          devices.push(match[1]);
        }
      });
    } else {
      // macOS avfoundation parsing
      const lines = output.split('\n');
      let isVideoSection = false;
      lines.forEach(line => {
        if (line.includes('AVFoundation video devices:')) isVideoSection = true;
        if (line.includes('AVFoundation audio devices:')) isVideoSection = false;
        
        if (isVideoSection) {
          const match = line.match(/\[\d+\]\s+(.+)$/);
          if (match && match[1]) devices.push(match[1].trim());
        }
      });
    }
    return devices;
  }

  /**
   * Specifically looks for ATEM identifiers
   * @param {Array} devices 
   * @returns {string|null} The specific device name if found
   */
  findATEM(devices) {
    const atemKeywords = ['Blackmagic', 'ATEM', 'DeckLink', 'Cam Link']; // Broadened for testing
    for (const device of devices) {
      if (atemKeywords.some(keyword => device.toLowerCase().includes(keyword.toLowerCase()))) {
        return device;
      }
    }
    return null;
  }
}

module.exports = new HWDetect();
