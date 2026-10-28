import { useEffect } from 'react';

/**
 * Global, render-free motion:
 *  - writes --scroll (px) and --scroll-progress (0..1) on <html> every animation frame
 *    while scrolling, so CSS can drive the progress rail and parallax;
 *  - reveals any element marked data-reveal when it enters the viewport, including
 *    elements that appear later (after an API response), via a MutationObserver.
 */
export function useGlobalMotion() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty('--scroll', String(window.scrollY));
      root.style.setProperty('--scroll-progress', String(Math.min(1, window.scrollY / max)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const observeAll = () => document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((el) => io.observe(el));
    observeAll();
    const mo = new MutationObserver(() => observeAll());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
