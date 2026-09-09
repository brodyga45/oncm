# Две дополнительные функции Agora

Пользователь разрешил каждой реализации добавить2–3функции. Для Agora выбраны ровно две. Согласовано с leads Exchange/Vault: они реализуют торговые и LP/governance инструменты; здесь функции исследовательского кабинета.

## Личная полка исследований

Сценарий: исследователь открывает рынок, нажимает Save to shelf, входит SIWE и возвращается к задаче через Research shelf. У каждой сохранённой задачи можно написать приватные заметки, обновить их и открыть рынок. Remove убирает элемент полки, не меняя рынок.

Web: `src/App.vue` detail/shelf. SDK: `signIn()`, `saveBookmark(statementId,notes?)`, `shelf()`, `removeBookmark(statementId)`. API GET `/api/shelf`, PUT/DELETE `/api/shelf/:id`. Owner берётся исключительно из SIWE; statement проверяется по Registry. Повторное сохранение не создаёт дубликат и без указанных notes сохраняет старые заметки. Ни один public profile endpoint не раскрывает shelf.

Механика: `.local/app.json` → shelves[address][statementId]; приватные заметки до10000символов, timestamp. Chain balances/fees/outcomes не изменяются. Unit tests проверяют отсутствие чужого доступа через service owner, author spoof rejection, upsert/remove и persistence. Ручной полный market→shelf путь ждёт регистрации настоящего fixture.

Компромисс: это личное offchain состояние доверенного локального сервера, без E2E encryption и без ончейн-replication. Удаление локальной `.local/` удаляет заметки. Автоматических уведомлений и публичного рейтинга полок нет.

## История Lean notebook

Сценарий: исследователь пишет исходник в Lean workbench, вводит заголовок ревизии и сохраняет снимок. Позднее открывает историю, восстанавливает нужный исходник в редактор и продолжает работу, сохраняя новую ревизию с basedOn. Экспортирует весь notebook JSON.

Web: workbench → Save source revision / Load my revisions / Restore into editor / Export notebook. SDK: `signIn()`, `saveRevision({title,source,profileId,basedOn?})`, `notebook()`. API GET/POST `/api/notebook`.

Механика: append-only revision records с UUID, exact source, keccak sourceHash, profileId, timestamp и optional parent revision принадлежащей тому же кошельку. Restore изменяет клиентский редактор и сбрасывает старый registration certificate; ранняя ревизия не перезаписывается. Это хранение текста, не успешная Lean/zk-проверка. Проверки: неизменность старой версии, owner isolation, отвергание чужого parent, hash changes, persistence после повторного чтения JSON.

Компромисс: до256ревизий по100KB на кошелёк, локальный single-process JSON store. Нет collaborative editor и авто-merge. Proof artifacts формируются отдельным реальным runner и не выводятся из наличия notebook revision.
