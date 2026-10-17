# Подключение анкеты к Excel

Сайт сам по себе **не хранит** ответы: серверная функция `/api/rsvp` проверяет анкету и
передаёт строку в Excel. Пока интеграция не настроена, гость увидит честное сообщение
«Анкета пока не подключена к таблице…», а **не** ложное «Спасибо».

Как идут данные:

```
Телефон гостя ──► https://ваш-сайт/api/rsvp  (Vercel, проверка данных, секреты)
                        │
                        ▼
        Power Automate  или  Microsoft Graph
                        │
                        ▼
  OneDrive: Susanna_Birthday_Party_RSVP.xlsx → таблица «RSVP» → новая строка
```

Гости видят только сайт. Адрес потока, секрет и токены лежат в переменных окружения
Vercel и в браузер не попадают. Сам файл Excel никогда не публикуется на сайте.

---

## Шаг 0. Файл Excel

Готовый файл — `excel/Susanna_Birthday_Party_RSVP.xlsx`. Пересобрать его можно командой
`python3 scripts/build_excel_template.py`.

| Лист | Что внутри |
|---|---|
| **RSVP Responses** | Таблица Excel `RSVP`: Timestamp (дата и время) · Guest name (имя) · Will attend? (Да/Нет) · Total people (всего человек) · Additional guests (дополнительные гости) · Submission ID |
| **Summary** | Формулы: число ответов, сколько придут, сколько не смогут, ожидаемое число гостей, сколько ещё не ответили |
| **Invited** | Необязательный список приглашённых. Если его заполнить, в Summary появится «Ещё не ответили» |

`Submission ID` — служебный столбец, нужен для защиты от дублей. Его можно скрыть, но
**не удаляйте и не переименовывайте** ни его, ни остальные заголовки, ни таблицу `RSVP`.

Загрузите файл в **OneDrive for Business** или в библиотеку документов **SharePoint** (папка, например, `Susánna party`). Для Power Automate файл должен лежать именно там — с личного OneDrive коннектор Excel Online (Business) не работает.

---

## Вариант A (рекомендуется): Power Automate

**Что нужно:** рабочая или учебная учётная запись Microsoft 365 и доступ к
**Power Automate Premium** (или пробный период). Триггер *When an HTTP request is received*
относится к премиум-коннекторам. С личной учётной записью outlook.com / hotmail
Power Automate недоступен — в этом случае используйте вариант B.

### 1. Придумайте секрет

Длинная случайная строка, например результат команды `openssl rand -hex 24`.
Это значение для `RSVP_SHARED_SECRET`.

### 2. Создайте поток

make.powerautomate.com → **Create → Instant cloud flow** → «Skip» → добавьте триггер
**Request → When an HTTP request is received**.

- *Who can trigger the flow?* → **Anyone** (защиту обеспечивают подпись в адресе и наш секрет).
- *Request Body JSON Schema* — вставьте:

```json
{
  "type": "object",
  "properties": {
    "timestamp": { "type": "string" },
    "guestName": { "type": "string" },
    "willAttend": { "type": "string" },
    "totalPeople": { "type": "integer" },
    "additionalGuests": { "type": "integer" },
    "submissionId": { "type": "string" }
  },
  "required": ["timestamp", "guestName", "willAttend", "totalPeople", "additionalGuests", "submissionId"]
}
```

- В **Settings** триггера включите **Concurrency control** и задайте **Degree of parallelism = 1**.
  Тогда одновременные анкеты записываются строго по очереди, а проверка дублей надёжна.

### 3. Проверка секрета

**Condition**: слева выражение `triggerOutputs()?['headers']?['x-rsvp-secret']`,
оператор *is equal to*, справа — ваш секрет.

- **If no** → действие **Response**: Status Code `401`, Body `{"status":"unauthorized"}`.

### 4. Защита от дублей (ветка *If yes*)

1. **Excel Online (Business) → List rows present in a table**: Location *OneDrive for Business*,
   File — ваш файл, Table — `RSVP`. В Settings действия включите **Pagination** (порог 5000).
2. **Data Operation → Filter array**: From — `value` из предыдущего шага;
   условие `item()?['Submission ID']` *is equal to* `triggerBody()?['submissionId']`.
