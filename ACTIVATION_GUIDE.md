# ATEM Delayed Streamer - Activation & Licensing Guide

This guide describes how to manage the licensing system, generate keys for customers, and how the activation process works.

## 1. How to Generate a License Key (Admin Only)

The application uses hardware-locked licensing. When a customer wants to purchase a license, they must provide you with their **Hardware ID** (found in the app's header).

### Steps to Generate:
1.  Open a terminal in the project directory.
2.  Run the generator script:
    ```powershell
    node generate_key.js
    ```
3.  Paste the **Hardware ID** provided by the customer.
4.  The script will output a key in the format: `ATEM-XXXX-XXXX-XXXX`.
5.  Send this key to the customer.

**CRITICAL:** Never include `generate_key.js` in the final distribution build for customers.

---

## 2. Customer Activation Process

1.  **First Launch:** The app starts in a **7-Day Trial Mode**. The trial start date is securely encrypted in the system's Credential Manager.
2.  **Trial Expiry:** After 7 days of elapsed time (verified via internet time), the "Start Buffering" button will be disabled, and a "License Required" message will appear.
3.  **Activation:**
    *   The customer opens the **Licensing Panel** in the app.
    *   They paste the `ATEM-XXXX-XXXX-XXXX` key you provided.
    *   Clicking **"Activate Now"** will permanently unlock the software on that specific machine.

---

## 3. Technical Security Details

*   **Master Salt:** Both `licensing.js` and `generate_key.js` share a secret `MASTER_SALT`. This salt is used to hash the Hardware ID into a license key.
*   **Hardware ID:** Generated using `node-machine-id`, which targets unique CPU/Motherboard/OS identifiers to prevent randomization or spoofing.
*   **Time Verification:** The app polls `worldtimeapi.org` to check the current date. If the machine is offline, it falls back to local time but flags it as a security risk in the console.
*   **Secure Storage:** The license key and trial start date are stored using **`keytar`**, which utilizes the **Windows Credential Manager** or **macOS Keychain**, making it difficult for users to find or reset the trial by deleting app folders.

---

## 4. Re-Linking Dependencies
If you move the project or clear `node_modules`, ensure you re-link the native security libraries:
```powershell
npm install node-machine-id keytar axios
```
