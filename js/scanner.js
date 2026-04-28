/* ═══════════════════════════════════════════
   Barcode Scanner — html5-qrcode
   ═══════════════════════════════════════════ */

const BarcodeScanner = {
  scanner: null,
  isRunning: false,
  onScan: null,

  async start(containerId, onScanCallback) {
    this.onScan = onScanCallback;
    this.scanner = new Html5Qrcode(containerId);

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 150 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    try {
      await this.scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (this.onScan) this.onScan(decodedText);
        },
        () => {} // ignore errors
      );
      this.isRunning = true;
    } catch (err) {
      throw new Error('Camera error: ' + err);
    }
  },

  async stop() {
    if (this.scanner && this.isRunning) {
      try {
        await this.scanner.stop();
        this.scanner.clear();
      } catch (e) { /* ignore */ }
      this.isRunning = false;
    }
  }
};
