import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateQuotePDF = (exportData: any, filename: string) => {
    const { items, totals, code, clientData, businessInfo } = exportData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header — banda pastel clara (sin contraste oscuro). Nombre de la
    // empresa centrado y "COTIZACIÓN <número>" sin prefijo SKU (COT-/OPT-/VTA-).
    const companyName = businessInfo?.company_name || 'HACE SAC';
    const quoteNumber = String(code || '').replace(/^(COT|OPT|VTA)-/, '');

    // Fondo pastel gris muy claro y borde inferior gris suave.
    doc.setFillColor(245, 247, 250); // gris pastel claro
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.4);
    doc.line(0, 40, pageWidth, 40);

    doc.setTextColor(45, 55, 72); // gris oscuro suave
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, 20, { align: 'center' });

    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`COTIZACIÓN ${quoteNumber}`, pageWidth / 2, 30, { align: 'center' });

    // 2. Bloque DATOS DEL CLIENTE — fondo pastel gris.
    // Orden de campos: CLIENTE / RAZÓN SOCIAL (fusionado), DIRECCIÓN, DNI/RUC,
    // FECHA DE EMISIÓN, FECHA DE ENTREGA.
    const clientBoxTop = 50;
    const clientBoxHeight = 50;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(15, clientBoxTop, pageWidth - 30, clientBoxHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(15, clientBoxTop, pageWidth - 30, clientBoxHeight, 'S');

    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', 20, clientBoxTop + 8);

    const labelX = 20;
    const valueX = 70;
    let rowY = clientBoxTop + 16;
    const rowGap = 7;

    const renderRow = (label: string, value: string) => {
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(label, labelX, rowY);
        doc.setTextColor(30, 41, 59); // slate-800 para valores
        doc.setFont('helvetica', 'normal');
        doc.text(value || '---', valueX, rowY);
        rowY += rowGap;
    };

    renderRow('CLIENTE / RAZÓN SOCIAL:', clientData.name);
    renderRow('DIRECCIÓN:',              clientData.address);
    renderRow('DNI/RUC:',                clientData.doi);
    renderRow('FECHA DE EMISIÓN:',       new Date().toLocaleDateString());
    renderRow('FECHA DE ENTREGA:',       clientData.deliveryDate);

    // 3. Items Table — tabla de la optimización
    const tableData = items.map((item: any) => [
        item.quantity,
        item.unit,
        item.type,
        item.description || '---',
        `S/ ${item.unitPrice.toFixed(2)}`,
        `S/ ${item.total.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: clientBoxTop + clientBoxHeight + 8,
        head: [['CANT.', 'UNIDAD', 'TIPO', 'DESCRIPCIÓN', 'P. UNIT', 'TOTAL']],
        body: tableData,
        theme: 'striped',
        headStyles: {
            fillColor: [232, 236, 242],   // gris pastel claro
            textColor: [71, 85, 105],     // slate-600
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            lineColor: [203, 213, 225],
            lineWidth: 0.2
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'center', cellWidth: 20 },
            2: { halign: 'center', cellWidth: 30 },
            4: { halign: 'right', cellWidth: 30 },
            5: { halign: 'right', cellWidth: 30 }
        },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 15, right: 15 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // 4. Totals
    const rightAlign = pageWidth - 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('SUBTOTAL:', rightAlign - 60, finalY);
    doc.text(`S/ ${totals.subtotal.toFixed(2)}`, rightAlign, finalY, { align: 'right' });

    doc.setTextColor(244, 63, 94); // rose-500
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
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(rightAlign - 65, currentY - 4, 65, 10, 'F');
    doc.text('TOTAL:', rightAlign - 60, currentY + 3);
    doc.text(`S/ ${totals.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, rightAlign - 2, currentY + 3, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text('ADELANTO:', rightAlign - 60, currentY + 14);
    doc.text(`S/ ${totals.advance.toFixed(2)}`, rightAlign, currentY + 14, { align: 'right' });

    doc.setTextColor(245, 158, 11); // amber-500
    doc.setFontSize(11);
    doc.text('SALDO PENDIENTE:', rightAlign - 60, currentY + 22);
    doc.text(`S/ ${totals.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, rightAlign, currentY + 22, { align: 'right' });

    // 5. Signatures
    const sigY = currentY + 50;
    doc.setDrawColor(200, 200, 200);
    doc.line(30, sigY, 80, sigY);
    doc.line(pageWidth - 80, sigY, pageWidth - 30, sigY);
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA VENDEDOR', 55, sigY + 5, { align: 'center' });
    doc.text('FIRMA CLIENTE', pageWidth - 55, sigY + 5, { align: 'center' });

    doc.save(`${filename}.pdf`);
};
