import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

interface ImageLightboxProps {
    src: string;
    onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, onClose }) => {
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomRotation, setZoomRotation] = useState(0);
    const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    
    const dragStart = useRef({ x: 0, y: 0 });

    useScrollLock(true);

    // Handle ESC key to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleWheel = (e: React.WheelEvent) => {

        // Zoom 5% by 5% as requested for better speed
        // deltaY > 0 is scrolling down (zoom out), < 0 is scrolling up (zoom in)
        const zoomStep = 0.05; // 5% step
        const direction = e.deltaY < 0 ? 1 : -1;
        
        setZoomLevel(prev => {
            const next = prev + (direction * zoomStep);
            return Math.min(15, Math.max(0.05, next));
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setZoomPos({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    const reset = () => {
        setZoomLevel(1);
        setZoomRotation(0);
        setZoomPos({ x: 0, y: 0 });
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-12 bg-black/98 animate-in fade-in transition-all duration-300 backdrop-blur-2xl overflow-hidden touch-none">
            {/* Top Close Button */}
            <button 
                onClick={onClose} 
                className="absolute top-10 right-10 p-5 bg-white/10 hover:bg-white/20 text-white rounded-full z-[10001] transition-all hover:rotate-90 hover:scale-110 active:scale-95"
            >
                <X className="w-10 h-10" />
            </button>
            
            {/* Control Bar */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-8 bg-white/10 p-5 rounded-full backdrop-blur-3xl border border-white/20 z-[10001] shadow-2xl scale-110 transition-transform active:scale-100">
                <button 
                    onClick={() => setZoomLevel(prev => Math.max(0.1, prev - 0.25))} 
                    className="p-4 text-white hover:bg-white/10 rounded-full transition-all active:scale-90"
                >
                    <ZoomOut className="w-6 h-6" />
                </button>
                
                <span className="text-sm font-black text-white w-20 text-center select-none tabular-nums tracking-widest">
                    {Math.round(zoomLevel * 100)}%
                </span>
                
                <button 
                    onClick={() => setZoomLevel(prev => Math.min(10, prev + 0.25))} 
                    className="p-4 text-white hover:bg-white/10 rounded-full transition-all active:scale-90"
                >
                    <ZoomIn className="w-6 h-6" />
                </button>
                
                <button 
                    onClick={() => setZoomRotation(prev => prev + 90)} 
                    className="p-4 text-white hover:bg-white/10 rounded-full transition-all active:scale-90" 
                    title="Rotar Imagen"
                >
                    <RotateCw className="w-6 h-6" />
                </button>
                
                <button 
                    onClick={reset} 
                    className="p-4 text-white hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-[0.3em] px-8 italic"
                >
                    RESET
                </button>
            </div>

            {/* Image Canvas */}
            <div 
                className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <img 
                    src={src} 
                    alt="Voucher Zoom"
                    style={{ 
                        transform: `translate3d(${zoomPos.x}px, ${zoomPos.y}px, 0) scale(${zoomLevel}) rotate(${zoomRotation}deg)`, 
                        transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        willChange: 'transform',
                        cursor: isDragging ? 'grabbing' : 'grab'
                    }} 
                    className="max-w-[75vw] max-h-[75vh] object-contain shadow-[0_0_150px_rgba(0,0,0,0.6)] rounded-2xl pointer-events-none border border-white/10" 
                />
            </div>
        </div>,
        document.body
    );
};
