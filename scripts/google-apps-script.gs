/**
 * Susánna’s birthday party — приём ответов анкеты в Google Таблицу.
 *
 * Как установить (подробно — docs/GOOGLE_SHEETS_SETUP.md):
 *  1. Создайте Google Таблицу → Расширения → Apps Script → вставьте этот код целиком.
 *  2. Впишите своё секретное слово в SECRET ниже и сохраните.
 *  3. Выберите функцию setup и нажмите «Выполнить» (создаст листы и формулы).
 *  4. Начать развёртывание → Веб-приложение → Выполнять от имени: «Я»,
 *     У кого есть доступ: «Все» → скопируйте URL веб-приложения.
 */

const SECRET = 'ВСТАВЬТЕ_СЮДА_СЕКРЕТНОЕ_СЛОВО';

const SHEET = 'RSVP Responses';
const HEADERS = ['Timestamp', 'Guest name', 'Will attend?', 'Total people', 'Additional guests', 'Submission ID'];

/** Однократная настройка: листы, заголовки, формулы сводки */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#8f5c66').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 1, 170); sh.setColumnWidths(2, 1, 220); sh.setColumnWidths(3, 3, 120); sh.setColumnWidths(6, 1, 280);

  const inv = ss.getSheetByName('Invited') || ss.insertSheet('Invited');
  inv.getRange('A1:B1').setValues([['Guest name', 'Responded?']]).setFontWeight('bold');
  inv.getRange('B2').setFormula("=ARRAYFORMULA(IF(A2:A=\"\",\"\",IF(COUNTIF('RSVP Responses'!B2:B,A2:A)>0,\"Да\",\"Нет\")))");
  inv.getRange('D1').setValue('Впишите имена приглашённых в столбец A — сводка покажет, кто ещё не ответил.');

  const sum = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  const rows = [
    ['Показатель', 'Значение'],
    ['Получено ответов', "=COUNTA('RSVP Responses'!B2:B)"],
    ['Подтвердили присутствие', "=COUNTIF('RSVP Responses'!C2:C,\"Да\")"],
    ['Не смогут прийти', "=COUNTIF('RSVP Responses'!C2:C,\"Нет\")"],
    ['Ожидаемое число гостей', "=SUM('RSVP Responses'!D2:D)"],
    ['Приглашено по списку', '=COUNTA(Invited!A2:A)'],
    ['Ещё не ответили', "=IF(B6=0,\"—\",SUMPRODUCT((Invited!A2:A<>\"\")*(COUNTIF('RSVP Responses'!B2:B,Invited!A2:A)=0)))"],
  ];
  sum.getRange(1, 1, rows.length, 2).setValues(rows);
  sum.getRange('A1:B1').setFontWeight('bold');
  sum.setColumnWidth(1, 240);

  // убрать пустой лист по умолчанию
  ss.getSheets().forEach(function (s) {
    if ([SHEET, 'Invited', 'Summary'].indexOf(s.getName()) === -1 && s.getLastRow() === 0 && ss.getSheets().length > 3) ss.deleteSheet(s);
  });
  ss.setActiveSheet(sh);
}

/** Приём ответа с сервера сайта */
function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ status: 'error', error: 'bad_json' });
  }
  if (data.secret !== SECRET) return out({ status: 'unauthorized' });

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return out({ status: 'error', error: 'no_spreadsheet' });
    var sh = ss.getSheetByName(SHEET);
    if (!sh) { // лист удалили или setup не запускали — создаём заново
      sh = ss.insertSheet(SHEET);
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    // проверка связи с сайта: ничего не записываем
    if (data.action === 'ping') return out({ status: 'pong', rows: Math.max(0, sh.getLastRow() - 1) });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000); // одновременные ответы записываются по очереди
    try {
      var last = sh.getLastRow();
      if (last > 1) {
        var ids = sh.getRange(2, 6, last - 1, 1).getValues().map(function (r) { return r[0]; });
        if (ids.indexOf(data.submissionId) !== -1) return out({ status: 'duplicate' });
      }
      sh.appendRow([
        String(data.timestamp), String(data.guestName), String(data.willAttend),
        Number(data.totalPeople), Number(data.additionalGuests), String(data.submissionId),
      ]);
      SpreadsheetApp.flush();
      return out({ status: 'saved' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ status: 'error', error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
