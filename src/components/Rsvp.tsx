import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { config } from '../config';
import { LIMITS, validateRsvp, type Attendance, type FieldErrors, type PeopleChoice } from '../../api/_lib/validate';
import { ArtImg, Sprig } from './Decor';

const PEOPLE: { value: PeopleChoice; short: string; full: string }[] = [
  { value: '1', short: '1', full: '1 человек — только я' },
  { value: '2', short: '2', full: '2 человека' },
  { value: '3', short: '3', full: '3 человека' },
  { value: '4', short: '4', full: '4 человека' },
  { value: '5+', short: '5+', full: '5 и более человек' },
];

const IS_PREVIEW = import.meta.env.VITE_PREVIEW === '1';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const SERVER_ERRORS: Record<string, string> = {
  not_configured: 'Анкета ещё не подключена к таблице ответов, поэтому ответ не сохранён. Пожалуйста, попробуйте позже или напишите Susánna лично.',
  storage_error: 'Не получилось сохранить ответ. Данные остались в форме — попробуйте отправить ещё раз через минуту.',
  too_many_requests: 'Слишком много попыток подряд. Подождите несколько минут и попробуйте снова.',
  network: 'Нет связи с сервером. Проверьте интернет и отправьте ещё раз — заполненные поля сохранились.',
  default: 'Ответ не сохранён из-за ошибки. Пожалуйста, попробуйте ещё раз.',
};

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p className="field-error" id={id}>
      <span className="field-error__mark" aria-hidden="true">!</span>
      <span>{msg}</span>
    </p>
  );
}

