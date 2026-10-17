import { useEffect } from 'react';
import { Colophon, DressCode, Hero, Venue, When } from './components/Sections';
import { Rsvp } from './components/Rsvp';
import { StemDivider } from './components/Decor';
import { initParallax, initReveal } from './lib/motion';

export default function App() {
  useEffect(() => {
    if (import.meta.env.VITE_PREVIEW === '1') document.documentElement.classList.add('is-preview');
    const stopReveal = initReveal();
    const stopParallax = initParallax();
    return () => { stopReveal(); stopParallax(); };
  }, []);

  return (
    <div className="page">
      {import.meta.env.VITE_PREVIEW === '1' && <p className="preview-badge">Предпросмотр</p>}
      <Hero />
      <main>
        <When />
        <StemDivider side="right" />
        <DressCode />
        <StemDivider side="left" />
        <Venue />
        <Rsvp />
      </main>
      <Colophon />
    </div>
  );
}
