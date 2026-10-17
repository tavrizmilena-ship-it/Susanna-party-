/**
 * Лёгкий параллакс и появление секций без сторонних библиотек.
 *
 * Параллакс: элементы с атрибутом data-speed (на обёртке) двигают свой первый дочерний
 * элемент через transform. Позиции измеряются один раз (и при изменении размеров),
 * во время прокрутки — только арифметика и запись transform в requestAnimationFrame.
 *
 *   data-speed  — смещение по вертикали на 1px расстояния до центра экрана (например 0.08 или -0.05)
 *   data-drift  — смещение по горизонтали (необязательно)
 *   data-rot    — поворот в градусах на 100px (необязательно)
 */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function lowPowerDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData;
}

interface Item {
  wrap: HTMLElement;
  inner: HTMLElement;
  speed: number;
  drift: number;
  rot: number;
  center: number;
  visible: boolean;
}

export function initParallax(root: ParentNode = document): () => void {
  if (reducedMotion() || lowPowerDevice()) {
    document.documentElement.classList.add('no-parallax');
    return () => {};
  }

  const items: Item[] = Array.from(root.querySelectorAll<HTMLElement>('[data-speed]'))
    .filter((wrap) => wrap.firstElementChild instanceof HTMLElement || wrap.firstElementChild instanceof SVGElement)
    .map((wrap) => ({
      wrap,
      inner: wrap.firstElementChild as HTMLElement,
      speed: Number(wrap.dataset.speed) || 0,
      drift: Number(wrap.dataset.drift) || 0,
      rot: Number(wrap.dataset.rot) || 0,
      center: 0,
      visible: false,
    }));
  if (!items.length) return () => {};

  // На узких экранах движение чуть скромнее
  let scale = 1;
  let vh = window.innerHeight;
  let frame = 0;

  const measure = () => {
    vh = window.innerHeight;
    scale = window.innerWidth < 600 ? 0.75 : 1;
    const sy = window.scrollY;
    for (const it of items) {
      const r = it.wrap.getBoundingClientRect();
      it.center = r.top + sy + r.height / 2;
    }
    update();
  };

  const update = () => {
    frame = 0;
    const mid = window.scrollY + vh / 2;
    for (const it of items) {
      if (!it.visible) continue;
      const delta = Math.max(-vh * 1.2, Math.min(vh * 1.2, it.center - mid));
      const y = -delta * it.speed * scale;
      const x = -delta * it.drift * scale;
      const r = (-delta / 100) * it.rot;
      it.inner.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${r ? ` rotate(${r.toFixed(2)}deg)` : ''}`;
    }
  };

  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const it = items.find((i) => i.wrap === e.target);
        if (it) it.visible = e.isIntersecting;
      }
      onScroll();
    },
    { rootMargin: '25% 0px 25% 0px' },
  );
  items.forEach((it) => io.observe(it.wrap));

  // Пересчитываем позиции, если высота страницы изменилась (например, раскрылись поля анкеты)
  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 120);
  });
  ro.observe(document.body);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  measure();

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    io.disconnect();
    ro.disconnect();
    cancelAnimationFrame(frame);
  };
}

/** Плавное появление блоков с классом .reveal при входе в область видимости */
export function initReveal(root: ParentNode = document): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
