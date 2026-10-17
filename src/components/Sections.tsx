import type { CSSProperties } from 'react';
import { config, formatDate, monthName } from '../config';
import { Art, Sprig } from './Decor';

const d = (s: number) => ({ ['--d' as string]: `${s}s` }) as CSSProperties;

export function Hero() {
  const letters = Array.from(config.titleName);
  return (
    <header className="hero" aria-labelledby="title">
      <Art name="garland" sizes="(min-width: 900px) 1000px, (min-width: 600px) 900px, 160vw" className="hero__crown" speed={0.08} lazy={false} />

      <div className="hero__grid">
        <div className="hero__text">
          <p className="eyebrow intro" style={d(0.1)}>приглашение · {formatDate()}</p>
          <h1 id="title" className="title" aria-label={config.title}>
            <span className="title__name" aria-hidden="true">
              {letters.map((ch, i) => (
                <span key={i} className="title__ch" style={d(0.25 + i * 0.055)}>{ch}</span>
              ))}
            </span>
            <span className="title__rest intro" style={d(0.85)} aria-hidden="true">{config.titleRest}</span>
          </h1>
          <p className="hero__intro intro" style={d(1.15)}>{config.intro}</p>
          <p className="hero__date intro" style={d(1.3)}>
            <span className="hero__day">{config.date.day}</span>
            <span className="hero__month">{monthName()}</span>
          </p>
        </div>

        <figure className="hero__figure">
          <span className="hero__twenty" aria-hidden="true">{config.age}</span>
          <div className="hero__photo" data-speed="0.03">
            <img
              src="/img/susanna-710.webp"
              srcSet="/img/susanna-460.webp 460w, /img/susanna-710.webp 710w"
              sizes="(min-width: 900px) 360px, 74vw"
              width={710}
              height={1575}
              alt={`${config.name} в белом наряде с открытым плечом оглядывается через плечо`}
              decoding="async"
              {...{ fetchpriority: 'high' }}
            />
          </div>
          <Art name="peony-stem" sizes="(min-width: 900px) 170px, 150px" className="hero__corner" speed={0.015} />
          <figcaption className="hero__caption">{config.name}, {config.age}</figcaption>
        </figure>
      </div>

      <a className="scroll-cue" href="#when">
        <span className="scroll-cue__line" aria-hidden="true" />
        <span>листайте</span>
      </a>
    </header>
  );
}

export function When() {
  return (
    <section className="section when" id="when" aria-labelledby="when-title">
      <div className="wrap">
        <Sprig className="reveal" />
        <h2 id="when-title" className="h2 reveal">{config.schedule.title}</h2>
        <div className="when__date reveal" style={d(0.1)}>
          <span className="when__day">{config.date.day}</span>
          <span className="when__month">
            {monthName()}
            {config.date.year && <span className="when__year">{config.date.year}</span>}
          </span>
        </div>
        <dl className="when__list">
          {config.schedule.items.map((it, i) => (
            <div key={it.time} className="when__row reveal" style={d(0.2 + i * 0.12)}>
              <dt><time>{it.time}</time></dt>
              <dd>{it.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function DressCode() {
  const c = config.dressCode;
  return (
    <section className="section dress" aria-labelledby="dress-title">
      <div className="wrap">
        <Sprig className="reveal" />
        <h2 id="dress-title" className="h2 reveal">{c.title}</h2>
        <p className="lead reveal">{c.text}</p>
        <ul className="palette reveal" aria-label="Палитра вечера">
          {c.swatches.map((s, i) => (
            <li key={s.hex} className="swatch" style={{ ['--c' as string]: s.hex, ...d(i * 0.07) }}>
              <span className="sr-only">{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Venue() {
  const v = config.venue;
  return (
    <section className="section venue" aria-labelledby="venue-title">
      <div className="wrap">
        <Sprig className="reveal" />
        <h2 id="venue-title" className="h2 reveal">{v.title}</h2>
        <div className="cartouche reveal">
          <address className="venue__address">
            {v.address.split(' (')[0]}
            {v.address.includes(' (') && <span className="venue__aside"> ({v.address.split(' (')[1]}</span>}
          </address>
        </div>
        <a className="btn btn--line reveal" href={v.mapUrl} target="_blank" rel="noopener noreferrer">
          Перейти к карте <span aria-hidden="true">↗</span>
        </a>
        <p className="note reveal">{v.mapNote}</p>
      </div>
    </section>
  );
}

export function Colophon() {
  const c = config.colophon;
  return (
    <footer className="colophon">
      
      <div className="wrap">
        <Art name="garland" sizes="(min-width: 900px) 420px, 300px" className="colophon__garland" speed={0.03} />
        <span className="colophon__rule" aria-hidden="true" />
        <p className="colophon__text">{c.text}</p>
        <a className="colophon__link" href={c.url} target="_blank" rel="noopener noreferrer">
          {c.linkText} <span aria-hidden="true">↗</span>
        </a>
        <p className="colophon__meta">{config.title} · {formatDate()}</p>
      </div>
    </footer>
  );
}
