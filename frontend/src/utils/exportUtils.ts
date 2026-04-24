import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export const exportToPDF = (title: string, columns: string[], data: any[][], fileName: string) => {
    const doc = new jsPDF('l', 'pt', 'a4'); 
    
    // Title
    doc.setFontSize(18);
    doc.text(title, 40, 40);
    
    // Date
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 40, 60);

    // AutoTable
    autoTable(doc, {
        head: [columns],
        body: data,
        startY: 80,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
    });

    doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportProjectMasterPDF = (project: any, items: any[], collections: any[]) => {
    console.log("Exporting Master PDF for:", project.name);
    try {
        const doc = new jsPDF('p', 'pt', 'a4');
        const grey: [number, number, number] = [100, 116, 139];
        const indigo: [number, number, number] = [79, 70, 229];

        // Helper for currency
        const fmt = (v: number) => (v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 });
        const fmtDate = (d: any) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE') : '--/--';
        const getDays = (d1: any, d2: any) => {
            if (!d1 || !d2) return 0;
            const t1 = new Date(d1 + 'T00:00:00').getTime();
            const t2 = new Date(d2 + 'T00:00:00').getTime();
            if (isNaN(t1) || isNaN(t2)) return 0;
            return Math.ceil((t2 - t1) / (1000 * 60 * 60 * 24));
        };

        // 1. HEADER
        doc.setFontSize(20);
        doc.setTextColor(30, 41, 59);
        doc.text(`RESUMEN DE PROYECTO`, 40, 50);
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text(`#${project.project_number} - ${project.name}`, 40, 70);
        doc.setDrawColor(226, 232, 240);
        doc.line(40, 85, 400, 85);

        // 3. CALCS
        const budgetTotal = project.budget_total || 0;
        const budgetBase = budgetTotal / 1.18;
        const itemsRegular = items.filter(i => !i.category.startsWith('ADICIONAL'));
        const itemsAdicional = items.filter(i => i.category.startsWith('ADICIONAL'));
        const costP = itemsRegular.reduce((a, b) => a + (b.planned_qty * b.planned_unit_price), 0);
        const costR = itemsRegular.reduce((a, b) => a + (b.real_qty * b.real_unit_price), 0);
        const utilP = budgetBase - costP;
        const utilR = budgetBase - costR;
        const utilPPerc = budgetBase > 0 ? (utilP / budgetBase) * 100 : 0;
        const utilRPerc = budgetBase > 0 ? (utilR / budgetBase) * 100 : 0;

        // Gauge Helper
        const drawGauge = (x: number, y: number, val: number, label: string) => {
            const r = 28;
            doc.setLineWidth(6);
            doc.setDrawColor(241, 245, 249);
            for (let i = 0; i <= 10; i++) {
                const a1 = (Math.PI) + (Math.PI * i / 10);
                const a2 = (Math.PI) + (Math.PI * (i + 1) / 10);
                doc.line(x + Math.cos(a1)*r, y + Math.sin(a1)*r, x + Math.cos(a2)*r, y + Math.sin(a2)*r);
            }
            const color: [number, number, number] = val < 0 ? [244, 63, 94] : (val < 15 ? [245, 158, 11] : [16, 185, 129]);
            doc.setDrawColor(...color);
            const segments = Math.max(1, Math.floor((Math.min(Math.max(val, 0), 100) / 100) * 10));
            for (let i = 0; i < segments; i++) {
                const a1 = (Math.PI) + (Math.PI * i / 10);
                const a2 = (Math.PI) + (Math.PI * (i + 1) / 10);
                doc.line(x + Math.cos(a1)*r, y + Math.sin(a1)*r, x + Math.cos(a2)*r, y + Math.sin(a2)*r);
            }
            doc.setFontSize(6); doc.setTextColor(110);
            doc.text(label, x - 25, y + 10);
            doc.setFontSize(8); doc.setTextColor(...color); doc.setFont('helvetica', 'bold');
            doc.text(`${val.toFixed(1)}%`, x - 10, y - 5);
            doc.setFont('helvetica', 'normal');
        };

        drawGauge(460, 65, utilPPerc, 'MARGEN PLAN');
        if (project.end_date_real) {
            drawGauge(540, 65, utilRPerc, 'MARGEN REAL');
        }

        // 2. DATOS GENERALES (Stacked Planned/Real Table)
        const durP = `${getDays(project.start_date_planned, project.end_date_planned)} Días`;
        const durR = project.end_date_real ? `${getDays(project.start_date_real, project.end_date_real)} Días` : 'En curso';

        autoTable(doc, {
            startY: 105,
            head: [['#FICHA', 'PROYECTO', 'ESTADO', 'PLANIFICADO', 'EJECUTADO REAL']],
            body: [[
                project.project_number, 
                project.name || '-', 
                project.status || '-', 
                `Inicio: ${fmtDate(project.start_date_planned)}\nFin: ${fmtDate(project.end_date_planned)}\nDuración: ${durP}`,
                `Inicio: ${fmtDate(project.start_date_real)}\nFin: ${fmtDate(project.end_date_real)}\nDuración: ${durR}`
            ]],
            headStyles: { fillColor: [51, 65, 85] }, // Slate-700
            styles: { fontSize: 8, cellPadding: 8 }
        });

        // 3. RESUMEN FINANCIERO
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text('RESUMEN FINANCIERO', 40, (doc as any).lastAutoTable.finalY + 25);
        
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 30,
            head: [['PPTO SIN IGV', 'PPTO TOTAL', 'PLANIFICADO', 'EJECUTADO REAL']],
            body: [[
                fmt(budgetBase), 
                fmt(budgetTotal), 
                `GASTO: ${fmt(costP)}\nUTILIDAD: ${fmt(utilP)} (${utilPPerc.toFixed(1)}%)`,
                `GASTO: ${fmt(costR)}\nUTILIDAD: ${fmt(utilR)} (${utilRPerc.toFixed(1)}%)`
            ]],
            headStyles: { fillColor: indigo },
            styles: { fontSize: 9, cellPadding: 8 }
        });

        // 3.1 ADICIONALES
        let lastY = (doc as any).lastAutoTable.finalY;
        if (itemsAdicional.length > 0) {
            const costAP = itemsAdicional.reduce((a, b) => a + (b.planned_qty * b.planned_unit_price), 0);
            const costAR = itemsAdicional.reduce((a, b) => a + (b.real_qty * b.real_unit_price), 0);
            doc.text('RESUMEN ADICIONALES', 40, lastY + 25);
            autoTable(doc, {
                startY: lastY + 30,
                head: [['GASTO ADICIONAL (P)', 'GASTO ADICIONAL (R)', 'UTILIDAD ADIC. (R)']],
                body: [[fmt(costAP), fmt(costAR), fmt(-costAR)]],
                headStyles: { fillColor: grey },
                styles: { fontSize: 8 }
            });
            lastY = (doc as any).lastAutoTable.finalY;
        }

        // 4. INGRESOS
        doc.text('DETALLE DE INGRESOS (COBROS)', 40, lastY + 30);
        autoTable(doc, {
            startY: lastY + 35,
            head: [['FECHA', 'DESCRIPCIÓN', 'CUENTA', 'INGRESO']],
            body: collections.map(c => [fmtDate(c.date?.split('T')[0]), c.description, c.account, fmt(c.amount)]),
            headStyles: { fillColor: [51, 65, 85] },
            styles: { fontSize: 7 }
        });

        // 5. MATERIALES
        doc.text('PEDIDO DE MATERIALES (PRESUPUESTADO VS REAL)', 40, (doc as any).lastAutoTable.finalY + 30);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 35,
            head: [['CANT(P)', 'U/M', 'MATERIAL', 'TOTAL(P)', 'CANT(R)', 'U/M', 'MATERIAL', 'TOTAL(R)', 'CUENTA', 'FECHA']],
            body: items.filter(i => i.category.includes('MATERIAL')).map(m => [
                m.planned_qty, m.unit, m.description, fmt(m.planned_qty * m.planned_unit_price),
                m.real_qty, m.unit, m.description, fmt(m.real_qty * m.real_unit_price), m.origin || '-', fmtDate(m.transaction_date?.split('T')[0])
            ]),
            headStyles: { fillColor: [5, 150, 105] },
            styles: { fontSize: 6 }
        });

        // 6. MANO DE OBRA
        doc.text('MANO DE OBRA (RESUMEN)', 40, (doc as any).lastAutoTable.finalY + 25);
        const labor = items.filter(i => i.category.includes('MANO_OBRA'));
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 28,
            head: [['DESCRIPCIÓN', 'PLANIFICADO', 'REAL']],
            body: [
                ['Costo de Terceros', fmt(labor.filter(l => l.supplier?.toLowerCase() !== 'planilla').reduce((a,b) => a + (b.planned_qty * b.planned_unit_price), 0)), fmt(labor.filter(l => l.supplier?.toLowerCase() !== 'planilla').reduce((a,b) => a + (b.real_qty * b.real_unit_price), 0))],
                ['Costo Planilla', fmt(labor.filter(l => l.supplier?.toLowerCase() === 'planilla').reduce((a,b) => a + (b.planned_qty * b.planned_unit_price), 0)), fmt(labor.filter(l => l.supplier?.toLowerCase() === 'planilla').reduce((a,b) => a + (b.real_qty * b.real_unit_price), 0))],
                ['TOTAL MANO DE OBRA', fmt(labor.reduce((a,b) => a + (b.planned_qty * b.planned_unit_price), 0)), fmt(labor.reduce((a,b) => a + (b.real_qty * b.real_unit_price), 0))]
            ],
            headStyles: { fillColor: [217, 119, 6] },
            styles: { fontSize: 8, fontStyle: 'bold' }
        });

        doc.save(`Resumen_${project.project_number}.pdf`);
    } catch (err) {
        console.error("Master Export Runtime Error:", err);
        alert("Error al generar el reporte maestro: " + (err as Error).message);
    }
};

