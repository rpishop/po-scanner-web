/* ═══════════════════════════════════════════
   PDF Report Generator — jsPDF
   File name = PO Number
   ═══════════════════════════════════════════ */

const PdfGenerator = {
  async generate(po, products, stats) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentW = pageW - 2 * margin;
    let y = margin;

    // ── Header ──
    doc.setFillColor(26, 35, 126);
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PO Scanner Report', margin, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`PO Number: ${po.poNumber}`, margin, 23);
    doc.text(`File: ${po.fileName}  |  Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, margin, 30);
    y = 45;

    // ── Summary Boxes ──
    doc.setTextColor(0, 0, 0);
    const boxes = [
      { label: 'Complete', value: stats.complete, color: [34, 197, 94] },
      { label: 'Short', value: stats.short, color: [245, 158, 11] },
      { label: 'Pending', value: stats.pending, color: [100, 116, 139] }
    ];
    const boxW = (contentW - 10) / 3;
    boxes.forEach((box, i) => {
      const bx = margin + i * (boxW + 5);
      doc.setFillColor(...box.color);
      doc.setGlobalAlpha && doc.setGlobalAlpha(0.12);
      doc.roundedRect(bx, y, boxW, 22, 3, 3, 'F');
      doc.setGlobalAlpha && doc.setGlobalAlpha(1.0); // Reset transparency
      doc.setFillColor(...box.color);
      doc.roundedRect(bx, y, boxW, 22, 3, 3, 'S');
      doc.setTextColor(...box.color);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(box.value.toString(), bx + 6, y + 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(box.label, bx + 6, y + 17);
    });
    y += 30;

    // ── Qty Summary ──
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Total Items: ${stats.total}  |  Expected Qty: ${stats.totalExpectedQty}  |  Scanned Qty: ${stats.totalScannedQty}`, margin, y);
    y += 10;

    // ── Product Table ──
    const tableData = products.map((p, i) => {
      const status = DB.getProductStatus(p);
      const statusLabel = status === 'complete' ? 'Complete' : status === 'short' ? 'Short' : 'Pending';
      return [i + 1, p.asin, p.title, p.expectedQty, p.scannedQty, statusLabel];
    });

    doc.autoTable({
      startY: y,
      head: [['#', 'ASIN', 'Title', 'Expected', 'Scanned', 'Status']],
      body: tableData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 25, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const val = data.cell.raw;
          if (val === 'Complete') data.cell.styles.textColor = [34, 197, 94];
          else if (val === 'Short') data.cell.styles.textColor = [245, 158, 11];
          else data.cell.styles.textColor = [100, 116, 139];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [245, 245, 250] }
    });

    // Save with PO number as filename
    doc.save(`${po.poNumber}.pdf`);
  }
};
