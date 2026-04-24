import React from 'react';
import type { Piece, OptimizationConfig } from '../types';

interface PrintReportProps {
    projectName: string;
    config: OptimizationConfig;
    optimizationCode: string | null;
    boards: any[];
    pieces: Piece[];
    stats: { wastePercent: string };
    totalEdge1: number;
    totalEdge2: number;
    currentVersion: number;
    expandedPieces: any[];
}

export const PrintReport = React.memo(React.forwardRef<HTMLDivElement, PrintReportProps>(({ 
    projectName, 
    config, 
    optimizationCode, 
    boards, 
    pieces, 
    stats, 
    totalEdge1, 
    totalEdge2, 
    currentVersion,
    expandedPieces 
}, ref) => {
    return (
        <div ref={ref} className="bg-white text-black print-document" style={{ fontFamily: 'sans-serif', margin: 0, padding: 0, width: '100%', overflow: 'visible' }}>
            <style type="text/css">
                {`
                @page {
                    size: portrait;
                    margin: 0;
                }

                @media print {
                    body {
                        margin: 0;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }

                .print-document {
                    width: 210mm;
                    margin: 0 auto;
                    background: white;
                }

                .print-page-v { 
                    page-break-after: always;
                    break-after: page; 
                    width: 210mm;
                    height: 297mm;
                    background: white !important; 
                    color: black !important; 
                    display: flex;
                    flex-direction: column;
                    box-sizing: border-box;
                    position: relative;
                    padding: 15mm;
                    font-size: 11px;
                    line-height: 1.2;
                    overflow: hidden;
                }

                .print-page-v:last-child {
                    page-break-after: avoid;
                    break-after: auto;
                }

                .print-map-container {
                    position: relative;
                    background: #fbfbfb;
                    border: 2px solid black;
                    margin: 0 auto;
                    box-sizing: border-box;
                }

                table {
                    break-inside: avoid;
                }

                .piece-label-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    background: rgba(255, 255, 255, 0.7);
                    padding: 2px;
                    border-radius: 2px;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                }
                `}
            </style>

            {/* Page 1: Summary */}
            <div className="print-page-v">
                <div className="border-b-2 border-black pb-2 mb-3 flex justify-between items-end">
                    <div className="flex flex-col">
                        <h1 className="font-black text-[24px] uppercase mb-0">{projectName ? projectName.replace('REPORTE XL - ', '') : 'Proyecto sin nombre'}</h1>
                        <p className="text-[12px] font-bold text-gray-600">Reporte de Optimización | Fecha: {new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-bold uppercase mb-0">Cliente: {config.clientName || 'Retail'}</p>
                        <p className="text-[10px] text-gray-500 font-mono tracking-tight">REF: {optimizationCode || 'N/A'} | OT: {config.workOrder}</p>
                    </div>
                </div>

                <div className="mb-4">
                    <table className="w-full text-[12px] border-collapse border border-black">
                        <thead>
                            <tr>
                                <th colSpan={4} className="bg-black text-white py-1.5 px-3 text-left font-black uppercase tracking-widest text-[16px]">
                                    Resultados de la Optimización
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-black">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 w-1/4 uppercase text-[11px]">Tamaño Panel</td>
                                <td className="py-1.5 px-3 border-r border-black w-1/4 text-[12px]">{config.boardWidth} x {config.boardHeight} mm</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 w-1/4 uppercase text-[11px]">Paneles Utilizados</td>
                                <td className="py-1.5 px-3 w-1/4 font-black text-[13px] text-blue-900 underline">{boards.length} Unid.</td>
                            </tr>
                            <tr className="border-b border-black">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Sup. Panel</td>
                                <td className="py-1.5 px-3 border-r border-black text-[12px]">{((config.boardWidth * config.boardHeight) / 1000000).toFixed(2)} m²</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Sup. Total</td>
                                <td className="py-1.5 px-3 font-bold text-[12px]">{(boards.length * ((config.boardWidth * config.boardHeight) / 1000000)).toFixed(2)} m²</td>
                            </tr>
                            <tr className="border-b border-black text-[12px]">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Corte de Piezas</td>
                                <td className="py-1.5 px-3 border-r border-black">{pieces.reduce((acc, p) => acc + p.quantity, 0)} Unid.</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Sup. Neta Piezas</td>
                                <td className="py-1.5 px-3">
                                    {(boards.reduce((total, b) => total + b.placedPieces.reduce((acc, p) => acc + (p.width * p.height), 0), 0) / 1000000).toFixed(2)} m²
                                </td>
                            </tr>
                            <tr className="border-b border-black">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Merma / Desperdicio</td>
                                <td className="py-1.5 px-3 border-r border-black text-red-700 font-black text-[18px] bg-red-50 leading-none">{stats.wastePercent}%</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Modo Corte</td>
                                <td className="py-1.5 px-3 font-bold text-[11px] uppercase">{config.strategy === 'MAX_SAVINGS' ? 'MÁXIMO AHORRO' : 'CORTES SIMPLES'}</td>
                            </tr>
                            <tr className="border-b border-black">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Canto Delgado</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold text-indigo-900 text-[12px]">{(totalEdge1 || 0).toFixed(2)} ml</td>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px]">Canto Grueso</td>
                                <td className="py-1.5 px-3 font-bold text-indigo-900 text-[12px]">{(totalEdge2 || 0).toFixed(2)} ml</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mb-4">
                    <table className="w-full text-[12px] border-collapse border border-black">
                        <thead>
                            <tr className="bg-gray-50 uppercase text-[11px] font-black border-b border-black">
                                <th className="border-r border-black py-1.5 px-3 text-left w-1/3">Tipo de Canto</th>
                                <th className="border border-black py-1.5 px-3 text-left">Representación</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-black">
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 text-[11px] uppercase tracking-tighter">Canto Delgado ({config.edgeThickness1}mm)</td>
                                <td className="py-1.5 px-3 flex items-center gap-6">
                                    <div className="w-16 h-[2px] bg-black"></div>
                                    <span className="text-[11px] font-bold">Línea continua en diagrama</span>
                                </td>
                            </tr>
                            <tr>
                                <td className="py-1.5 px-3 border-r border-black font-bold bg-gray-50 uppercase text-[11px] tracking-tighter">Canto Grueso ({config.edgeThickness2}mm)</td>
                                <td className="py-1.5 px-3 flex items-center gap-6">
                                    <div className="w-16 h-2 border-b-2 border-dashed border-black"></div>
                                    <span className="text-[11px] font-bold">Línea discontinua en diagrama</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mb-0">
                    <h3 className="font-bold text-[16px] uppercase bg-gray-800 text-white px-3 py-1.5 mb-1">Canales / Ranuras Solicitadas</h3>
                    <table className="w-full text-[12px] border-collapse border border-black">
                        <thead>
                            <tr className="bg-gray-50 uppercase text-[10px] font-black border-b border-black">
                                <th className="border border-black py-1.5 px-3 text-left w-1/3">Posicionamiento</th>
                                <th className="border border-black py-1.5 px-3 text-center">Profundidad</th>
                                <th className="border border-black py-1.5 px-3 text-center">Fresa</th>
                                <th className="border border-black py-1.5 px-3 text-center">Cant.</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={4} className="py-4 text-center text-gray-400 italic font-black text-[14px] bg-gray-50 border border-black">
                                    PROYECTO SIN RANURAS ESPECIALES
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Page 2: Piece List */}
            <div className="print-page-v">
                <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
                    <h2 className="font-black text-[22px] uppercase">Lista de Piezas Requeridas</h2>
                    <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Página 2 / RESUMEN</p>
                </div>
                <table className="w-full text-[12px] border-collapse border border-black" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-gray-50 font-bold uppercase text-[11px] border-b border-black">
                        <tr>
                            <th className="border border-black py-1.5 px-3 w-10 text-center">#</th>
                            <th className="border border-black py-1.5 px-3 text-left w-48">Descripción / Pieza</th>
                            <th className="border border-black py-1.5 px-3 text-center w-24">Ancho</th>
                            <th className="border border-black py-1.5 px-3 text-center w-24">Largo</th>
                            <th className="border border-black py-1.5 px-3 text-center w-12">Cant.</th>
                            <th className="border border-black py-1.5 px-3 text-center w-28 bg-yellow-50/50">Dim. Final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expandedPieces.map((ep: any) => {
                            const eb = ep.edgeBanding || { top: 0, bottom: 0, left: 0, right: 0 };
                            const getThickness = (type: number) => {
                                if (type === 1) return config.edgeThickness1 || 0;
                                if (type === 2) return config.edgeThickness2 || 0;
                                return 0;
                            };
                            const leftT = getThickness(eb.left);
                            const rightT = getThickness(eb.right);
                            const topT = getThickness(eb.top);
                            const bottomT = getThickness(eb.bottom);
                            
                            return (
                            <tr key={`${ep.id}-${ep.printIndex}`} className="border-b border-black">
                                <td className="py-1.5 px-3 border border-black text-center font-black text-[13px] text-gray-400 bg-slate-50">{ep.printIndex}</td>
                                <td className="py-1.5 px-4 border border-black font-bold uppercase text-[11px] tracking-tight truncate">{ep.description}</td>
                                <td className="py-1.5 px-3 border border-black text-center font-bold text-[12px]">{Math.max(0, ep.width - leftT - rightT).toFixed(1)}</td>
                                <td className="py-1.5 px-3 border border-black text-center font-bold text-[12px]">{Math.max(0, ep.height - topT - bottomT).toFixed(1)}</td>
                                <td className="py-1.5 px-3 border border-black text-center font-black text-[12px] bg-slate-50">1</td>
                                <td className="py-1.5 px-4 border border-black text-center font-black text-[12px] bg-yellow-50">{ep.width} x {ep.height}</td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Map Pages */}
            {boards.map((board: any, bIndex: number) => {
                const boardW = Number(board.width || config.boardWidth);
                const boardH = Number(board.height || config.boardHeight);

                const portraitPageW = 180;
                const portraitPageH = 180;

                const boardScale = Math.min(portraitPageW / boardW, portraitPageH / boardH);

                const cssWidth = (boardW * boardScale).toFixed(2);
                const cssHeight = (boardH * boardScale).toFixed(2);

                return (
                    <React.Fragment key={`${board.id}-${bIndex}`}>
                        <div className="print-page-v">
                                <div className="w-full flex-1 flex flex-col">
                                {/* Map Header */}
                                <div className="w-full border-b-4 border-black pb-2 mb-2 flex justify-between items-end flex-shrink-0 relative z-10 bg-white">
                                    <div className="flex flex-col">
                                        <h2 className="font-black text-4xl uppercase tracking-tighter m-0">Mapa de Corte: Tablero {bIndex + 1}</h2>
                                        <p className="text-[16px] font-bold text-gray-700 m-0">Material: {board.materialLabel ?? config.material} ({boardW} x {boardH} mm)</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-3xl font-black text-gray-900 m-0">Uso: {((board.usedArea / (boardW * boardH)) * 100).toFixed(1)}%</p>
                                        <p className="text-[14px] font-mono text-gray-400 m-0">OT: {config.workOrder} | Ver: {currentVersion}</p>
                                    </div>
                                </div>

                            {/* Map Visualization Area */}
                            <div className="flex-1 w-full flex items-center justify-center relative min-h-0 z-0">
                                    <div 
                                        className="print-map-container"
                                        style={{
                                            width: `${cssWidth}mm`,
                                            height: `${cssHeight}mm`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #dddddd 6px, #dddddd 7px)',
                                            backgroundColor: 'white',
                                            display: 'block'
                                        }}
                                    >
                                    <div className="absolute inset-0">
                                        {board.placedPieces.map((piece: any, pIdx: number) => {
                                            const left = (piece.x / boardW) * 100 + '%';
                                            const top = (piece.y / boardH) * 100 + '%';
                                            const w = (piece.width / boardW) * 100 + '%';
                                            const h = (piece.height / boardH) * 100 + '%';
                                            const eb = piece.edgeBanding || {};
                                            const isSmall = piece.width < 275 && piece.height < 275;

                                            return (
                                                <div
                                                    key={`${piece.id}-${pIdx}`}
                                                    className="absolute border border-black text-black bg-white flex flex-col items-center justify-center overflow-hidden"
                                                    style={{ left, top, width: w, height: h, boxSizing: 'border-box' }}
                                                >
                                                    <div className="absolute bottom-0.5 right-0.5 bg-black text-white text-[10px] font-black rounded-sm px-1 leading-none z-20 shadow-sm">
                                                        {piece.printIndex}
                                                    </div>

                                                    <div className={`absolute w-2 h-2 rounded-full bg-red-600 z-30 border border-white ${piece.rotated ? 'top-1 left-1' : 'bottom-1 left-1'}`}></div>

                                                    {!isSmall && piece.rotated && (
                                                        <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none p-[2px] z-10">
                                                            <div className="flex flex-col items-center gap-[1px]">
                                                                <span className="text-[12px] font-black leading-[1.1] bg-white text-black px-1">
                                                                    {piece.width}
                                                                </span>
                                                                {eb.top > 0 && (
                                                                    <div className={`w-full min-w-[20px] border-b-[2px] ${eb.top === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                )}
                                                                {eb.bottom > 0 && (
                                                                    <div className={`w-full min-w-[20px] border-b-[2px] ${eb.bottom === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {!isSmall && !piece.rotated && (
                                                        <div className="absolute bottom-0 left-0 right-0 flex justify-center items-end pointer-events-none p-[2px] z-10">
                                                            <div className="flex flex-col items-center gap-[1px]">
                                                                <span className="text-[12px] font-black leading-[1.1] bg-white text-black px-1">
                                                                    {piece.width}
                                                                </span>
                                                                {eb.top > 0 && (
                                                                    <div className={`w-full min-w-[20px] border-b-[2px] ${eb.top === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                )}
                                                                {eb.bottom > 0 && (
                                                                    <div className={`w-full min-w-[20px] border-b-[2px] ${eb.bottom === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!isSmall && (
                                                        <div className="absolute left-0 top-0 bottom-0 flex items-center justify-start pointer-events-none p-[2px] z-10">
                                                            <div className="flex flex-row items-center gap-[1px] -rotate-90 origin-center">
                                                                <div className="flex flex-col items-center gap-[1px]">
                                                                    <span className="text-[12px] font-black leading-[1.1] bg-white text-black px-1">
                                                                        {piece.height}
                                                                    </span>
                                                                    {eb.left > 0 && (
                                                                        <div className={`w-full min-w-[20px] border-b-[2px] ${eb.left === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                    )}
                                                                    {eb.right > 0 && (
                                                                        <div className={`w-full min-w-[20px] border-b-[2px] ${eb.right === 2 ? 'border-dashed' : 'border-solid'} border-black`}></div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {piece.rotated && (
                                                        <span className="absolute bottom-1 left-8 material-icons-round text-[10px] opacity-40">sync</span>
                                                    )}

                                                    {isSmall && <span className="font-black text-[11px] text-gray-300 opacity-30">+</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="w-full mt-2 flex justify-between items-center px-1 flex-shrink-0">
                                <div className="flex gap-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-black bg-white"></div>
                                        <span className="text-[16px] font-black text-gray-800 uppercase">Piezas</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-black bg-[#f0f0f0] overflow-hidden relative">
                                            <div className="absolute inset-0" style={{backgroundImage: 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)'}}></div>
                                        </div>
                                        <span className="text-[16px] font-black text-gray-800 uppercase">Merma</span>
                                    </div>
                                </div>
                                <div className="text-[16px] font-black text-indigo-800 tracking-widest uppercase bg-indigo-50 px-3 py-1 rounded">Escala: {(boardScale * 100).toFixed(1)}%</div>
                            </div>
                            </div>
                        </div>

                        {/* Index Page per board */}
                        <div className="print-page-v p-8">
                            <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
                                <h2 className="font-black text-[18px] uppercase tracking-tighter leading-none">Índice de Piezas: Tablero {bIndex + 1}</h2>
                                <p className="text-[10px] text-gray-500 font-black italic tracking-widest leading-none">REF: {optimizationCode || 'N/A'}</p>
                            </div>
                            <table className="w-full text-[12px] border-collapse border-2 border-black">
                                <thead>
                                    <tr className="bg-gray-50 uppercase text-[11px] font-black border-b-2 border-black">
                                        <th className="border border-black py-2 px-3 w-10 text-center">#</th>
                                        <th className="border border-black py-2 px-3 text-left">Pieza / Descripción</th>
                                        <th className="border border-black py-2 px-3 w-28 text-center">Dim. Corte</th>
                                        <th className="border border-black py-2 px-3 w-16 text-center">Cantos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {board.placedPieces.map((p: any, idx: number) => {
                                        const orig = p.originalPiece;
                                        const eb = orig?.edgeBanding || p.edgeBanding || {};
                                        return (
                                            <tr key={`${p.id}-${idx}`} className="border-b border-black">
                                                <td className="py-1 px-3 border border-black text-center font-black">{p.printIndex}</td>
                                                <td className="py-1 px-3 border border-black font-bold uppercase truncate max-w-[200px]">{orig?.description || 'Pieza'}</td>
                                                <td className="py-1 px-3 border border-black text-center font-black">{p.width} x {p.height}</td>
                                                <td className="py-1 px-3 border border-black">
                                                    <div className="flex justify-center items-center py-0.5">
                                                        <div className="w-9 h-9 border border-gray-400 relative bg-gray-50 flex items-center justify-center scale-90">
                                                            <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-red-600 z-30"></div>
                                                            {eb.top === 1 && <div className="absolute top-0 inset-x-0 h-[1.5px] bg-black"></div>}
                                                            {eb.bottom === 1 && <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-black"></div>}
                                                            {eb.left === 1 && <div className="absolute left-0 inset-y-0 w-[1.5px] bg-black"></div>}
                                                            {eb.right === 1 && <div className="absolute right-0 inset-y-0 w-[1.5px] bg-black"></div>}

                                                            {eb.top === 2 && <div className="absolute top-0 inset-x-0 h-1.5 border-t-2 border-dashed border-black"></div>}
                                                            {eb.bottom === 2 && <div className="absolute bottom-0 inset-x-0 h-1.5 border-b-2 border-dashed border-black"></div>}
                                                            {eb.left === 2 && <div className="absolute left-0 inset-y-0 w-1.5 border-l-2 border-dashed border-black"></div>}
                                                            {eb.right === 2 && <div className="absolute right-0 inset-y-0 w-1.5 border-r-2 border-dashed border-black"></div>}
                                                            {!eb.top && !eb.bottom && !eb.left && !eb.right && <span className="text-[18px] text-gray-300">-</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Zooms if necessary */}
                        {board.placedPieces.some((p: any) => p.width < 275 && p.height < 275) && (
                            [
                                { name: 'TL', x: 0, y: 0, check: (p: any) => p.x < boardW/2 && p.y < boardH/2 },
                                { name: 'TR', x: -100, y: 0, check: (p: any) => p.x + p.width > boardW/2 && p.y < boardH/2 },
                                { name: 'BL', x: 0, y: -100, check: (p: any) => p.x < boardW/2 && p.y + p.height > boardH/2 },
                                { name: 'BR', x: -100, y: -100, check: (p: any) => p.x + p.width > boardW/2 && p.y + p.height > boardH/2 }
                            ]
                            .filter(quad => board.placedPieces.some((p: any) => p.width < 275 && p.height < 275 && quad.check(p)))
                            .map((quad, qIdx) => (
                                <div key={`q-${bIndex}-${qIdx}`} className="print-page-v p-8">
                                    <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
                                        <h2 className="font-bold text-lg uppercase">Zoom {quad.name}: Tablero {bIndex + 1}</h2>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Escala 2x Ampliada</p>
                                    </div>
                                    <div 
                                        className="relative w-full border-4 border-black overflow-hidden bg-white"
                                        style={{ 
                                            aspectRatio: `${boardW} / ${boardH}`,
                                            maxHeight: '180mm',
                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(0,0,0,0.05) 15px, rgba(0,0,0,0.05) 16px)'
                                        }}
                                    >
                                        <div 
                                            className="absolute w-[200%] h-[200%]"
                                            style={{ left: `${quad.x}%`, top: `${quad.y}%` }}
                                        >
                                            {board.placedPieces.map((piece: any, px: number) => (
                                                <div
                                                    key={`zp-${px}`}
                                                    className="absolute border border-black flex flex-col items-center justify-center bg-white"
                                                    style={{ 
                                                        left: (piece.x / boardW) * 100 + '%', 
                                                        top: (piece.y / boardH) * 100 + '%', 
                                                        width: (piece.width / boardW) * 100 + '%', 
                                                        height: (piece.height / boardH) * 100 + '%' 
                                                    }}
                                                >
                                                    <div className="absolute bottom-0.5 right-0.5 bg-black text-white text-[9px] px-1 font-bold z-10">{piece.printIndex}</div>
                                                    <div className="flex flex-col items-center justify-center p-0.5">
                                                        <span className="font-black text-[11px] leading-tight text-black">{piece.width}</span>
                                                        <span className="font-black text-[11px] leading-tight text-black rotate-90 absolute left-0.5">{piece.height}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}));
