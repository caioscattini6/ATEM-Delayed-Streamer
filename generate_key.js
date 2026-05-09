const crypto = require('crypto');
const readline = require('readline');

const MASTER_SALT = 'ATEM_SECURITY_2026_PRO_NODE'; // Must match licensing.js

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('--- ATEM DELAYED STREAMER LICENSE GENERATOR ---');

rl.question('Enter Customer Hardware ID: ', (hwId) => {
    if (!hwId || hwId.length < 5) {
        console.error('Error: Invalid Hardware ID');
        process.exit(1);
    }

    const hash = crypto.createHash('sha256')
        .update(hwId + MASTER_SALT)
        .digest('hex')
        .toUpperCase();

    const keyPart = hash.substring(0, 12);
    
    // Format into ATEM-XXXX-XXXX-XXXX
    const formattedKey = `ATEM-${keyPart.substring(0, 4)}-${keyPart.substring(4, 8)}-${keyPart.substring(8, 12)}`;

    console.log('\nSUCCESS!');
    console.log(`Generated License Key for ${hwId}:`);
    console.log(`\x1b[32m${formattedKey}\x1b[0m\n`);
    
    rl.close();
});
