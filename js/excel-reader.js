/* ═══════════════════════════════════════════
   Excel Reader — SheetJS
   ═══════════════════════════════════════════ */

const ExcelReader = {
  async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (rows.length < 2) {
            reject(new Error('Excel file has no data rows'));
            return;
          }

          // Find header columns
          const headers = rows[0].map(h => (h || '').toString().trim().toLowerCase());
          let asinCol = -1, titleCol = -1, qtyCol = -1;

          headers.forEach((h, i) => {
            if (h === 'asin') asinCol = i;
            else if (h === 'title') titleCol = i;
            else if (h.includes('accepted') && h.includes('quantity')) qtyCol = i;
          });

          if (asinCol === -1 || titleCol === -1 || qtyCol === -1) {
            reject(new Error(
              `Required columns not found.\nExpected: ASIN, Title, Accepted Quantity\n` +
              `Found: ASIN=${asinCol !== -1}, Title=${titleCol !== -1}, Qty=${qtyCol !== -1}`
            ));
            return;
          }

          // Parse data rows
          const products = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const asin = (row[asinCol] || '').toString().trim();
            const title = (row[titleCol] || '').toString().trim();
            const qty = parseInt(row[qtyCol]) || 0;

            if (asin && title && qty > 0) {
              products.push({ asin, title, expectedQty: qty });
            }
          }

          if (products.length === 0) {
            reject(new Error('No valid products found in Excel file'));
            return;
          }

          resolve(products);
        } catch (err) {
          reject(new Error('Failed to parse Excel: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
};
