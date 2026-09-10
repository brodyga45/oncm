# Exchange: общий внешний пакет → настоящий FALSE-рынок

Локальная цепь 31372, сайт http://127.0.0.1:5172/. Выполнено координатором в браузере через публичные devnet-кошельки Alice и Bob. Сертификаты ранее вычислены в CI; сайт не запускал prover.

В форму регистрации вставлен `oncm-external-certificate-bundle-v1`: минимальный artifact с настоящими криптографическими полями CI5, точный goalExport, source с SHA256 и metadata. Информационные поля CI pins/elapsed/verified flags опущены; проверка не опирается на них. Это общий импорт без fixture ID, но сама цель — известный минимальный perf05 smoke, не новая теорема.

- Goal: `0xf3970d998f81087ef438303d55b460425ccf4622df367ae485e09deab064afb4`, 1358 байт.
- Profile: `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10`.
- SHA256 вставленного registration bundle: `446fab429859f173732be9f9d994ac8c7a157b54ba61874c5e2fc52a5b6a595a`.
- SHA256 вставленного refutation bundle: `00245756c2a5dbc629692213832c30e7fc083c4a718bf73e542f1df4a19a61f2`.
- Рынок: `0x8594060552f0d9bf4b2ae4ef9aba4693c0b7a3ffcaea2b17d9608aa791f767bb`, название `External universal claim`.

Сайт показал original EVM + immutable bridge verification и явное `source → goal relationship is not verified`. Скачанный кнопкой **Download exact goal export** файл независимо прочитан: длина и SHA256 совпали, байты равны исходному canonical export. [Download evidence](../../implementations/exchange/docs/evidence/generic-external/browser-false-goal-download.json).

| Блок | Подтверждённое действие |
| --- | --- |
| 202 | Alice создаёт рынок после криптографической проверки регистрации на блоке 201 |
| 204 | Split 40 T → 40 YES + 40 NO |
| 207 | Alice предоставляет 20 T + 40 NO в NO/T Uniswap V2 pool |
| 209 | Bob покупает NO за 2 T |
| 211 | Bob продаёт 1 NO |
| 212 | Общий пакет CI6 проверен на блоке 211; Bob отправляет опровержение, рынок становится False |
| 214 | Bob погашает выигравшие NO в T |
| 216 | Alice выводит всю доступную LP-долю |
| 218 | Alice погашает полученные NO в T |

После прохода у Alice остались 40 проигравших YES с нулевой выплатой; её NO и LP равны нулю. Полученная Uniswap protocol LP и минимальная заблокированная ликвидность не равны погашенному пользовательскому LP и учитываются отдельно. Точные балансы собираются независимым RPC-отчётом.

## Проверка истории в вебе

Через **Block activity** открыт receipt и раскрыта запись блока 212:

- Tx `0x658d1e0dd075cd34b29c9814f5ab0d857f586a81b2c23cb613dbeeb8b70909db`, gas used **357570**.
- Block hash `0x76f62649e26ff58f0e9fa2e26d405dfc21e0e5e1f3f3c68860f73ad78e197f88`.
- Событие оригинального CTF `ConditionResolution`, condition `0xd5e72e494e2f48ceaed210e49204f27f36cad2d78c03030de8e4639c34b9ce83`, payout `[0,1]`.
- Событие реестра `Resolved`, outcome `2`, resolvedAt `1789010356`, evidence `0xaf59bdb42d3cd5c1e69c6b6a54708afb1186f18dab700ac7780bdff0b022c8a1`.

Этот проход закрывает общий браузерный импорт известных настоящих сертификатов и базовый NO-цикл Exchange. Он не подтверждает новую цель с новым сертификатом, повторный импорт portable package, все производные/deadline-ветки или публичный deployment.
