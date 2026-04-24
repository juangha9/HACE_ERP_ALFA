import { useEffect } from 'react';

// Global registry for scroll locks to prevent overlapping components from corrupting the cached original styles
let lockCount = 0;
let originalBodyStyle = '';
let originalHtmlStyle = '';
let originalMainScrollStyle = '';
let originalRootStyle = '';

export const useScrollLock = (lock: boolean) => {
    useEffect(() => {
        if (!lock) return;

        const mainScroll = document.getElementById('main-scroll-container');
        const rootEl = document.getElementById('root');

        if (lockCount === 0) {
            originalBodyStyle = document.body.style.overflow;
            originalHtmlStyle = document.documentElement.style.overflow;
            originalMainScrollStyle = mainScroll?.style.overflow || '';
            originalRootStyle = rootEl?.style.overflow || '';
            
            document.body.style.setProperty('overflow', 'hidden', 'important');
            document.documentElement.style.setProperty('overflow', 'hidden', 'important');
            if (mainScroll) mainScroll.style.setProperty('overflow', 'hidden', 'important');
            if (rootEl) rootEl.style.setProperty('overflow', 'hidden', 'important');
        }
        
        lockCount++;

        return () => {
            lockCount--;
            // Ensure lockCount never goes below 0 due to unexpected unmounts
            if (lockCount <= 0) {
                lockCount = 0;
                document.body.style.overflow = originalBodyStyle;
                document.documentElement.style.overflow = originalHtmlStyle;
                if (mainScroll) mainScroll.style.overflow = originalMainScrollStyle;
                if (rootEl) rootEl.style.overflow = originalRootStyle;
            }
        };
    }, [lock]);
};
