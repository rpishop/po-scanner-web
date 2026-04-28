/* ═══════════════════════════════════════════
   App Controller — View Routing + Logic
   ═══════════════════════════════════════════ */

const App = {
  currentView: 'home',
  currentPoId: null,
  scanCooldown: 1500,
  lastScanTime: 0,
  lastScanAsin: '',
  lastScannedProduct: null,

  init() {
    this.showView('home');
    this.loadHomeList();
    document.getElementById('fabUpload').addEventListener('click', () => this.showUploadModal());
  },

  // ─── View Navigation ────────────────────
  showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + name);
    if (view) {
      view.classList.add('active');
      this.currentView = name;
    }
  },

  // ─── Toast ──────────────────────────────
  toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  // ════════════════════════════════════════
  //  HOME VIEW
  // ════════════════════════════════════════
  async loadHomeList() {
    const poList = await DB.getAllPOs();
    const container = document.getElementById('poList');
    const empty = document.getElementById('emptyState');

    if (poList.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }

    empty.style.display = 'none';
    container.innerHTML = '';

    for (const po of poList) {
      await DB.updatePOProgress(po.id);
      const updated = await DB.getPO(po.id);
      const progress = updated.totalItems > 0 ? Math.round((updated.completedItems * 100) / updated.totalItems) : 0;
      const date = new Date(updated.importDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const card = document.createElement('div');
      card.className = 'card po-card';
      card.style.animationDelay = `${poList.indexOf(po) * 0.05}s`;
      card.innerHTML = `
        <div class="po-header">
          <div>
            <div class="po-name">${updated.fileName}</div>
            <div class="po-number">PO# ${updated.poNumber}</div>
          </div>
          <span class="chip ${updated.status === 'completed' ? 'chip-complete' : 'chip-short'}">
            ${updated.status === 'completed' ? '✅ Complete' : '🔄 In Progress'}
          </span>
        </div>
        <div class="po-date">📅 ${date}</div>
        <div class="po-footer">
          <span class="po-progress-text">${updated.completedItems} / ${updated.totalItems} items — ${progress}%</span>
          <button class="btn-delete" data-id="${updated.id}">🗑️ Delete</button>
        </div>
        <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${progress}%"></div></div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete')) return;
        this.openDetail(updated.id);
      });
      card.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDelete(updated.id, updated.fileName);
      });

      container.appendChild(card);
    }
  },

  showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('inputPoNumber').value = '';
    document.getElementById('inputFile').value = '';
    document.getElementById('inputPoNumber').focus();
  },

  closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
  },

  async handleUpload() {
    const poNumber = document.getElementById('inputPoNumber').value.trim();
    const fileInput = document.getElementById('inputFile');
    const file = fileInput.files[0];

    if (!poNumber) { this.toast('⚠️ Enter a PO number'); return; }
    if (!file) { this.toast('⚠️ Select an Excel file'); return; }

    this.closeUploadModal();
    document.getElementById('loadingOverlay').classList.add('active');

    try {
      const products = await ExcelReader.readFile(file);
      const poId = await DB.addPO(poNumber, file.name.replace(/\.[^.]+$/, ''));
      console.log('Imported PO with ID:', poId);
      await DB.addProducts(poId, products);
      document.getElementById('loadingOverlay').classList.remove('active');
      this.toast(`✅ Imported ${products.length} products`);
      this.loadHomeList();
      this.openDetail(poId);
    } catch (err) {
      document.getElementById('loadingOverlay').classList.remove('active');
      this.toast('❌ ' + err.message);
    }
  },

  confirmDelete(poId, name) {
    if (confirm(`Delete "${name}"?\nAll scan data will be lost.`)) {
      DB.deletePO(poId).then(() => {
        this.toast('🗑️ Deleted');
        this.loadHomeList();
      });
    }
  },

  // ════════════════════════════════════════
  //  PO DETAIL VIEW
  // ════════════════════════════════════════
  async openDetail(poId) {
    const id = Number(poId);
    console.log('Opening Detail for PO ID:', id);
    this.currentPoId = id;
    this.showView('detail');

    const po = await DB.getPO(id);
    const stats = await DB.getStats(id);
    const products = await DB.getProductsByPO(id);
    const hasSession = await DB.hasActiveSession(id);

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
      else console.warn(`Element not found: ${id}`);
    };

    setText('detailTitle', po.fileName);
    setText('detailPoNumber', `PO# ${po.poNumber}`);
    setText('detailComplete', stats.complete);
    setText('detailShort', stats.short);
    setText('detailPending', stats.pending);
    
    const btnScan = document.getElementById('btnStartScan');
    if (btnScan) btnScan.textContent = hasSession ? '▶️ Resume Scanning' : '📷 Start Scanning';

    this.renderProductList(products, 'detailProductList');
    this._detailProducts = products;

    const searchInput = document.getElementById('detailSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = q ? this._detailProducts.filter(p =>
          p.asin.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
        ) : this._detailProducts;
        this.renderProductList(filtered, 'detailProductList');
      };
    }
  },

  renderProductList(products, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    products.forEach(p => {
      const status = DB.getProductStatus(p);
      const chipClass = status === 'complete' ? 'chip-complete' : status === 'short' ? 'chip-short' : 'chip-pending';
      const label = status === 'complete' ? 'Complete' : status === 'short' ? 'Short' : 'Pending';
      const item = document.createElement('div');
      item.className = 'product-item';
      item.innerHTML = `
        <div class="product-info">
          <div class="product-asin">${p.asin}</div>
          <div class="product-title">${p.title}</div>
          <div class="product-qty">${p.scannedQty} / ${p.expectedQty}</div>
        </div>
        <span class="chip ${chipClass}">${label}</span>
      `;
      el.appendChild(item);
    });
  },

  // ════════════════════════════════════════
  //  SCANNER VIEW
  // ════════════════════════════════════════
  async openScanner() {
    if (!this.currentPoId) return;
    this.showView('scanner');
    this.lastScanAsin = '';
    this.lastScanTime = 0;
    this.lastScannedProduct = null;

    document.getElementById('scanResultCard').style.display = 'none';

    const session = await DB.getOrCreateSession(this.currentPoId);
    await this.updateScanProgress();

    try {
      await BarcodeScanner.start('scannerVideo', (code) => this.handleScan(code));
    } catch (err) {
      this.toast('❌ ' + err);
    }
  },

  async closeScanner() {
    await BarcodeScanner.stop();
    this.showView('detail');
    this.openDetail(this.currentPoId);
  },

  async handleScan(barcode) {
    const now = Date.now();
    if (barcode === this.lastScanAsin && now - this.lastScanTime < this.scanCooldown) return;
    this.lastScanAsin = barcode;
    this.lastScanTime = now;

    const product = await DB.lookupProduct(barcode, this.currentPoId);
    const card = document.getElementById('scanResultCard');

    if (product) {
      if (product.scannedQty >= product.expectedQty) {
        Sound.maxReached();
        card.className = 'scan-result-card error';
        card.style.display = 'block';
        card.innerHTML = `
          <div class="product-asin">${product.asin}</div>
          <div class="product-title">${product.title}</div>
          <div class="product-qty" style="color:var(--status-short)">Already complete: ${product.scannedQty} / ${product.expectedQty}</div>
          <span class="chip chip-complete">Complete</span>
        `;
        return;
      }

      const updated = await DB.incrementQty(product.id);
      Sound.success();
      await DB.updatePOProgress(this.currentPoId);
      this.lastScannedProduct = updated;
      this.showScanResult(updated);
      await this.updateScanProgress();
    } else {
      Sound.error();
      card.className = 'scan-result-card error';
      card.style.display = 'block';
      card.innerHTML = `
        <div class="product-asin" style="color:var(--status-error)">${barcode}</div>
        <div class="product-title" style="color:var(--status-error)">❌ Not found in this PO</div>
      `;
    }
  },

  showScanResult(product) {
    const status = DB.getProductStatus(product);
    const card = document.getElementById('scanResultCard');
    card.className = 'scan-result-card success';
    card.style.display = 'block';

    const chipClass = status === 'complete' ? 'chip-complete' : 'chip-short';
    const label = status === 'complete' ? '✅ Complete' : '⚠️ Short';

    card.innerHTML = `
      <div class="product-asin">${product.asin}</div>
      <div class="product-title">${product.title}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
        <div class="qty-adjuster">
          <button class="btn-icon" onclick="App.adjustQty(-1)">−</button>
          <span class="qty-display">${product.scannedQty} / ${product.expectedQty}</span>
          <button class="btn-icon" onclick="App.adjustQty(1)">+</button>
        </div>
        <span class="chip ${chipClass}">${label}</span>
      </div>
    `;
  },

  async adjustQty(delta) {
    if (!this.lastScannedProduct) return;
    const current = await DB.getProduct(this.lastScannedProduct.id);
    if (!current) return;
    const newQty = current.scannedQty + delta;
    const updated = await DB.setQty(current.id, newQty);
    this.lastScannedProduct = updated;
    this.showScanResult(updated);
    await DB.updatePOProgress(this.currentPoId);
    await this.updateScanProgress();
  },

  async updateScanProgress() {
    const stats = await DB.getStats(this.currentPoId);
    const scanned = stats.complete + stats.short;
    document.getElementById('scanProgress').textContent = `${scanned} / ${stats.total} scanned`;
  },

  showManualEntry() {
    const asin = prompt('Enter ASIN:');
    if (asin && asin.trim()) {
      this.handleScan(asin.trim());
    }
  },

  // ════════════════════════════════════════
  //  SUMMARY VIEW
  // ════════════════════════════════════════
  async openSummary() {
    if (!this.currentPoId) return;
    this.showView('summary');

    const po = await DB.getPO(this.currentPoId);
    const stats = await DB.getStats(this.currentPoId);
    const products = await DB.getProductsByPO(this.currentPoId);
    const progress = stats.total > 0 ? Math.round((stats.complete * 100) / stats.total) : 0;
    const circumference = 2 * Math.PI * 54;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('summaryTitle', po.fileName);
    setText('summaryPoNumber', `PO# ${po.poNumber}`);
    setText('summaryPercent', progress + '%');
    setText('summaryLabel', `${stats.complete} of ${stats.total} complete`);
    setText('summaryComplete', stats.complete);
    setText('summaryShort', stats.short);
    setText('summaryPending', stats.pending);
    setText('summaryExpectedQty', stats.totalExpectedQty);
    setText('summaryScannedQty', stats.totalScannedQty);

    const circle = document.getElementById('progressCircle');
    if (circle) {
      circle.style.strokeDasharray = circumference;
      circle.style.strokeDashoffset = circumference - (progress / 100) * circumference;
    }

    this.renderProductList(products, 'summaryProductList');
    this._summaryData = { po, products, stats };
  },

  async downloadPdf() {
    const { po, products, stats } = this._summaryData;
    this.toast('📄 Generating PDF...');
    try {
      await PdfGenerator.generate(po, products, stats);
      this.toast('✅ PDF downloaded!');
    } catch (e) {
      this.toast('❌ PDF error: ' + e.message);
    }
  },

  downloadExcel() {
    const { po, products, stats } = this._summaryData;
    this.toast('📊 Generating Excel...');
    try {
      ExcelGenerator.generate(po, products, stats);
      this.toast('✅ Excel downloaded!');
    } catch (e) {
      this.toast('❌ Excel error: ' + e.message);
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
