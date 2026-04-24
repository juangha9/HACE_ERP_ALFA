import { useState, type ReactNode } from 'react';

interface AccordionCardProps {
    title: string;
    icon: string;
    children: ReactNode;
    defaultOpen?: boolean;
}

export function AccordionCard({ title, icon, children, defaultOpen = false }: AccordionCardProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white rounded-[2rem] shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] border border-slate-100/50 overflow-hidden transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-8 text-left hover:bg-slate-50/50 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isOpen ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        <span className="material-symbols-outlined text-2xl">{icon}</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">{title}</h2>
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 bg-slate-100 text-slate-600' : ''}`}>
                    <span className="material-symbols-outlined">expand_more</span>
                </div>
            </button>

            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="p-8 pt-0">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
