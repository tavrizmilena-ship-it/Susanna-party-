/**
 * Валидация анкеты. Используется и на сервере (обязательно), и в браузере (для подсказок).
 * Не содержит зависимостей от Node.js.
 */

export type Attendance = 'yes' | 'no';
export type PeopleChoice = '1' | '2' | '3' | '4' | '5+';

export interface RsvpInput {
  submissionId: string;
  name: string;
  attendance: Attendance | '';
  peopleChoice: PeopleChoice | '';
  exactPeople: string;
  /** Скрытое поле-ловушка для ботов. Люди его не видят и не заполняют. */
  website?: string;
}

export interface RsvpClean {
  submissionId: string;
  name: string;
  willAttend: boolean;
  totalPeople: number;
  additionalGuests: number;
}

export type FieldErrors = Partial<Record<'name' | 'attendance' | 'peopleChoice' | 'exactPeople', string>>;

export const LIMITS = { nameMax: 100, maxPeople: 30 } as const;

/** Убираем управляющие символы и лишние пробелы */
export function cleanText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC');
  s = multiline
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
    : s.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, ' ');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  return s.slice(0, max);
}

const UUID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function validateRsvp(raw: Partial<RsvpInput>, maxPeople: number = LIMITS.maxPeople):
  { ok: true; data: RsvpClean } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const name = cleanText(raw.name, LIMITS.nameMax + 1);
  if (name.length < 2) errors.name = 'Пожалуйста, укажите имя и фамилию.';
  else if (name.length > LIMITS.nameMax) errors.name = `Имя слишком длинное — не больше ${LIMITS.nameMax} символов.`;

  const attendance = raw.attendance;
  if (attendance !== 'yes' && attendance !== 'no') errors.attendance = 'Пожалуйста, выберите один из вариантов.';

  let totalPeople = 0;
  if (attendance === 'yes') {
    const choice = raw.peopleChoice;
    if (choice === '1' || choice === '2' || choice === '3' || choice === '4') {
      totalPeople = Number(choice);
    } else if (choice === '5+') {
      const exact = String(raw.exactPeople ?? '').trim();
      const n = /^\d{1,3}$/.test(exact) ? Number(exact) : NaN;
      if (!exact) errors.exactPeople = 'Укажите точное количество человек, включая вас.';
      else if (!Number.isInteger(n) || n < 5) errors.exactPeople = 'Для варианта «5 и более» укажите число от 5.';
      else if (n > maxPeople) errors.exactPeople = `Если вас больше ${maxPeople}, пожалуйста, напишите Susánna лично.`;
      else totalPeople = n;
    } else {
      errors.peopleChoice = 'Пожалуйста, выберите, сколько вас будет.';
    }
  }

  const submissionId = typeof raw.submissionId === 'string' && UUID_RE.test(raw.submissionId) ? raw.submissionId : '';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      submissionId,
      name,
      willAttend: attendance === 'yes',
      totalPeople,
      additionalGuests: Math.max(0, totalPeople - 1),
    },
  };
}

/**
 * Защита от «формул» в Excel: строка, начинающаяся с = + - @ (и табуляции),
 * может быть воспринята как формула. Апостроф заставляет Excel хранить её как текст.
 */
export function excelSafe(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
