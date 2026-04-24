import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const exportToExcel = async (exportData: any, filename: string) => {
    const { items, totals, code, clientData, businessInfo } = exportData;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cotización');

    // Set Column Widths
    worksheet.columns = [
        { width: 10 }, // CANT
        { width: 12 }, // UNIDAD
        { width: 15 }, // TIPO
        { width: 50 }, // DESCRIPCION
        { width: 15 }, // P.UNIT
        { width: 15 }  // TOTAL
    ];

    // 1. Business Header
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'COTIZACIÓN / PRESUPUESTO';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    worksheet.getRow(1).height = 30;

    worksheet.addRow([]); // Gap

    // Business Info
    worksheet.mergeCells('A3:C3');
    worksheet.getCell('A3').value = businessInfo?.company_name || 'MI EMPRESA S.A.C.';
    worksheet.getCell('A3').font = { bold: true, size: 12 };
    
    worksheet.mergeCells('A4:C4');
    worksheet.getCell('A4').value = `RUC: ${businessInfo?.ruc || '20000000000'}`;
    
    worksheet.mergeCells('A5:C5');
    worksheet.getCell('A5').value = `Dirección: ${businessInfo?.address || 'Lima, Perú'}`;

    // Code & Date
    worksheet.getCell('E3').value = 'COTIZACIÓN N°:';
    worksheet.getCell('E3').font = { bold: true };
    worksheet.getCell('F3').value = code;
    worksheet.getCell('F3').font = { bold: true, color: { argb: 'FF4F46E5' } };

    worksheet.getCell('E4').value = 'FECHA EMISIÓN:';
    worksheet.getCell('F4').value = new Date().toLocaleDateString();

    worksheet.addRow([]); // Gap

    // 2. Client Info Section Header
    worksheet.mergeCells('A7:F7');
    const clientHeader = worksheet.getCell('A7');
    clientHeader.value = 'DATOS DEL CLIENTE';
    clientHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    clientHeader.font = { bold: true, color: { argb: 'FF334155' } };
    clientHeader.border = { bottom: { style: 'thin' } };

    worksheet.addRow(['CLIENTE:', clientData.name || '---', '', '', 'DOI / RUC:', clientData.doi || '---']);
    worksheet.addRow(['FECHA ENTREGA:', clientData.deliveryDate || '---', '', '', 'TIPO DOC:', clientData.documentType]);
    worksheet.addRow(['DIRECCIÓN:', clientData.address || '---']);

    worksheet.addRow([]); // Gap

    // 3. Items Table Header
    const tableHeader = ['CANT.', 'UNIDAD', 'TIPO', 'DESCRIPCIÓN DEL PRODUCTO', 'P. UNIT', 'TOTAL'];
    const headerRow = worksheet.addRow(tableHeader);
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // Items Data
    items.forEach((item: any) => {
        const row = worksheet.addRow([
            item.quantity,
            item.unit,
            item.type,
            item.description,
            item.unitPrice,
            item.total
        ]);
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.getCell(3).alignment = { horizontal: 'center' };
        row.getCell(5).numFmt = '"S/" #,##0.00';
        row.getCell(6).numFmt = '"S/" #,##0.00';
        
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
        });
    });

    worksheet.addRow([]); // Gap

    // 4. Totals with specific positioning
    const startRow = worksheet.lastRow!.number + 1;
    
    // Helper to style total labels
    const styleLabel = (cell: any) => {
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'right' };
    };

    const subRow = worksheet.getRow(startRow);
    subRow.getCell(5).value = 'SUBTOTAL:';
    styleLabel(subRow.getCell(5));
    subRow.getCell(6).value = totals.subtotal;
    subRow.getCell(6).numFmt = '"S/" #,##0.00';
    subRow.getCell(6).font = { bold: true };

    const descRow = worksheet.getRow(startRow + 1);
    descRow.getCell(5).value = 'DESCUENTO:';
    styleLabel(descRow.getCell(5));
    descRow.getCell(6).value = totals.discount;
    descRow.getCell(6).numFmt = '"S/" #,##0.00';
    descRow.getCell(6).font = { color: { argb: 'FFF43F5E' } };

    let currentTotalRow = startRow + 2;
    if (totals.igv > 0) {
        const igvRow = worksheet.getRow(currentTotalRow);
        igvRow.getCell(5).value = 'IGV (18%):';
        styleLabel(igvRow.getCell(5));
        igvRow.getCell(6).value = totals.igv;
        igvRow.getCell(6).numFmt = '"S/" #,##0.00';
        currentTotalRow++;
    }

    const totalRowFinal = worksheet.getRow(currentTotalRow);
    totalRowFinal.getCell(5).value = 'TOTAL:';
    totalRowFinal.getCell(5).font = { bold: true, size: 12 };
    totalRowFinal.getCell(5).alignment = { horizontal: 'right' };
    totalRowFinal.getCell(6).value = totals.total;
    totalRowFinal.getCell(6).font = { bold: true, size: 14 };
    totalRowFinal.getCell(6).numFmt = '"S/" #,##0.00';
    totalRowFinal.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    const advRow = worksheet.getRow(currentTotalRow + 2);
    advRow.getCell(5).value = 'ADELANTO:';
    styleLabel(advRow.getCell(5));
    advRow.getCell(6).value = totals.advance;
    advRow.getCell(6).numFmt = '"S/" #,##0.00';
    advRow.getCell(6).font = { color: { argb: 'FF10B981' } };

    const balRow = worksheet.getRow(currentTotalRow + 3);
    balRow.getCell(5).value = 'SALDO PENDIENTE:';
    balRow.getCell(5).font = { bold: true, color: { argb: 'FFF59E0B' } };
    balRow.getCell(5).alignment = { horizontal: 'right' };
    balRow.getCell(6).value = totals.balance;
    balRow.getCell(6).numFmt = '"S/" #,##0.00';
    balRow.getCell(6).font = { bold: true, size: 12, color: { argb: 'FFF59E0B' } };

    // 5. Signature Section
    const sigRow = currentTotalRow + 7;
    worksheet.mergeCells(`A${sigRow}:B${sigRow}`);
    worksheet.getCell(`A${sigRow}`).value = '____________________';
    worksheet.getCell(`A${sigRow}`).alignment = { horizontal: 'center' };
    
    worksheet.mergeCells(`A${sigRow + 1}:B${sigRow + 1}`);
    worksheet.getCell(`A${sigRow + 1}`).value = 'FIRMA VENDEDOR';
    worksheet.getCell(`A${sigRow + 1}`).alignment = { horizontal: 'center' };
    worksheet.getCell(`A${sigRow + 1}`).font = { size: 9, bold: true, color: { argb: 'FF64748B' } };

    worksheet.mergeCells(`D${sigRow}:E${sigRow}`);
    worksheet.getCell(`D${sigRow}`).value = '____________________';
    worksheet.getCell(`D${sigRow}`).alignment = { horizontal: 'center' };

    worksheet.mergeCells(`D${sigRow + 1}:E${sigRow + 1}`);
    worksheet.getCell(`D${sigRow + 1}`).value = 'FIRMA CLIENTE';
    worksheet.getCell(`D${sigRow + 1}`).alignment = { horizontal: 'center' };
    worksheet.getCell(`D${sigRow + 1}`).font = { size: 9, bold: true, color: { argb: 'FF64748B' } };

    // Auto-save the file
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
};
