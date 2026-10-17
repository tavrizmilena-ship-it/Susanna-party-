import { describe, expect, it } from 'vitest';
import { validateRsvp, excelSafe, cleanText } from '../api/_lib/validate';
import { buildRow, COLUMNS } from '../api/_lib/excel';

const base = { submissionId: '3f2b9c1e-1111-4a2b-9c3d-123456789abc', name: 'Анна Смирнова' };

describe('validateRsvp', () => {
  it('требует имя и выбор ответа', () => {
    const r = validateRsvp({ ...base, name: ' ', attendance: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBeTruthy();
      expect(r.errors.attendance).toBeTruthy();
    }
  });

  it('«Да» без количества — ошибка', () => {
    const r = validateRsvp({ ...base, attendance: 'yes', peopleChoice: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.peopleChoice).toBeTruthy();
  });

  it.each([['1', 1], ['2', 2], ['3', 3], ['4', 4]] as const)('вариант %s → %i человек', (choice, total) => {
    const r = validateRsvp({ ...base, attendance: 'yes', peopleChoice: choice });
    expect(r.ok && r.data.totalPeople).toBe(total);
    expect(r.ok && r.data.additionalGuests).toBe(total - 1);
  });

  it('«5 и более» требует точное число не меньше 5', () => {
    expect(validateRsvp({ ...base, attendance: 'yes', peopleChoice: '5+', exactPeople: '' }).ok).toBe(false);
    expect(validateRsvp({ ...base, attendance: 'yes', peopleChoice: '5+', exactPeople: '4' }).ok).toBe(false);
    expect(validateRsvp({ ...base, attendance: 'yes', peopleChoice: '5+', exactPeople: '2.5' }).ok).toBe(false);
    expect(validateRsvp({ ...base, attendance: 'yes', peopleChoice: '5+', exactPeople: '999' }).ok).toBe(false);
    const r = validateRsvp({ ...base, attendance: 'yes', peopleChoice: '5+', exactPeople: '7' });
    expect(r.ok && r.data.totalPeople).toBe(7);
    expect(r.ok && r.data.additionalGuests).toBe(6);
  });

  it('отказ всегда даёт 0 человек, даже если количество было выбрано', () => {
    const r = validateRsvp({ ...base, attendance: 'no', peopleChoice: '3' });
    expect(r.ok && r.data.totalPeople).toBe(0);
    expect(r.ok && r.data.additionalGuests).toBe(0);
  });

  it('чистит лишние пробелы и управляющие символы в имени', () => {
    expect(cleanText('  Анна \u0000  Смирнова\n', 100)).toBe('Анна Смирнова');
  });
});

describe('Excel', () => {
  it('нейтрализует формулы', () => {
    expect(excelSafe('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(excelSafe('+7 999')).toBe("'+7 999");
    expect(excelSafe('Анна')).toBe('Анна');
  });

  it('строка соответствует столбцам таблицы', () => {
    const r = validateRsvp({ ...base, attendance: 'yes', peopleChoice: '2' });
    if (!r.ok) throw new Error('invalid');
    const row = buildRow(r.data, new Date('2026-10-20T12:00:00Z'), 'Europe/Moscow');
    expect(COLUMNS).toEqual(['Timestamp', 'Guest name', 'Will attend?', 'Total people', 'Additional guests', 'Submission ID']);
    expect(row).toEqual(['2026-10-20 15:00:00', 'Анна Смирнова', 'Да', 2, 1, base.submissionId]);
  });
});
