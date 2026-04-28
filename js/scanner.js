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
      fps: 20, // Increased FPS for faster scanning
      qrbox: { width: 300, height: 150 }, // Wider box for 1D barcodes
      aspectRatio: 1.0,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.UPC_A
      ],
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
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