export const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportImagesToPDF = async (title: string, items: { url: string, label: string, date: string, amount: string }[], fileName: string) => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Superior loading helper using canvas to ensure format compatibility
    const processImage = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = url;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Canvas context error');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // Standardized to JPEG for PDF
            };
            img.onerror = (e) => reject(e);
        });
    };

    let pagesAdded = 0;

    for (const item of items) {
        if (!item.url) continue;

        if (pagesAdded > 0) {
            doc.addPage();
        }

        // Page Header
        doc.setFontSize(14);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 40, 40);
        
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(`${item.label}`, 40, 58);
        doc.text(`Fecha: ${item.date} | Monto: ${item.amount}`, 40, 72);
        doc.setDrawColor(226, 232, 240);
        doc.line(40, 80, pageWidth - 40, 80);

        try {
            const imgData = await processImage(item.url);
            
            // Temporary image to get dimensions
            const tempImg = new Image();
            tempImg.src = imgData;
            await new Promise((res) => { tempImg.onload = res; });

            const maxW = pageWidth - 80;
            const maxH = pageHeight - 140;
            let imgW = tempImg.width;
            let imgH = tempImg.height;

            const ratio = Math.min(maxW / imgW, maxH / imgH);
            imgW *= ratio;
            imgH *= ratio;

            const x = (pageWidth - imgW) / 2;
            const y = 100;

            doc.addImage(imgData, 'JPEG', x, y, imgW, imgH, undefined, 'FAST');
            
        } catch (err) {
            console.error("Could not load image:", item.url, err);
            doc.setTextColor(244, 63, 94);
            doc.setFontSize(12);
            doc.text("! ERROR AL CARGAR ESTE DOCUMENTO !", pageWidth/2, pageHeight/2, { align: 'center' });
            doc.setFontSize(8);
            doc.text(`URL: ${item.url.substring(0, 60)}...`, pageWidth/2, pageHeight/2 + 20, { align: 'center' });
        }
        
        pagesAdded++;
    }

    if (pagesAdded === 0) {
        alert("No se encontraron imágenes válidas para exportar.");
        return;
    }

    doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
};
