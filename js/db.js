/* ═══════════════════════════════════════════
   Database Layer — Dexie.js (IndexedDB)
   ═══════════════════════════════════════════ */

const db = new Dexie('POScannerDB');

db.version(2).stores({
  purchaseOrders: '++id, poNumber, fileName, importDate, status',
  products: '++id, poId, asin, [asin+poId]',
  sessions: '++id, poId, isActive'
});

const DB = {
  // ─── Purchase Orders ────────────────────
  async addPO(poNumber, fileName) {
    return await db.purchaseOrders.add({
      poNumber,
      fileName,
      importDate: Date.now(),
      totalItems: 0,
      completedItems: 0,
      status: 'in_progress'
    });
  },

  async getPO(id) {
    return await db.purchaseOrders.get(Number(id));
  },

  async getAllPOs() {
    return await db.purchaseOrders.orderBy('importDate').reverse().toArray();
  },

  async updatePOProgress(poId) {
    const id = Number(poId);
    const products = await db.products.where('poId').equals(id).toArray();
    const total = products.length;
    const completed = products.filter(p => p.scannedQty === p.expectedQty).length;
    const allDone = products.every(p => p.scannedQty === p.expectedQty);

    await db.purchaseOrders.update(id, {
      totalItems: total,
      completedItems: completed,
      status: allDone && total > 0 ? 'completed' : 'in_progress'
    });
  },

  async deletePO(poId) {
    const id = Number(poId);
    await db.transaction('rw', db.purchaseOrders, db.products, db.sessions, async () => {
      await db.products.where('poId').equals(id).delete();
      await db.sessions.where('poId').equals(id).delete();
      await db.purchaseOrders.delete(id);
    });
  },

  // ─── Products ───────────────────────────
  async addProducts(poId, productList) {
    const id = Number(poId);
    const entities = productList.map(p => ({
      poId: id,
      asin: p.asin,
      title: p.title,
      expectedQty: p.expectedQty,
      scannedQty: 0
    }));
    await db.products.bulkAdd(entities);
    await this.updatePOProgress(id);
  },

  async getProductsByPO(poId) {
    return await db.products.where('poId').equals(Number(poId)).toArray();
  },

  async lookupProduct(asin, poId) {
    return await db.products.where({ asin, poId: Number(poId) }).first();
  },

  async incrementQty(productId) {
    const product = await db.products.get(productId);
    if (!product) return null;
    // Cap at expectedQty — no excess allowed
    if (product.scannedQty >= product.expectedQty) return product;
    const newQty = product.scannedQty + 1;
    await db.products.update(productId, { scannedQty: newQty });
    return await db.products.get(productId);
  },

  async setQty(productId, qty) {
    const product = await db.products.get(productId);
    if (!product) return null;
    // Clamp between 0 and expectedQty
    const clamped = Math.max(0, Math.min(qty, product.expectedQty));
    await db.products.update(productId, { scannedQty: clamped });
    return await db.products.get(productId);
  },

  async getProduct(productId) {
    return await db.products.get(productId);
  },

  // ─── Stats ──────────────────────────────
  async getStats(poId) {
    const id = Number(poId);
    const products = await db.products.where('poId').equals(id).toArray();
    const total = products.length;
    const complete = products.filter(p => p.scannedQty === p.expectedQty).length;
    const short = products.filter(p => p.scannedQty > 0 && p.scannedQty < p.expectedQty).length;
    const pending = products.filter(p => p.scannedQty === 0).length;
    const totalExpectedQty = products.reduce((s, p) => s + p.expectedQty, 0);
    const totalScannedQty = products.reduce((s, p) => s + p.scannedQty, 0);

    return { total, complete, short, pending, totalExpectedQty, totalScannedQty };
  },

  getProductStatus(product) {
    if (product.scannedQty === 0) return 'pending';
    if (product.scannedQty < product.expectedQty) return 'short';
    return 'complete';
  },

  // ─── Sessions ───────────────────────────
  async getOrCreateSession(poId) {
    const id = Number(poId);
    let session = await db.sessions.where({ poId: id, isActive: 1 }).first();
    if (session) {
      await db.sessions.update(session.id, { lastUpdated: Date.now() });
      return session;
    }
    const sessionId = await db.sessions.add({ poId: id, startTime: Date.now(), lastUpdated: Date.now(), isActive: 1 });
    return await db.sessions.get(sessionId);
  },

  async endSession(sessionId) {
    await db.sessions.update(sessionId, { isActive: 0, lastUpdated: Date.now() });
  },

  async hasActiveSession(poId) {
    const s = await db.sessions.where({ poId: Number(poId), isActive: 1 }).first();
    return !!s;
  },

  // ─── Sync / Merge ──────────────────────
  async mergeProductData(poId, remoteData) {
    const id = Number(poId);
    const localProducts = await db.products.where('poId').equals(id).toArray();
    
    for (const remoteItem of remoteData) {
      const local = localProducts.find(p => p.asin === remoteItem.asin);
      if (local) {
        // Merge strategy: Sum the quantities, but cap at expectedQty
        const newQty = Math.min(local.expectedQty, local.scannedQty + remoteItem.scannedQty);
        await db.products.update(local.id, { scannedQty: newQty });
      }
    }
    await this.updatePOProgress(id);
  }
};
