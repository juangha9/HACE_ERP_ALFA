
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    format, 
    addMonths, 
    subMonths, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    isWithinInterval, 
    differenceInDays,
    isBefore,
    isAfter,
    parseISO
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface RangeDatePickerProps {
    isOpen: boolean;
    startDate: string;
    endDate: string;
    onApply: (start: string, end: string) => void;
    onCancel: () => void;
    align?: 'left' | 'right';
    triggerRef?: React.RefObject<HTMLElement>;
}

export const RangeDatePicker: React.FC<RangeDatePickerProps> = ({ isOpen, startDate, endDate, onApply, onCancel, align = 'right', triggerRef }) => {
    const [leftMonthDate, setLeftMonthDate] = useState(new Date(startDate || Date.now()));
    const [rightMonthDate, setRightMonthDate] = useState(addMonths(new Date(startDate || Date.now()), 1));
    const [selectionStart, setSelectionStart] = useState<Date | null>(startDate ? new Date(startDate + 'T12:00:00') : null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(endDate ? new Date(endDate + 'T12:00:00') : null);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    const leftRef = useRef<HTMLDivElement>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (!triggerRef?.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const base: React.CSSProperties = { position: 'fixed', top: rect.bottom + 8, zIndex: 9999 };
        setPortalStyle(align === 'right'
            ? { ...base, right: window.innerWidth - rect.right }
            : { ...base, left: rect.left });
    }, [isOpen, triggerRef, align]);

    const handleDayClick = (day: Date, side: 'left' | 'right') => {
        if (!selectionStart && !selectionEnd) {
            if (side === 'left') setSelectionStart(day);
            else setSelectionEnd(day);
            return;
        }

        if (selectionStart && selectionEnd) {
            if (isAfter(day, selectionStart)) {
                setSelectionEnd(day);
            } else {
                setSelectionStart(day);
            }
            return;
        }

        if (selectionStart) {
            if (isAfter(day, selectionStart)) {
                setSelectionEnd(day);
            } else {
                setSelectionStart(day);
            }
            return;
        }

        if (selectionEnd) {
            if (isBefore(day, selectionEnd)) {
                setSelectionStart(day);
            } else {
                setSelectionEnd(day);
            }
        }
    };

    const handleDayDoubleClick = (day: Date) => {
        setSelectionStart(day);
        setSelectionEnd(day);
    };

    useEffect(() => {
        const handleNativeScroll = (side: 'left' | 'right', e: WheelEvent) => {
            if (!isOpen) return;
            e.preventDefault();
            e.stopPropagation();

            const deltaY = e.deltaY;
            const target = e.target as HTMLElement;
            const isGrid = target.closest('.calendar-grid-container');

            if (isGrid) {
                const delta = deltaY > 0 ? 7 : -7;
                const setter = side === 'left' ? setLeftMonthDate : setRightMonthDate;
                setter(prev => {
                    const next = new Date(prev);
                    next.setDate(next.getDate() + delta);
                    return next;
                });
            } else {
                const delta = deltaY > 0 ? 1 : -1;
                const setter = side === 'left' ? setLeftMonthDate : setRightMonthDate;
                setter(prev => addMonths(prev, delta));
            }
        };

        const leftEl = leftRef.current;
        const rightEl = rightRef.current;

        const onLeftWheel = (e: WheelEvent) => handleNativeScroll('left', e);
        const onRightWheel = (e: WheelEvent) => handleNativeScroll('right', e);

        if (leftEl) leftEl.addEventListener('wheel', onLeftWheel, { passive: false });
        if (rightEl) rightEl.addEventListener('wheel', onRightWheel, { passive: false });

        return () => {
            if (leftEl) leftEl.removeEventListener('wheel', onLeftWheel);
            if (rightEl) rightEl.removeEventListener('wheel', onRightWheel);
        };
    }, [isOpen]);

    const getDaysForMonth = (ref: Date) => {
        const start = startOfWeek(ref, { weekStartsOn: 1 });
        const end = new Date(start);
        end.setDate(start.getDate() + 41);
        return eachDayOfInterval({ start, end });
    };

    const isInRange = (day: Date) => {
        if (selectionStart && selectionEnd) {
            return isWithinInterval(day, { start: selectionStart, end: selectionEnd });
        }
        if (selectionStart && hoverDate) {
            const start = isBefore(hoverDate, selectionStart) ? hoverDate : selectionStart;
            const end = isBefore(hoverDate, selectionStart) ? selectionStart : hoverDate;
            return isWithinInterval(day, { start, end });
        }
        return false;
    };

    const isSelectedStart = (day: Date) => selectionStart && isSameDay(day, selectionStart);
    const isSelectedEnd = (day: Date) => selectionEnd && isSameDay(day, selectionEnd);

    const rangeInfo = useMemo(() => {
        if (selectionStart && selectionEnd) {
            const days = differenceInDays(selectionEnd, selectionStart) + 1;
            const quarter = Math.floor(selectionStart.getMonth() / 3) + 1;
            if (days === 1) {
                return `Día: ${format(selectionStart, 'dd/MM/yyyy')} | ${quarter}T`;
            }
            return `Rango: ${days} días | ${quarter}T`;
        }
        return "Seleccione rango";
    }, [selectionStart, selectionEnd]);

    const pickerNode = (
        <div
            className={`${triggerRef ? '' : `absolute top-full ${align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'} mt-3 z-[200] `}bg-white/95 backdrop-blur-2xl rounded-[24px] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-white/60 transition-all duration-200 w-[480px]
                ${isOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'}
            `}
            style={triggerRef ? portalStyle : undefined}
        >
            <div className="flex gap-6">
                {/* Left Calendar */}
                <div className="flex-1" ref={leftRef}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[12px] font-black text-[#2c3434] capitalize">
                            {format(leftMonthDate, 'MMMM yyyy', { locale: es })}
                        </h3>
                        <div className="flex gap-1">
                            <button onClick={() => setLeftMonthDate(prev => subMonths(prev, 1))} className="p-1 hover:bg-white/50 rounded-full transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            <button onClick={() => setLeftMonthDate(prev => addMonths(prev, 1))} className="p-1 hover:bg-white/50 rounded-full transition-colors">
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <div className="calendar-grid-container">
                        <CalendarGrid 
                            days={getDaysForMonth(leftMonthDate)} 
                            referenceDate={leftMonthDate}
                            onDayClick={(day) => handleDayClick(day, 'left')}
                            onDayDoubleClick={handleDayDoubleClick}
                            onDayHover={setHoverDate}
                            isInRange={isInRange}
                            isSelectedStart={isSelectedStart}
                            isSelectedEnd={isSelectedEnd}
                        />
                    </div>
                </div>

                {/* Right Calendar */}
                <div className="flex-1" ref={rightRef}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[12px] font-black text-[#2c3434] capitalize">
                            {format(rightMonthDate, 'MMMM yyyy', { locale: es })}
                        </h3>
                        <div className="flex gap-1">
                            <button onClick={() => setRightMonthDate(prev => subMonths(prev, 1))} className="p-1 hover:bg-white/50 rounded-full transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            <button onClick={() => setRightMonthDate(prev => addMonths(prev, 1))} className="p-1 hover:bg-white/50 rounded-full transition-colors">
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <div className="calendar-grid-container">
                        <CalendarGrid 
                            days={getDaysForMonth(rightMonthDate)} 
                            referenceDate={rightMonthDate}
                            onDayClick={(day) => handleDayClick(day, 'right')}
                            onDayDoubleClick={handleDayDoubleClick}
                            onDayHover={setHoverDate}
                            isInRange={isInRange}
                            isSelectedStart={isSelectedStart}
                            isSelectedEnd={isSelectedEnd}
                        />
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#366480] font-bold text-[10px] opacity-70">
                    <Info className="w-3 h-3 text-[#4A90E2]" />
                    {rangeInfo}
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-500 font-black text-[11px] hover:text-slate-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        disabled={!selectionStart || !selectionEnd}
                        onClick={() => {
                            if (selectionStart && selectionEnd) {
                                onApply(format(selectionStart, 'yyyy-MM-dd'), format(selectionEnd, 'yyyy-MM-dd'));
                            }
                        }}
                        className="px-6 py-2 bg-[#356d90] text-white rounded-xl text-[11px] font-black shadow-lg shadow-blue-900/10 hover:bg-[#244c66] transition-all disabled:opacity-50 active:scale-95"
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );

    if (triggerRef) {
        return createPortal(pickerNode, document.body);
    }
    return pickerNode;
};

interface CalendarGridProps {
    days: Date[];
    referenceDate: Date;
    onDayClick: (day: Date) => void;
    onDayDoubleClick: (day: Date) => void;
    onDayHover: (day: Date | null) => void;
    isInRange: (day: Date) => boolean;
    isSelectedStart: (day: Date) => boolean;
    isSelectedEnd: (day: Date) => boolean;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({ 
    days, referenceDate, onDayClick, onDayDoubleClick, onDayHover, isInRange, isSelectedStart, isSelectedEnd 
}) => {
    const weekdays = ['lu', 'ma', 'mi', 'ju', 'vi', 'sa', 'do'];

    return (
        <div className="grid grid-cols-7 gap-y-0.5">
            {weekdays.map(d => (
                <div key={d} className="text-center text-[9px] font-black text-slate-300 uppercase mb-2">{d}</div>
            ))}
            {days.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, referenceDate);
                const isStart = isSelectedStart(day);
                const isEnd = isSelectedEnd(day);
                const isRange = isInRange(day);

                return (
                    <div 
                        key={idx}
                        className={`relative h-7 flex items-center justify-center cursor-pointer group transition-all
                            ${!isCurrentMonth ? 'opacity-60' : ''}
                            ${isRange && !isStart && !isEnd ? 'bg-[#bae6fd]/40' : ''}
                            ${isStart && isEnd ? 'z-10' : isStart ? 'bg-[#244c66] rounded-l-full z-10' : isEnd ? 'bg-[#244c66] rounded-r-full z-10' : ''}
                        `}
                        onClick={() => onDayClick(day)}
                        onDoubleClick={() => onDayDoubleClick(day)}
                        onMouseEnter={() => onDayHover(day)}
                        onMouseLeave={() => onDayHover(null)}
                    >
                        {isStart && isEnd && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-7 h-7 bg-[#244c66] rounded-full z-10 shadow-sm" />
                            </div>
                        )}
                        <span className={`text-[10px] font-bold z-20 
                            ${(isStart || isEnd) ? 'text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}
                        `}>
                            {format(day, 'd')}
                        </span>
                        
                        {isRange && !isStart && !isEnd && (
                            <div className="absolute inset-0 bg-[#bae6fd]/40 -z-10" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
