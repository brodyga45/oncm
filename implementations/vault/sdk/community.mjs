import {createOnchainSocial} from './social.mjs';
/** Public reads + private tooling API. Social writes use a wallet's original EAS transaction. */
export function createCommunitySDK({
  baseUrl = '/api',
  origin = 'http://127.0.0.1:5173',
  fetcher = fetch,
  config,
  signer,
} = {}) {
  const onchain = config && signer ? createOnchainSocial(config, signer) : null;
  function social() {if(!onchain)throw Error('Pass deployment config and wallet signer for direct onchain EAS writes');return onchain;}
  let cookie = '';
  async function request(path, method = 'GET', body, binary = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof window === 'undefined') {
      headers.Origin = origin;
      if (cookie) headers.Cookie = cookie;
    }
    const response = await fetcher(baseUrl + path, {
      method,
      credentials: 'include',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    if (response.ok && binary) return new Uint8Array(await response.arrayBuffer());
    const data = await response.json();
    if (!response.ok) throw Error(data.error || response.statusText);
    return data;
  }
  return {
    request,
    async login(signer) {
      const { nonce } = await request('/auth/nonce'),
        address = await signer.getAddress(),
        domain = new URL(origin).host;
      const message =
        domain +
        ' wants you to sign in with your Ethereum account:\n' +
        address +
        '\n\nSign in to private Vault Lean jobs and source tools. Social posts require separate onchain transactions.\n\nURI: ' +
        origin +
        '\nVersion: 1\nChain ID: 31373\nNonce: ' +
        nonce +
        '\nIssued At: ' +
        new Date().toISOString();
      return request('/auth/verify', 'POST', {
        message,
        signature: await signer.signMessage(message),
      });
    },
    async logout() {
      const r = await request('/auth/logout', 'POST', {});
      cookie = '';
      return r;
    },
    profile: (address) => request('/profiles/' + encodeURIComponent(address)),
    updateProfile: (displayName, bio, options) => social().updateProfile(displayName, bio, options),
    comments: (statementId, sort = 'top') =>
      request(
        '/comments?statementId=' +
          encodeURIComponent(statementId) +
          '&sort=' +
          encodeURIComponent(sort),
      ),
    reply: (statementId, text, parentId = null, options) => social().createEntry({statementId,text,parentId},options),
    editComment: (id, text, options) => social().editEntry(id,{text},options),
    vote: (id, value, options) => social().vote(id,value,options),
    blog: (address) => request('/blog/' + encodeURIComponent(address)),
    publishBlog: (title,text,options) => social().createEntry({kind:1,title,text},options),
    palomar: () => request('/palomar'),
    importPalomar: (id, version) => request('/palomar/import', 'POST', { id, version }),
    importSnapshot: (repository, commit, challengePath) =>
      request('/import', 'POST', { repository, commit, challengePath }),
    jobs: () => request('/jobs'),
    job: (id) => request('/jobs/' + encodeURIComponent(id)),
    startJob: (input) => request('/jobs', 'POST', input),
    cancelJob: (id) => request('/jobs/' + encodeURIComponent(id) + '/cancel', 'POST', {}),
    exportStatement: (id) => request('/export/' + encodeURIComponent(id)),
    preparePackage: (input) => request('/packages/prepare', 'POST', input),
    downloadPackage: (input) => request('/packages/download', 'POST', input, true),
    publications: (id) => request('/statements/' + encodeURIComponent(id) + '/publications'),
    publishSource: (id, input) => request('/statements/' + encodeURIComponent(id) + '/publications', 'POST', input),
  };
}
