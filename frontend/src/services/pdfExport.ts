import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateQuotePDF = (exportData: any, filename: string) => {
    const { items, totals, code, clientData, businessInfo } = exportData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header & Company Info
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('COTIZACIÓN / PRESUPUESTO', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(code, pageWidth / 2, 30, { align: 'center' });

    // Business Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(businessInfo?.company_name || 'MI EMPRESA S.A.C.', 15, 50);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`RUC: ${businessInfo?.ruc || '20000000000'}`, 15, 56);
    doc.text(`Dirección: ${businessInfo?.address || 'Lima, Perú'}`, 15, 61);

    // Date
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA:', pageWidth - 60, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString(), pageWidth - 40, 50);

    // 2. Client Info Section
    doc.setFillColor(241, 245, 249);
    doc.rect(15, 70, pageWidth - 30, 35, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', 20, 78);
    
    doc.setFontSize(9);
    doc.text('CLIENTE:', 20, 86);
    doc.setFont('helvetica', 'normal');
    doc.text(clientData.name || '---', 40, 86);
    
    doc.setFont('helvetica', 'bold');
    doc.text('DOI / RUC:', 120, 86);
    doc.setFont('helvetica', 'normal');
    doc.text(clientData.doi || '---', 145, 86);
    
    doc.setFont('helvetica', 'bold');
    doc.text('DIRECCIÓN:', 20, 93);
    doc.setFont('helvetica', 'normal');
    doc.text(clientData.address || '---', 40, 93);
    
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA ENTREGA:', 20, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(clientData.deliveryDate || '---', 55, 100);
    
    doc.setFont('helvetica', 'bold');
    doc.text('TIPO DOC:', 120, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(clientData.documentType, 145, 100);

    // 3. Items Table
    const tableData = items.map((item: any) => [
        item.quantity,
        item.unit,
        item.type,
        item.description || '---',
        `S/ ${item.unitPrice.toFixed(2)}`,
        `S/ ${item.total.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: 115,
        head: [['CANT.', 'UNIDAD', 'TIPO', 'DESCRIPCIÓN', 'P. UNIT', 'TOTAL']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: [15, 23, 42], 
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center'
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
