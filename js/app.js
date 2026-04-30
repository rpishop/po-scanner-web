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
    setText('detailMatched', stats.complete);
    setText('detailShort', stats.short);
    setText('detailPending', stats.pending);
    
    const btnScan = document.getElementById('btnStartScan');
    if (btnScan) btnScan.textContent = hasSession ? '▶️ Resume Scanning' : '📷 Start Scanning';

    this._statusFilter = null; // Reset filter on new PO
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active')); // Clear UI highlights
    this.renderProductList(products, 'detailProductList');
    
    const searchInput = document.getElementById('detailSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = (e) => {
        this.applyFilters(e.target.value);
      };
    }
    this._detailProducts = products;
  },

  setStatusFilter(status) {
    // Toggle logic: if same status clicked, clear filter
    if (this._statusFilter === status) {
      this._statusFilter = null;
    } else {
      this._statusFilter = status;
    }

    // Update UI active state
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    if (this._statusFilter) {
      const idMap = { 'complete': 'statCardMatched', 'short': 'statCardShort', 'pending': 'statCardPending' };
      document.getElementById(idMap[status])?.classList.add('active');
    }

    const q = document.getElementById('detailSearch')?.value || '';
    this.applyFilters(q);
  },

  applyFilters(query) {
    const q = query.toLowerCase();
    const filtered = this._detailProducts.filter(p => {
      // 1. Text filter
      const matchesSearch = p.asin.toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
      
      // 2. Status filter
      if (!this._statusFilter) return matchesSearch;
      const status = DB.getProductStatus(p);
      return matchesSearch && status === this._statusFilter;
    });

    this.renderProductList(filtered, 'detailProductList');
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
      // Use touchstart for faster response on mobile
      item.addEventListener('click', () => this.showManualEntry(p.id));
      item.innerHTML = `
        <div class="product-info">
          <div class="product-asin">${p.asin}</div>
          <div class="product-title">${p.title}</div>
          <div class="product-qty">
            <span style="font-weight:700; color:var(--text-primary)">${p.scannedQty}</span> / ${p.expectedQty}
          </div>
        </div>
        <span class="chip ${chipClass}">${label}</span>
      `;
      el.appendChild(item);
    });
  },

  // ════════════════════════════════════════
  //  MANUAL ENTRY
  // ════════════════════════════════════════
  async showManualEntry(productId) {
    const product = await DB.db.products.get(Number(productId));
    if (!product) {
      // If called from scanner with ASIN instead of ID
      const results = await DB.db.products.where('asin').equals(productId).toArray();
      if (results.length > 0) this._editingProduct = results[0];
      else return;
    } else {
      this._editingProduct = product;
    }

    const p = this._editingProduct;
    document.getElementById('manualEntryTitle').textContent = 'Edit Quantity';
    document.getElementById('manualEntryAsin').textContent = p.asin;
    document.getElementById('manualQtyInput').value = p.scannedQty;
    document.getElementById('manualEntryModal').classList.add('active');
    
    // Auto-select input for quick typing
    setTimeout(() => {
      const input = document.getElementById('manualQtyInput');
      input.focus();
      input.select();
    }, 100);
  },

  adjustManualQty(action) {
    const input = document.getElementById('manualQtyInput');
    if (action === 'reset') input.value = 0;
    if (action === 'full') input.value = this._editingProduct.expectedQty;
  },

  async saveManualEntry() {
    const newQty = parseInt(document.getElementById('manualQtyInput').value) || 0;
    const product = this._editingProduct;
    
    // Cap at expected
    const finalQty = Math.min(product.expectedQty, Math.max(0, newQty));
    
    await DB.db.products.update(product.id, { scannedQty: finalQty });
    await DB.updatePOProgress(product.poId);
    
    this.closeManualEntry();
    this.toast('✅ Quantity updated');
    
    // Refresh current view
    if (this.currentView === 'detail') this.openDetail(product.poId);
    if (this.currentView === 'summary') this.openSummary();
    if (this.currentView === 'scanner' && typeof Scanner !== 'undefined') {
        // Just refresh the result card if in scanner
        const updated = await DB.db.products.get(product.id);
        if (typeof this.updateScannerStatus === 'function') this.updateScannerStatus(updated);
    }
  },

  closeManualEntry() {
    document.getElementById('manualEntryModal').classList.remove('active');
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:8px">
        <div style="display:flex;align-items:center;gap:4px;flex:1">
           <button class="btn-secondary" style="padding:6px 6px;font-size:0.7rem;min-width:32px" onclick="App.adjustScannerQty('minus')">−</button>
           <button class="btn-secondary" style="padding:6px 6px;font-size:0.7rem" onclick="App.adjustScannerQty('reset')">⭕</button>
           <input type="number" id="scannerQtyInput" value="${product.scannedQty}" 
                  style="width:45px; text-align:center; font-weight:800; border-radius:8px; border:1px solid var(--border-glass); background:rgba(255,255,255,0.05); color:white; padding:6px 0"
                  onchange="App.adjustScannerQty('manual')">
           <span style="font-size:0.75rem;color:var(--text-secondary)">/ ${product.expectedQty}</span>
           <button class="btn-secondary" style="padding:6px 6px;font-size:0.7rem" onclick="App.adjustScannerQty('full')">✅</button>
           <button class="btn-secondary" style="padding:6px 6px;font-size:0.7rem;min-width:32px" onclick="App.adjustScannerQty('plus')">+</button>
        </div>
        <span class="chip ${chipClass}">${label}</span>
      </div>
    `;
    this.lastScannedProduct = product;
  },

  async adjustScannerQty(action) {
    if (!this.lastScannedProduct) return;
    const input = document.getElementById('scannerQtyInput');
    const product = this.lastScannedProduct;
    let newQty = product.scannedQty;

    if (action === 'reset') newQty = 0;
    else if (action === 'full') newQty = product.expectedQty;
    else if (action === 'plus') newQty = product.scannedQty + 1;
    else if (action === 'minus') newQty = product.scannedQty - 1;
    else if (action === 'manual') newQty = parseInt(input.value) || 0;

    const finalQty = Math.min(product.expectedQty, Math.max(0, newQty));
    const updated = await DB.setQty(product.id, finalQty);
    
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
  },

  // ════════════════════════════════════════
  //  SYNC / MERGE
  // ════════════════════════════════════════
  async exportProgress() {
    if (!this.currentPoId) return;
    const po = await DB.getPO(this.currentPoId);
    const products = await DB.getProductsByPO(this.currentPoId);
    
    // Only export items with scans to keep file small
    const data = products
      .filter(p => p.scannedQty > 0)
      .map(p => ({ asin: p.asin, scannedQty: p.scannedQty }));

    if (data.length === 0) {
      this.toast('⚠️ No progress to share yet!');
      return;
    }

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_${po.poNumber}_Progress_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast('📤 Progress file exported!');
  },

  async importProgress() {
    if (!this.currentPoId) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const remoteData = JSON.parse(event.target.result);
          if (!Array.isArray(remoteData)) throw new Error('Invalid format');

          document.getElementById('loadingOverlay').classList.add('active');
          await DB.mergeProductData(this.currentPoId, remoteData);
          document.getElementById('loadingOverlay').classList.remove('active');
          
          this.toast('📥 Progress merged successfully!');
          this.openDetail(this.currentPoId); // Refresh view
        } catch (err) {
          document.getElementById('loadingOverlay').classList.remove('active');
          this.toast('❌ Failed to merge: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