3. **Condition**: `length(body('Filter_array'))` *is greater than* `0`.
   - **If yes** → **Response** 200, Body `{"status":"duplicate"}`.
   - **If no** → шаги 5–6.

### 5. Добавление строки

**Excel Online (Business) → Add a row into a table** (тот же файл и таблица `RSVP`):

| Столбец | Значение (Dynamic content) |
|---|---|
| Timestamp | `timestamp` |
| Guest name | `guestName` |
| Will attend? | `willAttend` |
| Total people | `totalPeople` |
| Additional guests | `additionalGuests` |
| Submission ID | `submissionId` |

### 6. Подтверждение записи

После «Add a row» — **Response**: Status Code `200`, Body `{"status":"saved"}`.

Сайт считает ответ сохранённым **только** если пришло `200` и `"status": "saved"` или
`"duplicate"`. Если Excel вернул ошибку, поток падает раньше Response — гость увидит
«Не получилось сохранить ответ…», и его данные останутся в форме.

### 7. Подключите к сайту

Сохраните поток, скопируйте **HTTP POST URL** из триггера и задайте переменные
окружения в Vercel (Project → Settings → Environment Variables, окружение *Production*):

```
EXCEL_DRIVER=power-automate
POWER_AUTOMATE_URL=<скопированный адрес>
RSVP_SHARED_SECRET=<ваш секрет>
```

После этого сделайте Redeploy (переменные применяются к новой сборке).

---

## Вариант B: Microsoft Graph (без Power Automate)

Подходит, если Power Automate Premium недоступен. Сайт сам пишет в файл от имени владельца.

1. Загрузите файл в корень OneDrive (или укажите путь в `EXCEL_FILE_PATH`).
2. entra.microsoft.com → **App registrations → New registration**:
   - Supported account types: *Personal Microsoft accounts only* (для outlook.com) или
     *Accounts in this organizational directory* (для рабочего аккаунта);
   - Redirect URI не нужен.
3. В приложении: **Authentication → Allow public client flows = Yes**;
   **API permissions → Microsoft Graph → Delegated → `Files.ReadWrite`, `offline_access`**.
4. На своём компьютере запустите
   `GRAPH_CLIENT_ID=<Application ID> GRAPH_TENANT=consumers node scripts/get-graph-token.mjs`
   (для рабочего аккаунта `GRAPH_TENANT=<ID вашего тенанта>`) и войдите **владельцем файла**.
   Скрипт выведет refresh token.
5. Переменные окружения в Vercel:

```
EXCEL_DRIVER=graph
GRAPH_CLIENT_ID=<Application ID>
GRAPH_TENANT=consumers
GRAPH_REFRESH_TOKEN=<токен из шага 4>
EXCEL_FILE_PATH=/Susanna_Birthday_Party_RSVP.xlsx
EXCEL_TABLE=RSVP
```

Важно:
- Excel API в Microsoft Graph официально поддерживается для OneDrive for Business и
  SharePoint. С личным OneDrive он может работать с ограничениями, поэтому после настройки
  **обязательно отправьте тестовую анкету** и убедитесь, что строка появилась.
- Refresh token перестаёт действовать, если его не использовать около 90 дней или если
  сменить пароль. Для разового мероприятия этого достаточно; при ошибке повторите шаг 4.

---

## Доступ для Susánna

1. В OneDrive откройте файл → **Share / Поделиться**.
2. Выберите **Specific people / Определённые люди** (не «Anyone with the link»!).
3. Укажите почту Susánna и права: *Can edit* (чтобы она могла удалять тестовые строки и
   вести список Invited) или *Can view*.
4. Нажмите **Send**. Susánna откроет таблицу в Excel Online или в приложении Excel.

Гости доступа к таблице не получают: на сайте нет ссылки на файл, а `/api/rsvp` умеет
только добавлять строку и ничего не возвращает из таблицы.

---

## Проверка после настройки

1. Откройте опубликованный сайт и отправьте анкету с именем «Тест Тестов».
2. Убедитесь, что в листе **RSVP Responses** появилась строка, а в **Summary** изменились числа.
3. Удалите тестовую строку (правой кнопкой мыши по строке таблицы → Delete → Table Rows).

Если вместо «Спасибо» появляется ошибка — откройте Vercel → Project → **Logs**: там будет
строка `[rsvp] storage is not configured` или `[rsvp] storage error: …` с причиной.
