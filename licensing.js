const { machineIdSync } = require('node-machine-id');
const crypto = require('crypto');
const keytar = require('keytar');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVICE_NAME = 'ATEMDelayedStreamer';
const MASTER_SALT = 'ATEM_SECURITY_2026_PRO_NODE'; // Internal Secret

class Licensing {
    constructor() {
        this.hwId = machineIdSync();
        this.isLicensed = false;
        this.trialExpired = false;
        this.trialDaysLeft = 7;
    }

    async checkStatus() {
        // 1. Check if valid license exists
        const savedKey = await keytar.getPassword(SERVICE_NAME, 'license_key');
        if (savedKey && this.verifyKey(savedKey)) {
            this.isLicensed = true;
            return { licensed: true };
        }

        // 2. Check Trial
        let trialStart = await keytar.getPassword(SERVICE_NAME, 'trial_start');
        
        if (!trialStart) {
            // First run - set trial start to today
            trialStart = Date.now().toString();
            await keytar.setPassword(SERVICE_NAME, 'trial_start', trialStart);
        }

        const now = await this.getInternetTime();
        const elapsed = now - parseInt(trialStart);
        const daysElapsed = elapsed / (1000 * 60 * 60 * 24);

        if (daysElapsed >= 7) {
            this.trialExpired = true;
            this.trialDaysLeft = 0;
        } else {
            this.trialDaysLeft = Math.max(0, 7 - Math.floor(daysElapsed));
        }

        return {
            licensed: false,
            hwId: this.hwId,
            trialExpired: this.trialExpired,
            trialDaysLeft: this.trialDaysLeft
        };
    }

    verifyKey(licenseKey) {
        // Format: ATEM-XXXX-XXXX-XXXX
        const cleanKey = licenseKey.replace('ATEM-', '').replace(/-/g, '');
        
        // The key is a truncated hash of (HWID + MASTER_SALT)
        const expectedHash = crypto.createHash('sha256')
            .update(this.hwId + MASTER_SALT)
            .digest('hex')
            .toUpperCase();
        
        const expectedKeyPart = expectedHash.substring(0, 12);
        return cleanKey === expectedKeyPart;
    }

    async saveLicense(key) {
        if (this.verifyKey(key)) {
            await keytar.setPassword(SERVICE_NAME, 'license_key', key);
            this.isLicensed = true;
            return true;
        }
        return false;
    }

    async getInternetTime() {
        try {
            const response = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', { timeout: 3000 });
            return new Date(response.data.utc_datetime).getTime();
        } catch (err) {
            console.warn('Could not reach time API, falling back to local time (Security risk)');
            return Date.now();
        }
    }
}

module.exports = new Licensing();
