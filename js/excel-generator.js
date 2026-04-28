/* ═══════════════════════════════════════════
   Excel Report Generator — SheetJS
   Columns: ASIN, Title, Qty, Status
   File name = PO Number
   ═══════════════════════════════════════════ */

const ExcelGenerator = {
  generate(po, products, stats) {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──
    const summaryData = [
      ['PO Scanner Report'],
      [],
      ['PO Number', po.poNumber],
      ['File Name', po.fileName],
      ['Date', new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
      [],
      ['Total Items', stats.total],
      ['Complete', stats.complete],
      ['Short', stats.short],
      ['Pending', stats.pending],
      [],
      ['Total Expected Qty', stats.totalExpectedQty],
      ['Total Scanned Qty', stats.totalScannedQty],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    // Set column widths
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Products sheet ──
    const header = ['ASIN', 'Title', 'Expected Qty', 'Scanned Qty', 'Status'];
    const rows = products.map(p => {
      const status = DB.getProductStatus(p);
      const statusLabel = status === 'complete' ? 'Complete' : status === 'short' ? 'Short' : 'Pending';
      return [p.asin, p.title, p.expectedQty, p.scannedQty, statusLabel];
    });

    const productData = [header, ...rows];
    const productSheet = XLSX.utils.aoa_to_sheet(productData);
    // Set column widths
    productSheet['!cols'] = [
      { wch: 15 },  // ASIN
      { wch: 60 },  // Title (full width)
      { wch: 14 },  // Expected
      { wch: 14 },  // Scanned
      { wch: 12 }   // Status
    ];
    XLSX.utils.book_append_sheet(wb, productSheet, 'Products');

    // Save with PO number as filename
    XLSX.writeFile(wb, `${po.poNumber}.xlsx`);
  }
};
