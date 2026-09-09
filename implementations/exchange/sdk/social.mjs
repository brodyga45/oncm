import { SiweMessage } from "siwe";
export class ExchangeSocialSDK {
  constructor(base = "http://127.0.0.1:4172/api/") {
    this.base = base;
    this.session = null;
  }
  async request(path, body, method) {
    const r = await fetch(this.base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(this.session
          ? { Authorization: "Bearer " + this.session.token }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try {
      data = await r.json();
    } catch {
      data = { error: "HTTP " + r.status };
    }
    if (!r.ok) throw Error(data.error || "Request failed");
    return data;
  }
  async signIn(signer) {
    const c = await this.request("auth/nonce", {}),
      message = new SiweMessage({
        domain: c.domain,
        address: await signer.getAddress(),
        uri: c.uri,
        version: "1",
        chainId: 31372,
        nonce: c.nonce,
        statement: "Sign in to Exchange offchain profile and discussion.",
      }).prepareMessage();
    this.session = await this.request("auth/verify", {
      message,
      signature: await signer.signMessage(message),
    });
    return this.session;
  }
  async logout() {
    await this.request("auth/logout", {});
    this.session = null;
  }
  profile(address) {
    return this.request("profiles/" + address);
  }
  saveProfile(displayName, bio) {
    return this.request("profile", { displayName, bio });
  }
  comments(statementId, sort = "top") {
    return this.request("comments/" + statementId + "?sort=" + sort);
  }
  postComment(statementId, text, parentId = null) {
    return this.request("comments/" + statementId, { text, parentId });
  }
  editComment(id, text) {
    return this.request("comments/" + id, { text }, "PATCH");
  }
  vote(id, value) {
    return this.request("comments/" + id + "/vote", { vote: value });
  }
}
