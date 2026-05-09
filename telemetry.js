const fs = require('fs');
const path = require('path');
const checkDiskSpace = require('check-disk-space').default;

/**
 * Telemetry Module
 * Handles file system health checks and disk space monitoring
 */
class Telemetry {
  constructor() {
    this.lastFileSize = 0;
    this.stagnantCount = 0;
  }

  /**
   * Checks remaining disk space on a specific path/drive
   * @param {string} directoryPath 
   * @returns {Promise<Object>} { freeGB, status: 'ok'|'warning'|'critical' }
   */
  async checkDisk(directoryPath) {
    try {
      // Ensure drive exists or use root
      const root = path.parse(directoryPath).root || 'C:';
      const diskSpace = await checkDiskSpace(root);
      const freeGB = diskSpace.free / (1024 * 1024 * 1024);
      
      let status = 'ok';
      if (freeGB < 5) status = 'critical';
      else if (freeGB < 20) status = 'warning';

      return { freeGB: freeGB.toFixed(2), status };
    } catch (error) {
      console.error('Disk Check Error:', error);
      return { freeGB: 0, status: 'error' };
    }
  }

  /**
   * Monitors file growth to ensure capture is active
   * @param {string} filePath 
   * @returns {boolean} True if growing, False if stagnant
   */
  checkFileGrowth(filePath) {
    if (!fs.existsSync(filePath)) return false;

    try {
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      if (currentSize === this.lastFileSize && currentSize > 0) {
        this.stagnantCount++;
      } else {
        this.stagnantCount = 0;
      }

      this.lastFileSize = currentSize;

      // If stagnant for 2 consecutive checks (approx 10s if called every 5s)
      return this.stagnantCount < 2;
    } catch (error) {
      console.error('File Growth Check Error:', error);
      return false;
    }
  }

  /**
   * Gets current file size in MB
   * @param {string} filePath 
   * @returns {string}
   */
  getFileSizeMB(filePath) {
    if (!fs.existsSync(filePath)) return '0.00';
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  }
}

module.exports = new Telemetry();
