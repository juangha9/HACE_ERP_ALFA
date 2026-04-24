import React from 'react';
import type { Piece } from '../types';

interface PieceLabelsProps {
    projectName: string;
    clientName: string;
    material: string;
    pieces: Piece[];
}

export const PieceLabels = React.memo(React.forwardRef<HTMLDivElement, PieceLabelsProps>(({ projectName, clientName, material, pieces }, ref) => {
    // Generate individual pieces (expand quantity)
    const expandedPieces = React.useMemo(() => {
        const result: any[] = [];
        let counter = 1;
        pieces.forEach(p => {
            for (let i = 0; i < (p.quantity || 1); i++) {
                result.push({
                    ...p,
                    instanceIndex: i + 1,
                    globalIndex: counter++
                });
            }
        });
        return result;
    }, [pieces]);

    return (
        <div ref={ref} className="bg-white text-black" style={{ width: '50mm', margin: 0, padding: 0 }}>
            <style>
                {`
                    @page {
                        size: 50mm 50mm;
                        margin: 0;
                    }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .label-card {
                            width: 50mm;
                            height: 50mm;
                            page-break-after: always;
                            break-after: page;
                            padding: 2mm !important;
                            display: flex;
                            flex-direction: column;
                            box-sizing: border-box;
                            overflow: hidden;
                            margin: 0 !important;
                            border: none !important;
                        }
                    }
                    .label-card {
                        width: 50mm;
                        height: 50mm;
                        padding: 3mm;
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                        border: 1px dashed #000;
                        margin-bottom: 0px;
                        background: white;
                    }
                `}
            </style>

            <div style={{ margin: 0, padding: 0 }}>
                {expandedPieces.map((piece, idx) => (
                    <div key={`${piece.id}-${idx}`} className="label-card">
                        {/* Header: Project & Client (Minimal) */}
                        <div className="flex justify-between items-start border-b border-black pb-0.5 mb-1 text-[6px] uppercase font-bold text-gray-600">
                            <span className="truncate max-w-[45%]">P: {projectName || '---'}</span>
                            <span className="truncate max-w-[45%] text-right">C: {clientName || '---'}</span>
                        </div>

                        {/* Description & Material */}
                        <div className="flex-none mb-1">
                            <h3 className="text-[10px] font-black uppercase leading-tight truncate mb-0.5" title={piece.description}>
                                {piece.description}
                            </h3>
                            <div className="flex justify-between items-end">
                                <span className="text-[12px] font-black leading-none">
                                    {piece.width} x {piece.height}
                                </span>
                                <span className="text-[6px] font-bold text-gray-500 uppercase leading-none">
                                    {material || 'Melamina'}
                                </span>
                            </div>
                        </div>

                        {/* Main Content Area: Mapa de Cantos & Info */}
                        <div className="flex-1 flex gap-2 items-center mb-1 overflow-hidden">
                            {/* Minimized Mapa de Cantos */}
                            <div className="flex-none w-10 h-10 border border-black relative bg-white flex items-center justify-center">
                                <div className="absolute top-0 left-0 right-0 transform -translate-y-full">
                                    {piece.edgeBanding?.top === 1 && <div className="h-[1px] w-full bg-black" />}
                                    {piece.edgeBanding?.top === 2 && <div className="h-[1.5px] w-full border-t-[1.5px] border-dashed border-black" />}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 transform translate-y-full">
                                    {piece.edgeBanding?.bottom === 1 && <div className="h-[1px] w-full bg-black" />}
                                    {piece.edgeBanding?.bottom === 2 && <div className="h-[1.5px] w-full border-b-[1.5px] border-dashed border-black" />}
                                </div>
                                <div className="absolute top-0 bottom-0 left-0 transform -translate-x-full">
                                    {piece.edgeBanding?.left === 1 && <div className="w-[1px] h-full bg-black" />}
                                    {piece.edgeBanding?.left === 2 && <div className="w-[1.5px] h-full border-l-[1.5px] border-dashed border-black" />}
                                </div>
                                <div className="absolute top-0 bottom-0 right-0 transform translate-x-full">
                                    {piece.edgeBanding?.right === 1 && <div className="w-[1px] h-full bg-black" />}
                                    {piece.edgeBanding?.right === 2 && <div className="w-[1.5px] h-full border-r-[1.5px] border-dashed border-black" />}
                                </div>
                                <span className="text-[5px] font-black opacity-30">P</span>
                            </div>

                            {/* Info Column */}
                            <div className="flex-1 flex flex-col justify-center gap-0.5 pl-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[6px] text-gray-500 font-bold uppercase">Espesor:</span>
                                    <span className="text-[7px] font-black">18mm</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[6px] text-gray-500 font-bold uppercase">Sec:</span>
                                    <span className="text-[7px] font-black">{piece.globalIndex}/{expandedPieces.length}</span>
                                </div>
                                <div className="flex items-center justify-center mt-0.5 bg-black text-white py-0.5 rounded-sm">
                                    <span className="text-[12px] font-black tracking-widest leading-none">
                                        {piece.code && piece.code !== '000' && piece.code !== '00-00' ? piece.code : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}));
