import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Global cache for Base64 font data to avoid duplicate fetches
let cachedRegular: string | null = null;
let cachedBold: string | null = null;

// Asynchronous base64 font loader with a 2-second timeout abort controller
const fetchFontBase64 = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Failed to fetch font from ${url}`);
        const buffer = await response.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
};

const buildQuotePDF = async (exportData: any): Promise<jsPDF> => {
    const { items, totals, code, clientData, businessInfo } = exportData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Dynamically fetch and register Manrope Regular & Bold TTF fonts.
    // Falls back gracefully to Helvetica if offline or if the request times out.
    let fontName = 'helvetica';
    try {
        if (!cachedRegular) {
            cachedRegular = await fetchFontBase64('https://cdn.jsdelivr.net/gh/sharanda/manrope@master/fonts/ttf/Manrope-Regular.ttf');
        }
        if (!cachedBold) {
            cachedBold = await fetchFontBase64('https://cdn.jsdelivr.net/gh/sharanda/manrope@master/fonts/ttf/Manrope-Bold.ttf');
        }

        doc.addFileToVFS('Manrope-Regular.ttf', cachedRegular);
        doc.addFont('Manrope-Regular.ttf', 'Manrope', 'normal');

        doc.addFileToVFS('Manrope-Bold.ttf', cachedBold);
        doc.addFont('Manrope-Bold.ttf', 'Manrope', 'bold');

        fontName = 'Manrope';
    } catch (e) {
        console.warn('Could not dynamically load Manrope font, falling back to Helvetica:', e);
        fontName = 'helvetica';
    }

    // 1. Header — banda pastel clara (sin contraste oscuro). Nombre de la
    // empresa centrado, dirección y teléfono centrados debajo, y luego
    // "COTIZACIÓN <número>" sin prefijo SKU (COT-/OPT-/VTA-).
    // El nombre en el reporte SIEMPRE es la abreviatura "HACE SAC", aunque
    // en business_info esté guardada la razón social completa.
    const companyName = 'HACE SAC';
    const companyAddress = (businessInfo?.address || '').trim();
    const companyPhone   = (businessInfo?.phone   || '').trim();
    const quoteNumber = String(code || '').replace(/^(COT|OPT|VTA)-/, '');

    // Formato de fecha pedido: "30 abr, 2026" (es-PE, mes corto en minúsculas,
    // sin punto). Se acepta string ISO o YYYY-MM-DD; si vacío → '---'.
    const formatNiceDate = (input?: string | Date | null): string => {
        if (!input) return '---';
        const d = (input instanceof Date) ? input : new Date(input);
        if (isNaN(d.getTime())) return String(input);
        const day = d.getDate();
        const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month}, ${year}`;
    };
    // Para 'YYYY-MM-DD' que viene del input type="date", evitamos el shift
    // de timezone construyendo la fecha local explícita.
    const parseInputDate = (s?: string | null): Date | null => {
        if (!s) return null;
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    };

    // Banda con fondo pastel. Altura se ajusta para acomodar dirección + teléfono.
    const headerHeight = 56;
    doc.setFillColor(245, 247, 250); // gris pastel claro
    doc.rect(0, 0, pageWidth, headerHeight, 'F');
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.4);
    doc.line(0, headerHeight, pageWidth, headerHeight);

    // Nombre de la empresa.
    doc.setTextColor(45, 55, 72); // gris oscuro suave
    doc.setFontSize(20);
    doc.setFont(fontName, 'bold');
    doc.text(companyName, pageWidth / 2, 16, { align: 'center' });

    // Dirección y teléfono centrados (de business_info).
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(9);
    doc.setFont(fontName, 'normal');
    if (companyAddress) {
        doc.text(companyAddress, pageWidth / 2, 24, { align: 'center' });
    }
    if (companyPhone) {
        doc.text(`TELÉFONO: ${companyPhone}`, pageWidth / 2, 30, { align: 'center' });
    }

    // Subtítulo con número de cotización.
    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFontSize(11);
    doc.setFont(fontName, 'bold');
    doc.text(`COTIZACIÓN ${quoteNumber}`, pageWidth / 2, 44, { align: 'center' });

    // 2. Bloque DATOS DEL CLIENTE — fondo pastel gris.
    // Orden de campos: CLIENTE / RAZÓN SOCIAL (fusionado), DIRECCIÓN, DNI/RUC,
    // FECHA DE EMISIÓN, FECHA DE ENTREGA.
    const clientBoxTop = headerHeight + 10;
    const clientBoxHeight = 50;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(15, clientBoxTop, pageWidth - 30, clientBoxHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(15, clientBoxTop, pageWidth - 30, clientBoxHeight, 'S');

    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.text('DATOS DEL CLIENTE', 20, clientBoxTop + 8);

    const labelX = 20;
    const valueX = 70;
    let rowY = clientBoxTop + 16;
    const rowGap = 7;

    const renderRow = (label: string, value: string) => {
        doc.setTextColor(71, 85, 105);
        doc.setFont(fontName, 'bold');
        doc.setFontSize(9);
        doc.text(label, labelX, rowY);
        doc.setTextColor(30, 41, 59); // slate-800 para valores
        doc.setFont(fontName, 'normal');
        doc.text(value || '---', valueX, rowY);
        rowY += rowGap;
    };

    renderRow('CLIENTE / RAZÓN SOCIAL:', clientData.name);
    renderRow('DIRECCIÓN:',              clientData.address);
    renderRow('DNI/RUC:',                clientData.doi);
    renderRow('FECHA DE EMISIÓN:',       formatNiceDate(new Date()));
    renderRow('FECHA DE ENTREGA:',       formatNiceDate(parseInputDate(clientData.deliveryDate)));

    // 3. Items Table — tabla de la optimización (sin la columna TIPO)
    const tableData = items.map((item: any) => [
        item.quantity,
        item.unit,
        item.description || '---',
        `S/ ${item.unitPrice.toFixed(2)}`,
        `S/ ${item.total.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: clientBoxTop + clientBoxHeight + 8,
        head: [['CANT.', 'UNIDAD', 'DESCRIPCIÓN', 'P. UNIT', 'TOTAL']],
        body: tableData,
        theme: 'striped',
        headStyles: {
            fillColor: [232, 236, 242],   // gris pastel claro
            textColor: [71, 85, 105],     // slate-600
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            lineColor: [203, 213, 225],
            lineWidth: 0.2,
            font: fontName
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 30 },
            4: { halign: 'right', cellWidth: 30 }
        },
        styles: { fontSize: 8, cellPadding: 3, font: fontName },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 15, right: 15 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // 4. Totals
    const rightAlign = pageWidth - 15;
    doc.setFontSize(10);
    doc.setFont(fontName, 'normal');
    doc.text('SUBTOTAL:', rightAlign - 60, finalY);
    doc.text(`S/ ${totals.subtotal.toFixed(2)}`, rightAlign, finalY, { align: 'right' });

    doc.setTextColor(71, 85, 105); // slate-600 (grayscale instead of rose-500)
    doc.text('DESCUENTO:', rightAlign - 60, finalY + 6);
    doc.text(`- S/ ${totals.discount.toFixed(2)}`, rightAlign, finalY + 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    let currentY = finalY + 12;
    if (totals.igv > 0) {
        doc.text('IGV (18%):', rightAlign - 60, currentY);
        doc.text(`S/ ${totals.igv.toFixed(2)}`, rightAlign, currentY, { align: 'right' });
        currentY += 6;
    }

    doc.setFontSize(12);
    doc.setFont(fontName, 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(rightAlign - 65, currentY - 4, 65, 10, 'F');
    doc.text('TOTAL:', rightAlign - 60, currentY + 3);
    doc.text(`S/ ${totals.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, rightAlign - 2, currentY + 3, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('ADELANTO:', rightAlign - 60, currentY + 14);
    doc.text(`S/ ${totals.advance.toFixed(2)}`, rightAlign, currentY + 14, { align: 'right' });

    doc.setFontSize(11);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('SALDO PENDIENTE:', rightAlign - 60, currentY + 22);
    doc.text(`S/ ${totals.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, rightAlign, currentY + 22, { align: 'right' });

    // 5. Signatures
    const sigY = currentY + 50;
    doc.setDrawColor(200, 200, 200);
    doc.line(30, sigY, 80, sigY);
    doc.line(pageWidth - 80, sigY, pageWidth - 30, sigY);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont(fontName, 'bold');
    doc.text('FIRMA VENDEDOR', 55, sigY + 5, { align: 'center' });
    doc.text('FIRMA CLIENTE', pageWidth - 55, sigY + 5, { align: 'center' });

    // Razón social del vendedor debajo de "FIRMA VENDEDOR".
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(companyName, 55, sigY + 10, { align: 'center' });

    return doc;
};

export const generateQuotePDF = async (exportData: any, filename: string) => {
    const doc = await buildQuotePDF(exportData);
    doc.save(`${filename}.pdf`);
};

export const printQuotePDF = async (exportData: any) => {
    const doc = await buildQuotePDF(exportData);
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);

    // Hidden iframe → calls .print() on the PDF viewer without opening a tab
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.src = url;
    document.body.appendChild(iframe);

    iframe.onload = () => {
        // Small delay so the PDF viewer finishes rendering before invoking print
        setTimeout(() => {
            try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
            } catch (e) {
                console.error('Print failed:', e);
            }
        }, 200);
    };

    // Cleanup once the user is done; afterprint may not fire on PDF viewers
    setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        URL.revokeObjectURL(url);
    }, 60_000);
};
