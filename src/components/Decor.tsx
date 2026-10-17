/**
 * Оригинальные цветочные иллюстрации заказчицы (public/art/*.webp, см. scripts/prepare-art.py).
 * Используются только целиком: гирлянда пионов и пион на стебле.
 */
export const ART = {
  garland: { w: [1536, 860, 560], ratio: 768 / 1536 },
  'peony-stem': { w: [640, 360], ratio: 1280 / 640 },
} as const;

export type ArtName = keyof typeof ART;

/** В однофайловом предпросмотре картинки встроены как data-URI (window.__ART__) */
const artUrl = (file: string) =>
  (import.meta.env.VITE_PREVIEW === '1' && (window as unknown as { __ART__?: Record<string, string> }).__ART__?.[file]) || `/art/${file}`;

export function ArtImg({ name, sizes, lazy = true, className = '' }: { name: ArtName; sizes: string; lazy?: boolean; className?: string }) {
  const a = ART[name];
  const smallest = a.w[a.w.length - 1];
  return (
    <img
      className={className}
      src={artUrl(`${name}-${smallest}.webp`)}
      srcSet={a.w.map((w) => `${artUrl(`${name}-${w}.webp`)} ${w}w`).join(', ')}
      sizes={sizes}
      width={a.w[0]}
      height={Math.round(a.w[0] * a.ratio)}
      alt=""
      aria-hidden="true"
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      draggable={false}
    />
  );
}

/** Декоративный слой с параллаксом: обёртка неподвижна, двигается только картинка внутри */
export function Art({
  name, sizes, className = '', speed = 0.05, drift = 0, rot = 0, lazy = true,
}: { name: ArtName; sizes: string; className?: string; speed?: number; drift?: number; rot?: number; lazy?: boolean }) {
  return (
    <div className={`art ${className}`} data-speed={speed} data-drift={drift || undefined} data-rot={rot || undefined} aria-hidden="true">
      <ArtImg name={name} sizes={sizes} lazy={lazy} />
    </div>
  );
}

/**
 * Пион на стебле, лежащий горизонтально между секциями: цветок виден целиком,
 * стебель уходит за край экрана. side — с какой стороны выходит стебель.
 * Блок стоит в потоке страницы, поэтому никогда не перекрывает текст.
 */
export function StemDivider({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`stem-divider stem-divider--${side}`} aria-hidden="true">
      <Art name="peony-stem" sizes="(min-width: 900px) 170px, 140px" className="stem-divider__art" speed={0.03} />
    </div>
  );
}

/** Тонкий орнамент над заголовками секций */
export function Sprig({ className = '' }: { className?: string }) {
  return <span className={`ornament ${className}`} aria-hidden="true" />;
}
