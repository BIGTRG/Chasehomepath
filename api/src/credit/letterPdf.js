import PDFDocument from 'pdfkit';

/**
 * Render a signed letter to a US Letter PDF. Plain, printable, one column; the text the
 * member approved is the text on the page. Returns { pdf: Buffer, pages }.
 */
export function renderLetterPdf({ body, signedName, signedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 }, info: { Title: 'Dispute letter', Author: signedName ?? '' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    let pages = 1;
    doc.on('end', () => resolve({ pdf: Buffer.concat(chunks), pages }));
    doc.on('error', reject);
    doc.font('Times-Roman').fontSize(12).text(body, { lineGap: 3 });
    if (signedName) {
      doc.moveDown(2).text('Signed:').moveDown(0.3).font('Times-Italic').fontSize(16).text(signedName).font('Times-Roman').fontSize(10)
        .text(`Electronically signed ${new Date(signedAt ?? Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}`);
    }
    pages = doc.bufferedPageRange().count;
    doc.end();
  });
}
