import { useEffect, useState } from 'react';

/**
 * Tracks the visual viewport so the layout can shrink when a mobile keyboard
 * opens. Writes --app-h (usable height in px) on <html> and returns whether a
 * keyboard appears to be covering a substantial part of the screen.
 */
export function useKeyboardInset(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
      const coarse = matchMedia('(pointer: coarse)').matches;
      setOpen(coarse && h < window.innerHeight * 0.8 - 40 ? true : coarse && !!vv && vv.height < screen.height * 0.6);
      // Prevent the browser from scrolling the whole page under the keyboard.
      if (vv && vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return open;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}