export function Rsvp() {
  const uid = useId();
  const [name, setName] = useState('');
  const [attendance, setAttendance] = useState<Attendance | ''>('');
  const [people, setPeople] = useState<PeopleChoice | ''>('');
  const [exact, setExact] = useState('');
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [result, setResult] = useState<'yes' | 'no'>('yes');
  const submissionId = useRef(newId());
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const exactRef = useRef<HTMLInputElement>(null);

  const ids = {
    name: `${uid}n`, nameErr: `${uid}ne`, attErr: `${uid}ae`, pplErr: `${uid}pe`, pplNow: `${uid}pn`,
    exact: `${uid}x`, exactErr: `${uid}xe`,
  };

  useEffect(() => { if (people === '5+') exactRef.current?.focus({ preventScroll: true }); }, [people]);
  useEffect(() => { if (status === 'done') doneRef.current?.focus(); }, [status]);

  const clear = (...keys: (keyof FieldErrors)[]) =>
    setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k as keyof FieldErrors))) : e));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (lock.current) return;
    setNotice(null);

    const payload = {
      submissionId: submissionId.current,
      name,
      attendance,
      peopleChoice: attendance === 'yes' ? people : '',
      exactPeople: attendance === 'yes' && people === '5+' ? exact : '',
      website,
    };
    const v = validateRsvp(payload, config.rsvp.maxPeople);
    if (!v.ok) {
      setErrors(v.errors);
      const first = (['name', 'attendance', 'peopleChoice', 'exactPeople'] as const).find((k) => v.errors[k]);
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setErrors({});

    if (IS_PREVIEW) {
      setNotice({ kind: 'info', text: 'Это предпросмотр: ответ никуда не отправлен. На опубликованном сайте он сохранится в Excel.' });
      return;
    }

    lock.current = true;
    setStatus('sending');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(config.rsvp.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errors?: FieldErrors };
      if (res.ok && json.ok) {
        setResult(v.data.willAttend ? 'yes' : 'no');
        setStatus('done');
        setName(''); setAttendance(''); setPeople(''); setExact('');
        submissionId.current = newId();
        return;
      }
      if (json.error === 'validation' && json.errors) setErrors(json.errors);
      setNotice({ kind: 'error', text: SERVER_ERRORS[json.error ?? ''] ?? SERVER_ERRORS.default });
      setStatus('idle');
    } catch {
      setNotice({ kind: 'error', text: SERVER_ERRORS.network });
      setStatus('idle');
    } finally {
      clearTimeout(timer);
      lock.current = false;
    }
  }

  const sending = status === 'sending';
  const chosen = PEOPLE.find((p) => p.value === people);

  return (
    <section className="section rsvp" id="rsvp" aria-labelledby="rsvp-title">
      <div className="wrap">
        <Sprig className="reveal" />
        <h2 id="rsvp-title" className="h2 reveal">{config.rsvp.title}</h2>
        <p className="lead reveal">{config.rsvp.intro}</p>

        <div className="card reveal">
          <span className="card__flower" aria-hidden="true"><ArtImg name="peony-stem" sizes="(min-width: 600px) 150px, 124px" /></span>
          {status === 'done' ? (
            <div className="done" ref={doneRef} tabIndex={-1} role="status">
              <p className="done__text">{result === 'yes' ? config.rsvp.successYes : config.rsvp.successNo}</p>
              <button type="button" className="link-btn" onClick={() => setStatus('idle')}>Заполнить анкету ещё раз</button>
            </div>
          ) : (
            <form ref={formRef} className="form" noValidate onSubmit={onSubmit} aria-busy={sending}>
              <div className="hp" aria-hidden="true">
                <label>Сайт<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
              </div>

              <div className="field">
                <label className="label" htmlFor={ids.name}>Имя и фамилия</label>
                <input
                  id={ids.name} data-field="name" className="input" type="text" name="name" autoComplete="name"
                  autoCapitalize="words" enterKeyHint="next" maxLength={LIMITS.nameMax} placeholder="Например, Анна Смирнова"
                  value={name} onChange={(e) => { setName(e.target.value); clear('name'); }}
                  aria-invalid={!!errors.name} aria-describedby={errors.name ? ids.nameErr : undefined}
                />
                <FieldError id={ids.nameErr} msg={errors.name} />
              </div>

              <fieldset className="field" aria-describedby={errors.attendance ? ids.attErr : undefined}>
                <legend className="label">Планируете прийти?</legend>
                <div className="options">
                  {([['yes', 'Да, буду'], ['no', 'К сожалению, нет']] as const).map(([val, text], i) => (
                    <label key={val} className={`option ${attendance === val ? 'is-on' : ''} ${errors.attendance ? 'is-invalid' : ''}`}>
                      <input
                        type="radio" name="attendance" value={val} checked={attendance === val}
                        data-field={i === 0 ? 'attendance' : undefined} aria-invalid={!!errors.attendance}
                        onChange={() => { setAttendance(val); clear('attendance', 'peopleChoice', 'exactPeople'); }}
                      />
                      <span className="option__dot" aria-hidden="true" />
                      <span>{text}</span>
                    </label>
                  ))}
                </div>
                <FieldError id={ids.attErr} msg={errors.attendance} />
              </fieldset>

              <div className={`unfold ${attendance === 'yes' ? 'is-open' : ''}`} aria-hidden={attendance !== 'yes'}>
                <div className="unfold__inner">
                  <fieldset className="field" disabled={attendance !== 'yes'} aria-describedby={[errors.peopleChoice ? ids.pplErr : '', ids.pplNow].join(' ').trim()}>
                    <legend className="label">Сколько человек будет с вами, включая вас?</legend>
                    <div className="count">
                      {PEOPLE.map((p, i) => (
                        <label key={p.value} className={`count__item ${people === p.value ? 'is-on' : ''} ${errors.peopleChoice ? 'is-invalid' : ''}`}>
                          <input
                            type="radio" name="people" value={p.value} checked={people === p.value} aria-label={p.full}
                            data-field={i === 0 ? 'peopleChoice' : undefined} aria-invalid={!!errors.peopleChoice}
                            onChange={() => { setPeople(p.value); clear('peopleChoice', 'exactPeople'); }}
                          />
                          <span aria-hidden="true">{p.short}</span>
                        </label>
                      ))}
                    </div>
                    <p className="count__caption" id={ids.pplNow} aria-live="polite">{chosen ? chosen.full : '1 — только я, 5+ — пять и более'}</p>
                    <FieldError id={ids.pplErr} msg={errors.peopleChoice} />

                    <div className={`unfold ${people === '5+' ? 'is-open' : ''}`} aria-hidden={people !== '5+'}>
                      <div className="unfold__inner">
                        <div className="field field--nested">
                          <label className="label" htmlFor={ids.exact}>Точное количество человек</label>
                          <input
                            ref={exactRef} id={ids.exact} data-field="exactPeople" className="input input--short"
                            type="number" inputMode="numeric" min={5} max={config.rsvp.maxPeople} step={1}
                            placeholder="Например, 6" disabled={people !== '5+'}
                            value={exact} onChange={(e) => { setExact(e.target.value); clear('exactPeople'); }}
                            aria-invalid={!!errors.exactPeople} aria-describedby={errors.exactPeople ? ids.exactErr : undefined}
                          />
                          <FieldError id={ids.exactErr} msg={errors.exactPeople} />
                        </div>
                      </div>
                    </div>
                  </fieldset>
                </div>
              </div>

              <div className="live" aria-live="assertive">
{notice && <p className={`notice notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}</div>

              <button className="btn btn--solid" type="submit" disabled={sending}>
                {sending ? (<><span className="spinner" aria-hidden="true" /> Отправляем…</>) : 'Отправить ответ'}
              </button>
              <p className="privacy">Ответы видит только Susánna</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
