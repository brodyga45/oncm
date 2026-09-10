const phases = {
  eth_requestAccounts: 'Ожидаем доступ к адресу. Откройте выбранное расширение и подтвердите подключение сайта.',
  wallet_switchEthereumChain: 'Подтвердите переключение на сеть Vault в кошельке.',
  wallet_addEthereumChain: 'Подтвердите добавление тестовой сети Vault в кошельке.',
  personal_sign: 'Подтвердите вход в приватные инструменты подписью сообщения.',
};

// A timeout cannot dismiss a wallet popup. It only ends this site's connection
// attempt; late approvals must not continue into network requests or login.
export function walletConnection(provider, update, timeoutMs = 60000) {
  let state = 'connecting';
  const closed = () => Error('Подключение завершено без входа. Закройте или отклоните старый запрос в кошельке и подключитесь заново.');
  const wrapped = { request(request) {
    if (state === 'closed') return Promise.reject(closed());
    if (state === 'connected') return provider.request(request);
    update(phases[request.method] || 'Проверяем сеть и контракты Vault через кошелёк.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state = 'closed';
        reject(Error('Кошелёк не ответил за 60 секунд. Откройте его через значок расширений Chrome (пазл), разблокируйте и проверьте ожидающий запрос. Старый запрос может оставаться в кошельке; отклоните его перед повторным подключением.'));
      }, timeoutMs);
      const fail = error => {
        clearTimeout(timer);
        if (state === 'closed') return reject(closed());
        if (Number(error?.code) === -32002) {
          reject(Object.assign(Error('В кошельке уже ожидает подтверждения запрос. Откройте расширение и подтвердите либо отклоните его; затем повторите подключение.'), { code: -32002 }));
        } else reject(error);
      };
      try {
        // Invoke synchronously in the click handler, before any HTTP await.
        Promise.resolve(provider.request(request)).then(result => {
          clearTimeout(timer);
          if (state === 'closed') reject(closed());
          else resolve(result);
        }, fail);
      } catch (error) { fail(error); }
    });
  } };
  return {
    provider: wrapped,
    finish() { if (state === 'closed') throw closed(); state = 'connected'; },
    close() { state = 'closed'; },
  };
}
