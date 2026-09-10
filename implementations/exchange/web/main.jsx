import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  JsonRpcProvider,
  BrowserProvider,
  HDNodeWallet,
  formatEther,
  parseEther,
  Contract,
  ZeroHash,
  Interface,
  AbiCoder,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { SiweMessage } from "siwe";
import { ExchangeSDK, fixtureForCertificate } from "../sdk/index.mjs";
import { createProofImportGuard } from "./proof-import-state.mjs";
import { publishedChoices, loadPublishedCertificate, assertWebJobAction } from "./published-certificates.mjs";
import { assertCertificateClaim, certificateClaimMatches } from "../sdk/proof-import.mjs";
import { createWalletLifecycle, authenticateWallet } from "./wallet-lifecycle.mjs";
import abis from "./generated/abis.json";
import "./style.css";
const API = "http://127.0.0.1:4172",
  RPC = "http://127.0.0.1:9546",
  MNEMONIC = "test test test test test test test test test test test junk";
const short = (a) => (a ? a.slice(0, 7) + "…" + a.slice(-5) : "—");
const fmt = (n, d = 3) =>
  Number(formatEther(n || 0)).toLocaleString("en-US", {
    maximumFractionDigits: d,
  });
const status = ["Open", "Proven true", "Proven false"];
const govStates = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];
async function api(path, body, token) {
  const r = await fetch(API + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) {
    const error = Error(d.error || "Request failed");
    error.status = r.status;
    throw error;
  }
  return d;
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  ...rest
}) {
  return (
    <button
      className={secondary ? "button secondary" : "button"}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  ...props
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );
}
function App() {
  const lifecycle = useRef(createWalletLifecycle()).current;
  const sessionRef = useRef(null), connectionRef = useRef(null);
  const [walletEpoch, setWalletEpoch] = useState(0);
  const renderTicket = lifecycle.ticket();
  const [deployment, setDeployment] = useState(null),
    [provider, setProvider] = useState(() => new JsonRpcProvider(RPC)),
    [signer, setSigner] = useState(null),
    [address, setAddress] = useState(""),
    [account, setAccount] = useState(""),
    [page, setPage] = useState("markets"),
    [markets, setMarkets] = useState([]),
    [selected, setSelected] = useState(""),
    [block, setBlock] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState(""),
    [transactions, setTransactions] = useState([]),
    [modal, setModal] = useState(false),
    [search, setSearch] = useState(""),
    [session, setSession] = useState(null),
    [draft, setDraft] = useState(null),
    [profileAddress, setProfileAddress] = useState(""),
    [inspectHash, setInspectHash] = useState("");
  sessionRef.current = session;
  const sdk = useMemo(() => {
    if (!deployment) return null;
    const ticket = lifecycle.ticket();
    const client = new ExchangeSDK(provider, signer, deployment, abis, (t) => {
      if (!lifecycle.current(ticket)) return;
      setTransactions((x) => [t, ...x].slice(0, 40));
      setToast(t.label + " · " + t.status + " · " + short(t.hash));
    });
    client.assertCurrent = () => lifecycle.assert(ticket);
    return client;
  }, [provider, signer, deployment, walletEpoch]);
  const selectedMarket = markets.find((m) => m.id === selected) || markets[0];
  async function refresh() {
    try {
      const d = await api("deployment");
      setDeployment(previous => JSON.stringify(previous) === JSON.stringify(d) ? previous : d);
      const r = await api("markets");
      setMarkets(r.markets);
      setBlock(r.observedBlock);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);
  const revokeSession = token => api("auth/logout", {}, token);
  function clearIdentity({ keepWallet = false, reason = "" } = {}) {
    const oldSession = sessionRef.current, connection = connectionRef.current;
    const ticket = lifecycle.invalidate();
    sessionRef.current = null;
    setWalletEpoch(ticket);
    setSession(null); setDraft(null); setModal(false); setProfileAddress("");
    setTransactions([]); setBusy(""); setToast(""); setError(reason);
    if (keepWallet && connection) lifecycle.activate(ticket, connection.choice);
    else {
      connectionRef.current = null;
      setAccount(""); setSigner(null); setAddress(""); setProvider(new JsonRpcProvider(RPC));
    }
    if (oldSession?.token) revokeSession(oldSession.token).catch(() => {
      if (lifecycle.current(ticket)) setError("Local session cleared; server logout could not be confirmed. Retry sign-in when the API is available.");
    });
    return ticket;
  }
  useEffect(() => lifecycle.listen(window.ethereum, event => {
    clearIdentity({ reason: `Browser wallet ${event}. Private forms and sign-in were cleared; reconnect explicitly.` });
  }), []);
  async function run(label, fn, successMessage) {
    const ticket = renderTicket;
    if (!lifecycle.current(ticket)) return null;
    setBusy(label); setError(""); setToast("");
    try {
      const r = await fn();
      if (!lifecycle.current(ticket)) return null;
      setToast(successMessage || label + " complete");
      await refresh();
      return r;
    } catch (e) {
      if (!lifecycle.current(ticket)) return null;
      if (e.status === 401) clearIdentity({ keepWallet: true, reason: "Session expired. Sign in again." });
      else setError(e.shortMessage || e.reason || e.message || String(e));
      return null;
    } finally {
      if (lifecycle.current(ticket)) setBusy("");
    }
  }
  async function connect(choice) {
    const ticket = clearIdentity();
    if (!choice) return;
    setBusy("Connect wallet");
    try {
      let p, s, connectedAddress;
      if (choice === "injected") {
        if (!window.ethereum) throw Error("No EIP-1193 wallet installed");
        await window.ethereum.request({ method: "eth_requestAccounts" });
        lifecycle.assert(ticket);
        try {
          await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a8c" }] });
        } catch (e) {
          if (e.code !== 4902) throw e;
          await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x7a8c", chainName: "Exchange Local", rpcUrls: [RPC],
            nativeCurrency: { name: "Test ETH", symbol: "ETH", decimals: 18 },
          }] });
        }
        lifecycle.assert(ticket);
        p = new BrowserProvider(window.ethereum);
        if (Number((await p.getNetwork()).chainId) !== 31372) throw Error("Wrong network");
        s = await p.getSigner(); connectedAddress = await s.getAddress();
        const [chain, accounts] = await Promise.all([
          window.ethereum.request({ method: "eth_chainId" }), window.ethereum.request({ method: "eth_accounts" }),
        ]);
        if (Number(BigInt(chain)) !== 31372 || accounts[0]?.toLowerCase() !== connectedAddress.toLowerCase())
          throw Error("Wallet changed during connection; reconnect explicitly");
      } else {
        if (!["localhost", "127.0.0.1"].includes(location.hostname) || !["0", "1", "2"].includes(choice))
          throw Error("Devnet wallets only work on localhost with an explicit test account");
        p = new JsonRpcProvider(RPC);
        if (Number((await p.getNetwork()).chainId) !== 31372) throw Error("Wrong local chain");
        lifecycle.assert(ticket);
        s = HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${Number(choice)}`).connect(p);
        connectedAddress = s.address;
      }
      lifecycle.assert(ticket);
      connectionRef.current = { choice, signer: s, address: connectedAddress };
      lifecycle.activate(ticket, choice);
      setProvider(p); setSigner(s); setAddress(connectedAddress); setAccount(choice);
    } catch (e) {
      if (lifecycle.current(ticket)) setError(e.shortMessage || e.message);
    } finally {
      if (lifecycle.current(ticket)) setBusy("");
    }
  }
  async function signIn() {
    if (!signer) throw Error("Connect a wallet");
    const signed = await authenticateWallet({
      lifecycle, ticket: renderTicket, signer, address,
      nonce: () => api("auth/nonce", {}),
      verify: (message, signature) => api("auth/verify", { message, signature }),
      revoke: revokeSession,
      makeMessage: c => new SiweMessage({ domain: c.domain, address,
        statement: "Sign in to Exchange comments and private proof jobs. This does not authorize token spending.",
        uri: c.uri, version: "1", chainId: 31372, nonce: c.nonce }).prepareMessage(),
    });
    lifecycle.assert(renderTicket);
    sessionRef.current = signed; setSession(signed);
    return signed;
  }
  const props = {
    sdk,
    address,
    run,
    busy,
    provider,
    deployment,
    markets,
    refresh,
    setSelected,
    setPage,
    error,
    session,
    signIn,
  };
  return (
    <>
      <header className="topbar">
        <a className="brand" onClick={() => setPage("markets")}>
          <span className="brand-symbol">∴</span>EXCHANGE
          <small>MATHEMATICAL MARKETS</small>
        </a>
        <div className="header-actions">
          <span className="network">
            <i />
            LOCAL EVM <b>#{block}</b>
          </span>
          <select
            aria-label="Connect wallet"
            value={account}
            onChange={(e) => connect(e.target.value)}
          >
            <option value="">
              {address ? "Disconnect" : "Connect wallet"}
            </option>
            <option value="injected">Browser wallet</option>
            <option value="0">Devnet · Alice</option>
            <option value="1">Devnet · Bob</option>
            <option value="2">Devnet · Carol</option>
          </select>
          {session && <Button secondary onClick={() => clearIdentity({ keepWallet: true })}>Log out of SIWE</Button>}
          {address && (
            <button
              className="profile-chip"
              onClick={() => setProfileAddress(address)}
            >
              <span>{address.slice(2, 4).toUpperCase()}</span>
              {short(address)}
            </button>
          )}
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <div className="nav-caption">WORKSPACE</div>
          {[
            ["markets", "◈", "Markets"],
            ["portfolio", "▦", "Portfolio"],
            ["journal", "↗", "Execution journal"],
            ["governance", "◇", "Governance"],
            ["fees", "↙", "Fee income"],
            ["activity", "≋", "Block activity"],
            ["research", "⌕", "Palomar library"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={"nav-item " + (page === id ? "active" : "")}
              onClick={() => setPage(id)}
            >
              <span>{icon}</span>
              {label}
              {id === "markets" && <b>{markets.length}</b>}
            </button>
          ))}
          <div className="sidebar-note">
            <span className="eyebrow">OPEN BY CONSTRUCTION</span>
            <p>
              Lean statements.
              <br />
              Onchain positions.
              <br />
              Verifiable outcomes.
            </p>
            <div className="rule" />
            <small>
              Uniswap V2 · Gnosis CTF
              <br />
              Chain 31372 · Test funds only
            </small>
          </div>
        </aside>
        <main key={walletEpoch}>
          <div className="environment">
            <span>LOCAL TEST NETWORK</span>Public devnet keys hold test funds
            only.
            {deployment?.testHarness ? (
              <b className="red">ECONOMIC HARNESS · NOT A ZK VERIFIER</b>
            ) : (
              <b>
                {deployment?.proofReady
                  ? "Lean/zk adapter configured"
                  : "Proof runtime setup in progress"}
              </b>
            )}
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {busy && (
            <div className="progress">
              <i />
              {busy} — confirm in your wallet if requested
            </div>
          )}
          {transactions[0]?.status === "confirmed" && (
            <div className="last-confirmation">
              <span>
                Last confirmed: {transactions[0].label} · block #
                {transactions[0].block}
              </span>
              <button
                className="link"
                onClick={() => {
                  setInspectHash(transactions[0].hash);
                  setPage("activity");
                }}
              >
                <code>{short(transactions[0].hash)}</code> · Inspect receipt →
              </button>
            </div>
          )}
          {page === "markets" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    THE MARKET FOR WHAT CAN BE PROVEN
                  </div>
                  <h1>
                    Trade the next proof<span className="accent">.</span>
                  </h1>
                  <p>Every position belongs to an exact formal statement.</p>
                </div>
                <Button onClick={() => setModal(true)}>＋ Create market</Button>
              </div>
              <div className="stats-grid">
                <Stat
                  label="REGISTERED STATEMENTS"
                  value={markets.length}
                  hint="Independent of descriptions"
                />
                <Stat
                  label="OPEN MARKETS"
                  value={markets.filter((m) => !m.outcome).length}
                  hint="No proof ≠ false"
                />
                <Stat
                  label="RESOLVED"
                  value={markets.filter((m) => m.outcome).length}
                  hint="CTF redemption available"
                />
                <Stat
                  label="BASE ASSET"
                  value="T"
                  hint="Collateral backed full sets"
                />
              </div>
              <div className="market-layout">
                <section className="market-list">
                  <div className="section-label">
                    ALL MARKETS <span>{markets.length}</span>
                  </div>
                  <input
                    className="search"
                    placeholder="Search statements…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {markets
                    .filter((m) =>
                      (m.metadata.title || m.id)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((m) => (
                      <button
                        className={
                          "market-row " +
                          (m.id === selectedMarket?.id ? "selected" : "")
                        }
                        key={m.id}
                        onClick={() => setSelected(m.id)}
                      >
                        <div className="row-top">
                          <span className="tag">
                            {m.kind ? "DERIVED" : "LEAN"}
                          </span>
                          <span className={m.outcome ? "green" : "dim"}>
                            {status[m.outcome]}
                          </span>
                        </div>
                        <h3>{m.metadata.title || short(m.id)}</h3>
                        <div className="row-bottom">
                          <span>{short(m.id)}</span>
                          <span>Open →</span>
                        </div>
                      </button>
                    ))}
                  {!markets.length && (
                    <div className="empty">
                      <span>∴</span>
                      <h3>The first statement starts here</h3>
                      <p>
                        Upload a Lean package, verify its goal, then create an
                        onchain market.
                      </p>
                      <Button secondary onClick={() => setModal(true)}>
                        Create a statement
                      </Button>
                    </div>
                  )}
                </section>
                {selectedMarket ? (
                  <MarketView
                    key={selectedMarket.id}
                    m={selectedMarket}
                    {...props}
                    session={session}
                    signIn={signIn}
                    onProfile={setProfileAddress}
                  />
                ) : (
                  <section className="intro-card">
                    <span className="large-symbol">∀</span>
                    <h2>
                      From a question
                      <br />
                      to a verifiable market.
                    </h2>
                    <p>
                      Register a precise Lean goal. Split T into YES and NO.
                      Supply liquidity or trade either outcome. An accepted
                      certificate settles the condition.
                    </p>
                    <div className="steps">
                      <span>01 · Formalize</span>
                      <span>02 · Trade</span>
                      <span>03 · Verify</span>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
          {page === "portfolio" && <Portfolio {...props} />}
          {page === "journal" && <ExecutionJournal {...props} />}
          {page === "governance" && <Governance {...props} />}
          {page === "fees" && <Fees {...props} />}
          {page === "activity" && (
            <Activity {...props} initialHash={inspectHash} />
          )}
          {page === "research" && (
            <Research
              {...props}
              onImport={(p) => {
                if (!lifecycle.current(renderTicket)) return;
                setDraft(p || null);
                setModal(true);
              }}
            />
          )}
          <footer>
            <span>EXCHANGE / OPEN PROTOCOL RESEARCH</span>
            <span>
              Original Uniswap V2 · trading continues after resolution
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className="toast"
          onClick={() => {
            setToast("");
            setPage("activity");
          }}
        >
          <span>↗</span>
          {toast}
        </div>
      )}
      {modal && (
        <CreateMarket
          key={walletEpoch}
          {...props}
          initialDraft={draft}
          onClose={() => {
            setModal(false);
            setDraft(null);
          }}
        />
      )}
      {profileAddress && (
        <ProfileModal
          key={walletEpoch}
          address={profileAddress}
          currentAddress={address}
          error={error}
          session={session}
          signIn={signIn}
          run={run}
          sdk={sdk}
          markets={markets}
          onClose={() => setProfileAddress("")}
        />
      )}
    </>
  );
}
function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function MarketView({
  m,
  sdk,
  address,
  run,
  busy,
  provider,
  session,
  signIn,
  onProfile,
  ...props
}) {
  const [tab, setTab] = useState("trade"),
    [snap, setSnap] = useState(null);
  async function refresh() {
    if (sdk) setSnap(await sdk.snapshot(m, address));
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [sdk, address, m]);
  const pool = snap?.pools[0],
    rt = pool
      ? pool.token0.toLowerCase() ===
        props.deployment.contracts.token.toLowerCase()
        ? pool.reserve0
        : pool.reserve1
      : 0,
    ro = pool
      ? pool.token0.toLowerCase() ===
        props.deployment.contracts.token.toLowerCase()
        ? pool.reserve1
        : pool.reserve0
      : 0;
  const price = Number(ro) > 0 ? Number(rt) / Number(ro) : null;
  return (
    <section className="market-detail">
      <div className="detail-top">
        <div>
          <div className="eyebrow">
            {m.kind ? "PROTOCOL EVENT" : "LEAN VERIFIED CONDITION"} ·{" "}
            {short(m.id)}
          </div>
          <h2>{m.metadata.title || "Untitled statement"}</h2>
          <p>
            {m.metadata.description ||
              "The canonical goal and proof profile determine this market."}
          </p>
        </div>
        <span className={"status " + (m.outcome ? "resolved" : "")}>
          {status[m.outcome]}
        </span>
      </div>
      <div className="ticker">
        <div>
          <span>YES / T</span>
          <strong>
            {price === null ? "—" : price.toFixed(4)}
            <small> T</small>
          </strong>
        </div>
        <div>
          <span>YES RESERVE</span>
          <strong>{fmt(ro)}</strong>
        </div>
        <div>
          <span>T RESERVE</span>
          <strong>{fmt(rt)}</strong>
        </div>
      </div>
      <div className="tabs">
        {[
          ["trade", "Trade & liquidity"],
          ["proof", "Proof lab"],
          ["details", "Specification"],
          ["comments", "Discussion"],
        ].map(([t, l]) => (
          <button
            className={t === tab ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "trade" && (
        <Trading
          m={m}
          sdk={sdk}
          snap={snap}
          address={address}
          run={run}
          busy={busy}
          refresh={refresh}
        />
      )}{" "}
      {tab === "trade" && (
        <ArbitragePanel
          m={m}
          sdk={sdk}
          address={address}
          run={run}
          busy={busy}
        />
      )}{" "}
      {tab === "proof" && <ProofLab key={m.id} m={m} sdk={sdk} run={run} busy={busy} session={session} signIn={signIn} address={address} />}{" "}
      {tab === "details" && (
        <div className="panel">
          <div className="spec-grid">
            {[
              ["Statement ID", m.id],
              ["Canonical goal", m.goal],
              ["Proof profile", m.profile],
              ["Market descriptor", m.market],
              ["YES / NO", m.yes + " / " + m.no],
              ["Creator", m.creator],
              ["Dependency", m.dependency],
              [
                "Recorded resolution",
                m.resolvedAt
                  ? new Date(m.resolvedAt * 1000).toISOString()
                  : "Unresolved",
              ],
              [
                "Deadline",
                m.deadline
                  ? new Date(m.deadline * 1000).toISOString()
                  : "No deadline",
              ],
            ].map(([l, v]) => (
              <div key={l}>
                <label>{l}</label>
                <code>{v}</code>
              </div>
            ))}
          </div>
          <p className="note">
            The canonical kernel goal determines payout. The displayed Lean
            source is a reproducible representation. V2 trades remain open after
            settlement.
          </p>
          <Button
            secondary
            onClick={() => {
              const blob = new Blob(
                [
                  JSON.stringify(
                    { schema: "exchange-market-v1", statement: m },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              );
              download(blob, "exchange-market.json");
            }}
          >
            Export market manifest
          </Button>
          {m.metadata.packageId && (
            <Button
              secondary
              onClick={() =>
                run("Export Lean package", async () => {
                  const p = await api("packages/" + m.metadata.packageId);
                  download(
                    new Blob([JSON.stringify(p, null, 2)], {
                      type: "application/json",
                    }),
                    "lean-package.json",
                  );
                })
              }
            >
              Download Lean package
            </Button>
          )}
        </div>
      )}
      {tab === "comments" && (
        <Comments
          id={m.id}
          session={session}
          signIn={signIn}
          run={run}
          onProfile={onProfile}
        />
      )}
    </section>
  );
}
function Trading({ m, sdk, snap, address, run, busy, refresh }) {
  const [side, setSide] = useState(0),
    [buy, setBuy] = useState(true),
    [amount, setAmount] = useState("10"),
    [quote, setQuote] = useState(""),
    [slippage, setSlippage] = useState("1"),
    [tAmount, setTAmount] = useState("50"),
    [outAmount, setOutAmount] = useState("100"),
    [sets, setSets] = useState("100"),
    [lp, setLp] = useState("");
  const balance = snap?.balances || [];
  useEffect(() => {
    let active = true;
    setQuote("");
    if (sdk && Number(amount) > 0)
      sdk
        .quote(m, side, buy, parseEther(amount))
        .then((q) => active && setQuote(q.toString()))
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [sdk, m, side, buy, amount, snap?.pools[side]?.reserve0]);
  async function action(label, f) {
    await run(label, f);
    refresh();
  }
  return (
    <div className="trading-grid">
      <div className="panel">
        <div className="segmented">
          <button className={buy ? "active" : ""} onClick={() => setBuy(true)}>
            Buy
          </button>
          <button
            className={!buy ? "active" : ""}
            onClick={() => setBuy(false)}
          >
            Sell
          </button>
        </div>
        <div className="outcomes">
          <button
            className={side === 0 ? "yes selected" : "yes"}
            onClick={() => setSide(0)}
          >
            YES <span>True</span>
          </button>
          <button
            className={side === 1 ? "no selected" : "no"}
            onClick={() => setSide(1)}
          >
            NO <span>False</span>
          </button>
        </div>
        <Field
          label={"YOU PAY · " + (buy ? "T" : side === 0 ? "YES" : "NO")}
          value={amount}
          onChange={setAmount}
          type="number"
        />
        <div className="estimate">
          <span>Estimated receive</span>
          <b>
            {quote ? fmt(quote) : "No liquidity"}{" "}
            {buy ? (side === 0 ? "YES" : "NO") : "T"}
          </b>
        </div>
        <Field
          label="Slippage tolerance %"
          value={slippage}
          onChange={setSlippage}
          type="number"
        />
        <Button
          disabled={!address || busy || !quote}
          onClick={() =>
            action("Swap", () => {
              const bps = Math.round(Number(slippage) * 100);
              if (bps < 0 || bps > 2000) throw Error("Slippage must be 0–20%");
              return sdk.trade(
                m,
                side,
                buy,
                parseEther(amount),
                (BigInt(quote) * BigInt(10000 - bps)) / 10000n,
              );
            })
          }
        >
          {!address
            ? "Connect wallet to trade"
            : (buy ? "Buy " : "Sell ") + (side === 0 ? "YES" : "NO")}{" "}
          ↗
        </Button>
        <p className="note">
          0.30% V2 swap fee. Protocol share accrues as LP, minted on liquidity
          events. Quotes execute with an onchain minimum.
        </p>
      </div>
      <div className="panel">
        <h3>Your positions</h3>
        <div className="balance-list">
          {[
            ["T", balance[0]],
            ["YES", balance[1]],
            ["NO", balance[2]],
            ["YES/T LP", balance[3]],
            ["NO/T LP", balance[4]],
          ].map(([l, v]) => (
            <div key={l}>
              <span>{l}</span>
              <b>{fmt(v)}</b>
            </div>
          ))}
        </div>
        <h3>Full sets</h3>
        <Field
          label="Amount · 1 T ↔ 1 YES + 1 NO"
          value={sets}
          onChange={setSets}
          type="number"
        />
        <div className="button-row">
          <Button
            secondary
            disabled={!address || busy}
            onClick={() =>
              action("Split full sets", () => sdk.split(m, parseEther(sets)))
            }
          >
            Split T
          </Button>
          <Button
            secondary
            disabled={!address || busy}
            onClick={() =>
              action("Merge full sets", () => sdk.merge(m, parseEther(sets)))
            }
          >
            Merge sets
          </Button>
        </div>
        {m.outcome > 0 && (
          <div className="settled-box">
            <b>{status[m.outcome]}</b>
            <p>Redeem directly against CTF collateral.</p>
            <Button
              disabled={!address || busy}
              onClick={() =>
                action("Redeem winner", () =>
                  sdk.redeem(m, m.outcome - 1, BigInt(balance[m.outcome] || 0)),
                )
              }
            >
              Redeem winning balance
            </Button>
          </div>
        )}
      </div>
      <div className="panel full">
        <div className="section-head">
          <h3>Liquidity provider</h3>
          <span className="tag">{side === 0 ? "YES" : "NO"} / T</span>
        </div>
        <div className="input-row">
          <Field
            label="T to supply"
            value={tAmount}
            onChange={setTAmount}
            type="number"
          />
          <Field
            label={(side === 0 ? "YES" : "NO") + " to supply"}
            value={outAmount}
            onChange={setOutAmount}
            type="number"
          />
          <Button
            secondary
            onClick={() => {
              const p = snap?.pools[side];
              if (!p || BigInt(p.supply) === 0n) return;
              const rt =
                  p.token0.toLowerCase() ===
                  sdk.deployment.contracts.token.toLowerCase()
                    ? p.reserve0
                    : p.reserve1,
                ro =
                  p.token0.toLowerCase() ===
                  sdk.deployment.contracts.token.toLowerCase()
                    ? p.reserve1
                    : p.reserve0;
              setOutAmount(
                formatEther((parseEther(tAmount) * BigInt(ro)) / BigInt(rt)),
              );
            }}
          >
            Match pool ratio
          </Button>
          <Button
            disabled={!address || busy}
            onClick={() =>
              action("Supply liquidity", () =>
                sdk.addLiquidity(
                  m,
                  side,
                  parseEther(tAmount),
                  parseEther(outAmount),
                ),
              )
            }
          >
            Supply assets
          </Button>
        </div>
        <p className="note">
          Split T first if you need outcome tokens. Unused YES/NO remain in your
          wallet. Adding liquidity may mint protocol LP to the fee collector.
        </p>
        <div className="input-row">
          <Field
            label="LP tokens to remove"
            value={lp}
            onChange={setLp}
            placeholder="0.0"
          />
          <Button
            secondary
            onClick={() => setLp(formatEther(balance[3 + side] || 0))}
          >
            Max LP
          </Button>
          <Button
            secondary
            disabled={!address || busy || !lp}
            onClick={() =>
              action("Remove liquidity", async () => {
                const p = snap.pools[side],
                  amount = parseEther(lp),
                  rt =
                    p.token0.toLowerCase() ===
                    sdk.deployment.contracts.token.toLowerCase()
                      ? p.reserve0
                      : p.reserve1,
                  ro =
                    p.token0.toLowerCase() ===
                    sdk.deployment.contracts.token.toLowerCase()
                      ? p.reserve1
                      : p.reserve0;
                return sdk.removeLiquidity(
                  m,
                  side,
                  amount,
                  (((amount * BigInt(rt)) / BigInt(p.supply)) * 99n) / 100n,
                  (((amount * BigInt(ro)) / BigInt(p.supply)) * 99n) / 100n,
                );
              })
            }
          >
            Remove liquidity
          </Button>
        </div>
      </div>
    </div>
  );
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function ArbitragePanel({ m, sdk, address, run, busy }) {
  const [amount, setAmount] = useState("1"),
    [minimum, setMinimum] = useState("0.01"),
    [quote, setQuote] = useState(null);
  useEffect(() => setQuote(null), [amount]);
  async function preview() {
    setQuote(await sdk.quoteArbitrage(m, parseEther(amount)));
  }
  return (
    <section className="panel arbitrage-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">ATOMIC STRATEGY</span>
          <h3>Full-set arbitrage</h3>
        </div>
        <span className="tag">ALL OR REVERT</span>
      </div>
      <p className="note">
        Split T into a full set, sell YES and NO into the two V2 pools, return
        T. The entire transaction reverts unless your minimum T profit is met.
        Gas is paid in test ETH and is excluded from this profit.
      </p>
      <div className="input-row">
        <Field
          label="T to split"
          type="number"
          value={amount}
          onChange={setAmount}
        />
        <Field
          label="Minimum profit · T"
          type="number"
          value={minimum}
          onChange={setMinimum}
        />
        <Button
          secondary
          disabled={!sdk || busy}
          onClick={() => run("Quote atomic full set", preview)}
        >
          Check opportunity
        </Button>
      </div>
      {quote && (
        <div className="strategy-quote">
          <span>YES sale {fmt(quote.yesT)} T</span>
          <span>NO sale {fmt(quote.noT)} T</span>
          <strong className={BigInt(quote.profit) > 0n ? "green" : "red"}>
            Gross profit {fmt(quote.profit)} T
          </strong>
          <small>Quote at block #{quote.block}</small>
        </div>
      )}
      <Button
        disabled={
          !address ||
          busy ||
          !quote ||
          !Number.isFinite(Number(minimum)) ||
          Number(minimum) < 0 ||
          BigInt(quote.profit) < parseEther(minimum || "0")
        }
        onClick={() =>
          run("Execute atomic arbitrage", async () => {
            await sdk.arbitrage(m, parseEther(amount), parseEther(minimum));
            preview();
          })
        }
      >
        Execute with minimum profit ↗
      </Button>
    </section>
  );
}
function useProofJob({ session, signIn, address }) {
  const [job, setJob] = useState(null);
  const timer = useRef(), generation = useRef(0), jobToken = useRef();
  useEffect(() => {
    generation.current++; clearTimeout(timer.current); setJob(null);
    return () => { generation.current++; clearTimeout(timer.current); };
  }, [address]);
  async function start(input) {
    assertWebJobAction(input.action);
    const current = ++generation.current;
    clearTimeout(timer.current);
    let signed = session && session.address.toLowerCase() === address?.toLowerCase() ? session : await signIn(), j;
    if (generation.current !== current) throw Error("Proof form changed before job submission");
    try { j = await api("proof/jobs", input, signed.token); }
    catch (e) {
      if (e.status !== 401) throw e;
      signed = await signIn();
      if (generation.current !== current) throw Error("Proof form changed before job retry");
      j = await api("proof/jobs", input, signed.token);
    }
    if (generation.current !== current) return j;
    jobToken.current = signed.token;
    setJob(j);
    const poll = async () => {
      try {
        const next = await api("proof/jobs/" + j.id, undefined, signed.token);
        if (generation.current !== current) return;
        setJob(next);
        if (next.status === "Running") timer.current = setTimeout(poll, 1500);
      } catch (e) {
        if (generation.current !== current) return;
        setJob({ status: "Failed", error: e.message });
      }
    };
    timer.current = setTimeout(poll, 1500);
    return j;
  }
  async function cancel() {
    if (!job?.id) return;
    const current = generation.current;
    const next = await api("proof/jobs/" + job.id + "/cancel", {}, jobToken.current);
    if (generation.current !== current) return;
    generation.current++; clearTimeout(timer.current); setJob(next);
  }
  return [job, start, cancel];
}
function ProofLab({ m, sdk, run, busy, session, signIn, address }) {
  const [source, setSource] = useState(""),
    [certificate, setCertificate] = useState(""),
    [outcome, setOutcome] = useState(1),
    [fixture, setFixture] = useState(m.metadata.fixtureId || ""),
    [target, setTarget] = useState(m.metadata.targetDeclaration || ""),
    [catalog, setCatalog] = useState(null),
    [importStatus, setImportStatus] = useState(""),
    [externalJSON, setExternalJSON] = useState(""),
    [job, start, cancelJob] = useProofJob({ session, signIn, address });
  const importGuard = useRef(createProofImportGuard());
  importGuard.current.select(JSON.stringify([m.id, m.goal, m.profile, outcome, source, fixture, target, address, externalJSON]), sdk);
  useEffect(() => () => importGuard.current.invalidate(), []);
  useEffect(() => { api("proof/catalog").then(setCatalog); }, [m.profile]);
  const selectedProfile = catalog?.profiles.find(p => p.profileId.toLowerCase() === m.profile.toLowerCase());
  async function verifyImportedProof(artifact, ticket = importGuard.current.begin()) {
    setCertificate(""); setImportStatus("");
    if (!importGuard.current.current(ticket)) throw Error("The proof form changed while reading the file; import it again.");
    const result = await sdk.verifyExternalCertificate(artifact, selectedProfile, {statementId: m.id, goalHash: m.goal, profileId: m.profile, outcome});
    if (!importGuard.current.current(ticket)) throw Error("The selected market or proof form changed during verification; verify the certificate again.");
    if (!result.available) throw Error("This profile is not enabled for resolution by governance");
    setCertificate(result.certificate);
    setImportStatus(`Original onchain verifier accepted ${outcome === 1 ? "YES" : "NO"} proof at block ${result.verifiedAtBlock}. Submit below to settle this market.`);
  }
  useEffect(() => { if (!certificate) setImportStatus(""); }, [certificate]);
  useEffect(() => {
    if (
      job?.result?.certificate &&
      job.input?.source === source &&
      Number(job.input?.outcome) === outcome &&
      (job.input?.fixtureId || "") === fixture &&
      (job.input?.targetDeclaration || "") === target
    )
      setCertificate(job.result.certificate);
  }, [job]);
  if (m.kind)
    return (
      <div className="panel">
        <h3>Resolve from blockchain history</h3>
        <p>
          This predicate reads the accepted outcome and recorded timestamp of{" "}
          {short(m.dependency)}. A deadline passing alone does not submit a
          transaction.
        </p>
        <Button
          disabled={busy || m.outcome > 0}
          onClick={() =>
            run("Resolve derived statement", () => sdk.resolveDerived(m))
          }
        >
          Resolve when ready
        </Button>
      </div>
    );
  return (
    <div className="panel proof-panel">
      <div className="section-head">
        <h3>External certificate → onchain</h3>
        <span className="tag">{short(m.profile)}</span>
      </div>
      <p className="note">
        Prepare your certificate externally, then load and verify it here before
        submitting the settlement transaction. The website does not generate or
        order certificates. An optional Lean check cannot settle this market.
      </p>
      <p className="note">{selectedProfile?.label || short(m.profile)} · {selectedProfile?.localRunner ? "Optional local Lean checking is available. Certificates are prepared externally." : "External certificate profile; this local checker does not support its image."}</p>
      <div className="button-row">{publishedChoices({ profileId: m.profile, goalHash: m.goal, outcome }).map(choice =>
        <Button key={choice.id} secondary disabled={!!busy} onClick={() => {
          importGuard.current.invalidate(); setCertificate(""); setImportStatus("");
          setExternalJSON(JSON.stringify(loadPublishedCertificate(choice.id, { profileId: m.profile, goalHash: m.goal, outcome }), null, 2));
        }}>Load published {choice.label}</Button>)}</div>
      <p className="note">Loading only fills the JSON field. Verify it below, then submit separately.</p>
      <div className="input-row">
        <label className="field">
          <span>CERTIFICATE OUTCOME</span>
          <select
            value={outcome}
            onChange={(e) => {
              setOutcome(Number(e.target.value));
              setCertificate("");
              setImportStatus("");
            }}
          >
            <option value="1">P · YES</option>
            <option value="2">¬P · NO</option>
          </select>
        </label>
        <Field
          label="Published fixture ID (optional)"
          value={fixture}
          onChange={(value) => {
            setFixture(value);
            setCertificate("");
          }}
        />
        <Field
          label="Target declaration"
          value={target}
          onChange={(value) => {
            setTarget(value);
            setCertificate("");
          }}
        />
      </div>
      {m.metadata.packageId && (
        <Button
          secondary
          onClick={() =>
            run("Load registered source package", async () => {
              const p = await api("packages/" + m.metadata.packageId);
              setSource(p.solution || p.source);
              setFixture(p.fixtureId || "");
              setTarget(p.proofDeclaration || p.targetDeclaration || "");
              setCertificate("");
            })
          }
        >
          Load registered Lean package
        </Button>
      )}
      <label className="file">
        Upload Solution.lean or certificate JSON
        <input
          type="file"
          accept=".lean,.json"
          onChange={(e) =>
            run("Read proof file", async () => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 128 * 1024) throw Error("Proof import exceeds 128 KB");
              const ticket = importGuard.current.begin();
              setCertificate(""); setImportStatus("");
              const text = await file.text();
              if (!importGuard.current.current(ticket)) throw Error("Proof form changed while reading the file; import again");
              if (file.name.endsWith(".json")) {
                await verifyImportedProof(JSON.parse(text), ticket);
              } else {
                setSource(text);
                setCertificate("");
                setImportStatus("");
              }
            })
          }
        />
      </label>
      <label className="field">
        <span>OR PASTE EXTERNAL CI PROOF JSON</span>
        <textarea value={externalJSON} onChange={e => { importGuard.current.invalidate(); setExternalJSON(e.target.value); setCertificate(""); setImportStatus(""); }} placeholder='{"format":"oncm-real-groth16-ci-v1",…}' />
      </label>
      <Button secondary disabled={busy || !externalJSON || externalJSON.length > 128 * 1024} onClick={() => run("Verify pasted external proof certificate", () => verifyImportedProof(JSON.parse(externalJSON)))}>Verify pasted proof certificate</Button>
      <textarea
        className="code-editor"
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          setCertificate("");
        }}
        placeholder="Paste the Lean solution for this exact goal…"
      />
      <div className="button-row">
        <Button secondary disabled={!!busy || !source || job?.status === "Running" || !selectedProfile?.localRunner}
          onClick={() => run("Check Lean only", () => start({ action: "check", source,
            statementId: m.id, goalHash: m.goal, profileId: m.profile, outcome,
            fixtureId: fixture, targetDeclaration: target }))}>Check Lean only</Button>
      </div>
      {job && (
        <div className="job">
          <b>{job.status}{job.phase === 'queued' ? ' · queued' : ''}</b>
          {job.status === 'Running' && <Button secondary disabled={busy} onClick={() => run('Cancel proof job', cancelJob)}>Cancel job</Button>}
          <pre>
            {job.error ||
              job.diagnostics ||
              JSON.stringify(job.result, null, 2)}
          </pre>
          {job.result && (
            <Button
              secondary
              onClick={() =>
                download(
                  new Blob([
                    JSON.stringify(
                      {
                        ...job.result,
                        source: job.input?.source,
                        fixtureId: job.input?.fixtureId,
                        request: job.input,
                      },
                      null,
                      2,
                    ),
                  ]),
                  "proof-certificate.json",
                )
              }
            >
              Download result
            </Button>
          )}
        </div>
      )}
      <Field
        label="VERIFIABLE CERTIFICATE BYTES · 0x…"
        value={certificate}
        onChange={value => { importGuard.current.invalidate(); setCertificate(value); setImportStatus(""); }}
      />
      {importStatus && <p className="note" role="status">{importStatus}</p>}
      <Button
        disabled={busy || !certificateClaimMatches(certificate, {goalHash: m.goal, profileId: m.profile, outcome}) || m.outcome > 0}
        onClick={() =>
          run("Submit external certificate", () => {
            assertCertificateClaim(certificate, {goalHash: m.goal, profileId: m.profile, outcome});
            return sdk.resolve(m, outcome, certificate);
          })
        }
      >
        Submit external proof onchain
      </Button>
    </div>
  );
}
function CreateMarket({
  sdk,
  run,
  busy,
  markets,
  deployment,
  onClose,
  initialDraft,
  error,
  session,
  signIn,
  address,
}) {
  const [kind, setKind] = useState(0),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [source, setSource] = useState(""),
    [goal, setGoal] = useState(""),
    [profile, setProfile] = useState(deployment?.profile || ""),
    [certificate, setCertificate] = useState(""),
    [fixture, setFixture] = useState(""),
    [target, setTarget] = useState(""),
    [dep, setDep] = useState(markets[0]?.id || ""),
    [deadline, setDeadline] = useState(""),
    [targetOutcome, setTargetOutcome] = useState(1),
    [operatorId, setOperatorId] = useState(
      keccak256(toUtf8Bytes("UNRESOLVED_BY_V1")),
    ),
    [operatorArgs, setOperatorArgs] = useState(""),
    [job, start, cancelJob] = useProofJob({ session, signIn, address }),
    [packageDraft, setPackageDraft] = useState(initialDraft || null),
    [fixtures, setFixtures] = useState([]),
    [profiles, setProfiles] = useState([]),
    [importStatus, setImportStatus] = useState(""),
    [externalJSON, setExternalJSON] = useState("");
  const registrationGuard = useRef(createProofImportGuard());
  registrationGuard.current.select(JSON.stringify([kind, profile, source, goal, fixture, target, address, externalJSON]), sdk);
  useEffect(() => () => registrationGuard.current.invalidate(), []);
  async function refreshProfiles() {
    const catalog = await api("proof/catalog");
    setProfiles(catalog.profiles);
    setFixtures(catalog.fixtures);
    return catalog;
  }
  const selectedProfile = profiles.find(p => p.profileId.toLowerCase() === profile.toLowerCase());
  useEffect(() => { if (!certificate) setImportStatus(""); }, [certificate]);
  useEffect(() => {
    refreshProfiles();
  }, []);
  useEffect(() => {
    if (
      job?.result &&
      job.input?.source === source &&
      (job.input?.fixtureId || "") === fixture &&
      (job.input?.targetDeclaration || "") === target &&
      job.input?.profileId === profile &&
      (job.input?.goalHash || "") === goal
    ) {
      const r = job.result;
      if (r.goalHash) setGoal(r.goalHash);
      if (r.profileId) setProfile(r.profileId);
      if (r.registrationCertificate) setCertificate(r.registrationCertificate);
      else if (r.certificate) setCertificate(r.certificate);
    }
  }, [job]);
  useEffect(() => {
    if (initialDraft) {
      setFixture(initialDraft.fixtureId || "");
      setTitle(initialDraft.title || "");
      setDescription(initialDraft.description || "");
      setSource(initialDraft.source || "");
      setTarget(initialDraft.targetDeclaration || "");
      setGoal(initialDraft.goalHash || "");
      setProfile(initialDraft.profileId || profile);
      setCertificate(initialDraft.registrationCertificate || "");
    }
  }, [initialDraft]);
  async function upload(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) throw Error("Package exceeds 1 MB");
    const ticket = registrationGuard.current.begin();
    setCertificate(""); setImportStatus("");
    const text = await file.text();
    if (!registrationGuard.current.current(ticket)) throw Error("Registration form changed while reading the package; import again");
    if (file.name.endsWith(".json")) {
      const p = JSON.parse(text);
      if (p.format === "oncm-real-groth16-ci-v1") return importCertificate(p, ticket);
      setPackageDraft(p);
      setFixture(p.fixtureId || "");
      setSource(p.source || p.leanSource || "");
      setTitle(p.title || p.metadata?.title || title);
      setDescription(p.description || "");
      setGoal(p.goalHash || "");
      setProfile(p.profileId || profile);
      setCertificate(p.registrationCertificate || "");
      setTarget(p.targetDeclaration || "");
    } else {
      setSource(text);
      setCertificate("");
      setGoal("");
      setPackageDraft(null);
      setFixture("");
      if (!title) setTitle(file.name.replace(".lean", ""));
    }
  }
  async function importCertificate(artifact, ticket = registrationGuard.current.begin()) {
    if (!registrationGuard.current.current(ticket)) throw Error("Registration form changed; import again");
    setCertificate(""); setImportStatus("");
    const catalog = await refreshProfiles();
    const candidate = catalog.profiles.find(p => p.profileId.toLowerCase() === artifact.profileId?.toLowerCase());
    const result = await sdk.verifyExternalCertificate(artifact, candidate, { outcome: 0 });
    const f = fixtureForCertificate(catalog.fixtures, result);
    if (!registrationGuard.current.current(ticket)) throw Error("Registration form or wallet changed during verification; import again");
    setKind(0); setSource(f.source); setTitle(f.title); setDescription(f.description);
    setGoal(f.goalHash); setProfile(f.profileId); setFixture(f.id); setTarget(f.targetDeclaration);
    setPackageDraft({ ...f, fixtureId: f.id, externalCertificate: artifact });
    setCertificate(result.certificate);
    setImportStatus(`Exact ${candidate.label} goal imported. Original onchain verifier accepted registration at block ${result.verifiedAtBlock}. ${result.available ? "Ready to create the market." : "Governance must enable this profile before market creation."}`);
  }
  return (
    <div className="modal-overlay">
      <div className="modal">
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="section-head">
          <div>
            <span className="eyebrow">PERMISSIONLESS CREATION</span>
            <h2>Make a statement.</h2>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="input-row">
          <label className="field">
            <span>MARKET TYPE</span>
            <select
              value={kind}
              onChange={(e) => setKind(Number(e.target.value))}
            >
              <option value="0">Lean mathematical statement</option>
              <option value="1">Resolved by deadline</option>
              <option value="2">Resolved as outcome</option>
              <option value="3">Resolved as outcome by deadline</option>
              <option value="4">Governance-registered operator</option>
            </select>
          </label>
          <Field label="Title" value={title} onChange={setTitle} />
        </div>
        <Field
          label="Human description (separate from formal goal)"
          value={description}
          onChange={setDescription}
        />
        {kind === 0 ? (
          <>
            <label className="field">
              <span>IMMUTABLE PROOF PROFILE</span>
              <select value={profile} onChange={e => {
                setProfile(e.target.value); setCertificate(""); setGoal(""); setSource(""); setFixture(""); setPackageDraft(null); setImportStatus("");
              }}>
                {profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.label} · {p.installed && p.newEnabled ? "enabled" : "awaiting governance"}</option>)}
              </select>
            </label>
            <p className="note">{selectedProfile?.localRunner ? "Optional Lean checking is available. Bring an externally prepared registration certificate; this website does not generate one." : "Bring an external registration certificate for this separate logic profile. It does not replace v3."}</p>
            <Button secondary disabled={busy} onClick={() => run("Refresh proof profile availability", refreshProfiles)}>Refresh onchain availability</Button>
            <div className="button-row">{publishedChoices({ profileId: profile, registration: true }).map(choice =>
              <Button key={choice.id} secondary disabled={!!busy} onClick={() => {
                registrationGuard.current.invalidate(); setCertificate(""); setImportStatus("");
                setExternalJSON(JSON.stringify(loadPublishedCertificate(choice.id, { profileId: profile, registration: true }), null, 2));
              }}>Load published {choice.label}</Button>)}</div>
            <p className="note">Loading fills JSON only. Verify below to load its exact goal package, then register through your wallet.</p>
            {fixtures.filter(f => f.profileId.toLowerCase() === profile.toLowerCase()).map((f) => (
              <button
                className="fixture-card"
                key={f.id}
                onClick={() => {
                  setSource(f.source);
                  setTitle(f.title);
                  setDescription(f.description);
                  setGoal(f.goalHash);
                  setProfile(f.profileId);
                  setFixture(f.id);
                  setTarget(f.targetDeclaration);
                  setCertificate("");
                  setImportStatus("");
                  setPackageDraft({ ...f, fixtureId: f.id });
                }}
              >
                <span>{f.sourceKind || "PUBLISHED LEAN CORE"} · {f.version}</span>
                <b>{f.title}</b>
                <small>Load source package · {f.upstreamDeclaration} →</small>
              </button>
            ))}
            <label className="file">
              Import external CI registration certificate JSON
              <input type="file" accept=".json" onChange={e => {
                const file = e.target.files[0];
                e.target.value = "";
                if (file) run("Verify external registration certificate", async () => {
                  if (file.size > 128 * 1024) throw Error("Certificate exceeds 128 KB");
                  const ticket = registrationGuard.current.begin();
                  setCertificate(""); setImportStatus("");
                  await importCertificate(JSON.parse(await file.text()), ticket);
                });
              }} />
            </label>
            <label className="field">
              <span>OR PASTE EXTERNAL CI REGISTRATION JSON</span>
              <textarea value={externalJSON} onChange={e => { registrationGuard.current.invalidate(); setExternalJSON(e.target.value); setCertificate(""); setImportStatus(""); }} placeholder='{"format":"oncm-real-groth16-ci-v1",…}' />
            </label>
            <Button secondary disabled={busy || !externalJSON || externalJSON.length > 128 * 1024} onClick={() => run("Verify pasted registration certificate", () => importCertificate(JSON.parse(externalJSON)))}>Verify pasted registration certificate</Button>
            {importStatus && <p className="note" role="status">{importStatus}</p>}
            <label className="file">
              Upload Lean source or portable JSON package
              <input
                type="file"
                accept=".lean,.json"
                onChange={(e) =>
                  run("Import Lean package", () => upload(e.target.files[0]))
                }
              />
            </label>
            <textarea
              className="code-editor"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setCertificate("");
              }}
              placeholder={"namespace Oncm\ndef goal : Prop := …\nend Oncm"}
            />
            <div className="input-row">
              <Field
                label="Published fixture ID (optional)"
                value={fixture}
                onChange={(value) => {
                  setFixture(value);
                  setCertificate("");
                }}
              />
              <Field
                label="Target declaration"
                value={target}
                onChange={(value) => {
                  setTarget(value);
                  setCertificate("");
                }}
              />
            </div>
            <Button
              secondary
              disabled={busy || !source || job?.status === "Running" || !selectedProfile?.localRunner}
              onClick={() =>
                run("Submit Lean check", () =>
                  start({
                    action: "check",
                    source,
                    goalHash: goal || undefined,
                    profileId: profile,
                    fixtureId: fixture,
                    targetDeclaration: target,
                    outcome: Number(packageDraft?.outcome ?? 1),
                  }),
                  "Lean check submitted; waiting for the worker result",
                )
              }
            >
              Check Lean only
            </Button>
            {job && (
              <div className="job">
                <b>{job.status}{job.phase === 'queued' ? ' · queued' : ''}</b>
                {job.status === 'Running' && <Button secondary disabled={busy} onClick={() => run('Cancel proof job', cancelJob)}>Cancel job</Button>}
                <pre>
                  {job.error ||
                    job.diagnostics ||
                    JSON.stringify(job.result, null, 2)}
                </pre>
              </div>
            )}
            <div className="input-row">
              <Field
                label="Canonical goal hash"
                value={goal}
                onChange={(v) => {
                  setGoal(v);
                  setCertificate("");
                }}
                placeholder="0x…"
              />
              <Field
                label="Immutable proof profile"
                value={profile}
                onChange={(v) => {
                  setProfile(v);
                  setCertificate("");
                }}
              />
            </div>
            <Field
              label="GoalWellFormed certificate"
              value={certificate}
              onChange={value => { setCertificate(value); setImportStatus(""); }}
              placeholder="0x…"
            />
            <p className="note">
              This proves the goal is a well-formed Prop. It does not prove the
              statement and cannot authorize a payout.
            </p>
          </>
        ) : (
          <>
            {kind === 4 && (
              <>
                <Field
                  label="Immutable operator ID"
                  value={operatorId}
                  onChange={setOperatorId}
                />
                <Field
                  label="ABI-encoded arguments"
                  value={operatorArgs}
                  onChange={setOperatorArgs}
                />
                <p className="note">
                  Select a dependency and deadline below, then encode the
                  bundled UnresolvedByV1 operator. Other governance-approved
                  operators may use different ABI arguments.
                </p>
                <Button
                  secondary
                  onClick={() =>
                    run("Encode operator arguments", async () =>
                      setOperatorArgs(
                        AbiCoder.defaultAbiCoder().encode(
                          ["bytes32", "uint64"],
                          [
                            dep,
                            Math.floor(new Date(deadline).getTime() / 1000),
                          ],
                        ),
                      ),
                    )
                  }
                >
                  Encode dependency & deadline
                </Button>
              </>
            )}
            <label className="field">
              <span>EXISTING STATEMENT</span>
              <select value={dep} onChange={(e) => setDep(e.target.value)}>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.metadata.title || short(m.id)}
                  </option>
                ))}
              </select>
            </label>
            {kind !== 2 && (
              <Field
                label="Deadline · local timezone (inclusive)"
                type="datetime-local"
                value={deadline}
                onChange={setDeadline}
              />
            )}{" "}
            {(kind === 2 || kind === 3) && (
              <label className="field">
                <span>TARGET OUTCOME</span>
                <select
                  value={targetOutcome}
                  onChange={(e) => setTargetOutcome(Number(e.target.value))}
                >
                  <option value="1">True</option>
                  <option value="2">False</option>
                </select>
              </label>
            )}
          </>
        )}
        <div className="modal-footer">
          <Button secondary onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy || !sdk?.signer || !title || (kind === 0 && (!certificateClaimMatches(certificate, {goalHash: goal, profileId: profile, outcome: 0}) || !selectedProfile?.installed || !selectedProfile?.newEnabled))
            }
            onClick={() =>
              run("Create market", async () => {
                if (kind === 0) assertCertificateClaim(certificate, {goalHash: goal, profileId: profile, outcome: 0});
                let packageId;
                if (source) {
                  const p = await api("packages", {
                    ...packageDraft,
                    source,
                    title,
                    description,
                    goalHash: goal,
                    profileId: profile,
                    registrationCertificate: certificate,
                    targetDeclaration: target,
                    fixtureId: fixture,
                    registrationResult: job?.result,
                  });
                  packageId = p.id;
                }
                const metadata = {
                  title,
                  description,
                  packageId,
                  externalRef: packageDraft?.externalRef,
                  fixtureId: fixture,
                  targetDeclaration: target,
                };
                if (kind === 0)
                  await sdk.createMath(goal, profile, metadata, certificate);
                else if (kind === 4)
                  await sdk.createOperator(operatorId, operatorArgs, metadata);
                else
                  await sdk.createDerived(
                    kind,
                    dep,
                    kind === 2
                      ? 0
                      : Math.floor(new Date(deadline).getTime() / 1000),
                    kind === 1 ? 0 : targetOutcome,
                    metadata,
                  );
                onClose();
              })
            }
          >
            Create market onchain ↗
          </Button>
        </div>
      </div>
    </div>
  );
}
function Comments({ id, session, signIn, run, onProfile }) {
  const [items, setItems] = useState([]),
    [text, setText] = useState(""),
    [sort, setSort] = useState("top"),
    [reply, setReply] = useState(null);
  const refresh = () =>
    api("comments/" + id + "?sort=" + sort, undefined, session?.token).then(
      setItems,
    );
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [id, sort, session]);
  async function vote(c, value) {
    await api(
      "comments/" + c.id + "/vote",
      { vote: c.myVote === value ? 0 : value },
      session.token,
    );
    refresh();
  }
  function renderComment(c, depth = 0) {
    return (
      <div
        key={c.id}
        className={"comment-thread " + (depth ? "reply-thread" : "")}
      >
        <article className="comment">
          <div className="comment-votes">
            <button
              className={c.myVote === 1 ? "voted" : ""}
              disabled={
                !session ||
                session.address.toLowerCase() === c.address.toLowerCase()
              }
              aria-label={"Upvote comment " + c.id}
              onClick={() => run("Upvote comment", () => vote(c, 1))}
            >
              ▲
            </button>
            <strong>{c.score}</strong>
            <button
              className={c.myVote === -1 ? "voted" : ""}
              disabled={
                !session ||
                session.address.toLowerCase() === c.address.toLowerCase()
              }
              aria-label={"Downvote comment " + c.id}
              onClick={() => run("Downvote comment", () => vote(c, -1))}
            >
              ▼
            </button>
          </div>
          <div className="comment-body">
            <div className="comment-byline">
              <button className="author" onClick={() => onProfile(c.address)}>
                <span className="avatar-small">
                  {(c.profile.displayName || c.address.slice(2, 4))
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <b>{c.profile.displayName || short(c.address)}</b>
                <code>{short(c.address)}</code>
              </button>
              <time>{new Date(c.createdAt).toLocaleString()}</time>
            </div>
            <p>{c.text}</p>
            <div className="comment-actions">
              <button className="link" onClick={() => setReply(c)}>
                Reply
              </button>
              {c.history.length > 0 && (
                <details>
                  <summary>Edited · {c.history.length} revisions</summary>
                  {c.history.map((h, i) => (
                    <p key={i}>{h.text}</p>
                  ))}
                </details>
              )}
              {session?.address.toLowerCase() === c.address.toLowerCase() && (
                <button
                  className="link"
                  onClick={() => {
                    const edited = prompt("Edit comment", c.text);
                    if (edited)
                      run("Edit comment", async () => {
                        const r = await fetch(API + "/api/comments/" + c.id, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: "Bearer " + session.token,
                          },
                          body: JSON.stringify({ text: edited }),
                        });
                        if (!r.ok) throw Error("Could not edit comment");
                        refresh();
                      });
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </article>
        {items
          .filter((x) => x.parentId === c.id)
          .map((x) => renderComment(x, depth + 1))}
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h3>Research discussion</h3>
          <p className="note">
            Wallet profiles identify participants. Discussion votes rank
            comments and carry no protocol voting power.
          </p>
        </div>
        <div className="segmented small">
          <button
            className={sort === "top" ? "active" : ""}
            onClick={() => setSort("top")}
          >
            Top
          </button>
          <button
            className={sort === "new" ? "active" : ""}
            onClick={() => setSort("new")}
          >
            New
          </button>
        </div>
      </div>
      {items.filter((c) => !c.parentId).map((c) => renderComment(c))}
      {!items.length && (
        <p className="note">Be the first to add a mathematical observation.</p>
      )}
      {session ? (
        <div className="comment-composer">
          {reply && (
            <div className="reply-label">
              Replying to {reply.profile.displayName || short(reply.address)}
              <button className="link" onClick={() => setReply(null)}>
                Cancel reply
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              reply ? "Write a reply…" : "Add a mathematical observation…"
            }
          />
          <Button
            disabled={!text.trim()}
            onClick={() =>
              run("Post comment", async () => {
                await api(
                  "comments/" + id,
                  { text, parentId: reply?.id || null },
                  session.token,
                );
                setText("");
                setReply(null);
                refresh();
              })
            }
          >
            {reply ? "Post reply" : "Post comment"} · no gas
          </Button>
        </div>
      ) : (
        <Button secondary onClick={() => run("Sign in with Ethereum", signIn)}>
          Sign in to discuss & vote
        </Button>
      )}
    </div>
  );
}
function ProfileModal({
  address,
  currentAddress,
  session,
  signIn,
  run,
  sdk,
  markets,
  onClose,
  error,
}) {
  const [profile, setProfile] = useState(null),
    [name, setName] = useState(""),
    [bio, setBio] = useState(""),
    [balance, setBalance] = useState("0");
  const own = address.toLowerCase() === currentAddress?.toLowerCase();
  useEffect(() => {
    api("profiles/" + address).then((p) => {
      setProfile(p);
      setName(p.displayName);
      setBio(p.bio);
    });
    if (sdk)
      sdk
        .contract("token")
        .balanceOf(address)
        .then((b) => setBalance(String(b)));
  }, [address, sdk?.deployment.contracts.token]);
  return (
    <div className="modal-overlay">
      <div className="modal profile-modal">
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="section-head">
          <span className="eyebrow">WALLET IDENTITY</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="profile-banner">
          <span className="avatar">
            {(profile?.displayName || address.slice(2, 4))
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <h2>{profile?.displayName || "Anonymous researcher"}</h2>
            <code>{address}</code>
          </div>
        </div>
        <p className="profile-bio">
          {profile?.bio || "This address has not added a bio yet."}
        </p>
        <div className="stats-grid">
          <Stat
            label="AVAILABLE T"
            value={fmt(balance)}
            hint="Public onchain balance"
          />
          <Stat
            label="CREATED MARKETS"
            value={
              markets.filter(
                (m) => m.creator.toLowerCase() === address.toLowerCase(),
              ).length
            }
            hint="From protocol events"
          />
        </div>
        {own && (
          <>
            <div className="rule" />
            <h3>Edit your profile</h3>
            <p className="note">
              Your Ethereum address always remains visible. Names and bios are
              offchain presentation fields.
            </p>
            <Field
              label="Display name"
              value={name}
              onChange={setName}
              maxLength={50}
            />
            <label className="field">
              <span>BIO</span>
              <textarea
                value={bio}
                maxLength={1000}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Research interests, mathematical background…"
              />
            </label>
            {session?.address.toLowerCase() === address.toLowerCase() ? (
              <Button
                onClick={() =>
                  run("Save wallet profile", async () => {
                    const p = await api(
                      "profile",
                      { displayName: name, bio },
                      session.token,
                    );
                    setProfile(p);
                  })
                }
              >
                Save profile · no gas
              </Button>
            ) : (
              <Button
                secondary
                onClick={() => run("Sign in to edit profile", signIn)}
              >
                Sign in with your wallet
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function Portfolio(props) {
  const { sdk, address, markets, run, setPage, setSelected } = props,
    [rows, setRows] = useState([]),
    [t, setT] = useState(0);
  useEffect(() => {
    if (!sdk || !address) return;
    sdk.contract("token").balanceOf(address).then(setT);
    Promise.all(
      markets.map(async (m) => ({ m, s: await sdk.snapshot(m, address) })),
    ).then(setRows);
  }, [sdk, address, markets]);
  return (
    <>
      <Heading
        eyebrow="YOUR CAPITAL"
        title="Portfolio"
        text="Actual token balances, read directly from your local chain."
      />
      <div className="stats-grid">
        <Stat label="AVAILABLE T" value={fmt(t)} hint={short(address)} />
        <Stat
          label="ACCOUNT"
          value={address ? "Connected" : "Disconnected"}
          hint="Outcome positions do not preserve T votes"
        />
      </div>
      {!address ? (
        <div className="empty">Connect a wallet to view positions.</div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Statement</th>
                <th>YES</th>
                <th>NO</th>
                <th>YES LP</th>
                <th>NO LP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, s }) => (
                <tr key={m.id}>
                  <td>{m.metadata.title}</td>
                  {s.balances.slice(1).map((b, i) => (
                    <td key={i}>{fmt(b)}</td>
                  ))}
                  <td>
                    <button
                      className="link"
                      onClick={() => {
                        setSelected(m.id);
                        setPage("markets");
                      }}
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function ExecutionJournal({ sdk, address, run }) {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(false),
    [side, setSide] = useState("All");
  async function refresh() {
    if (!sdk || !address) return;
    setLoading(true);
    try {
      setRows(await sdk.executions(address));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [sdk, address]);
  const visible = rows.filter((r) => side === "All" || r.side === side),
    volume = visible.reduce((n, r) => n + BigInt(r.tAmount), 0n),
    groups = new Map();
  for (const r of visible) {
    const key = r.statementId + r.side + r.direction,
      old = groups.get(key) || { ...r, totalT: 0n, totalOutcome: 0n, count: 0 };
    old.totalT += BigInt(r.tAmount);
    old.totalOutcome += BigInt(r.outcomeAmount);
    old.count++;
    groups.set(key, old);
  }
  return (
    <>
      <Heading
        eyebrow="TRADER WORKSPACE · ONCHAIN FILLS"
        title="Execution journal"
        text="Every row comes from an original V2 Swap event and its transaction sender. Amounts and prices reflect actual fills."
      >
        <Button
          secondary
          disabled={!address || loading}
          onClick={() => run("Refresh execution journal", refresh)}
        >
          ↻ Refresh fills
        </Button>
      </Heading>
      {!address ? (
        <div className="empty">
          Connect a wallet to open its execution journal.
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="SWAP FILLS"
              value={visible.length}
              hint={short(address)}
            />
            <Stat
              label="T VOLUME"
              value={fmt(volume)}
              hint="Sum of T paid and received"
            />
            <Stat
              label="TRANSACTIONS"
              value={new Set(visible.map((r) => r.tx)).size}
              hint="Atomic strategies can produce two fills"
            />
          </div>
          <div className="panel section-head">
            <label className="field">
              <span>OUTCOME SIDE</span>
              <select value={side} onChange={(e) => setSide(e.target.value)}>
                <option>All</option>
                <option>YES</option>
                <option>NO</option>
              </select>
            </label>
            <Button
              secondary
              disabled={!visible.length}
              onClick={() =>
                download(
                  new Blob([sdk.executionsCSV(visible)], { type: "text/csv" }),
                  "exchange-executions.csv",
                )
              }
            >
              Export exact fills · CSV ↓
            </Button>
          </div>
          {loading && (
            <div className="progress">
              <i />
              Reading pool events and receipts…
            </div>
          )}
          <section className="panel">
            <h3>Weighted execution prices</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Statement</th>
                    <th>Side</th>
                    <th>Direction</th>
                    <th>Fills</th>
                    <th>T per outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {[...groups.values()].map((g) => (
                    <tr key={g.statementId + g.side + g.direction}>
                      <td>{g.title}</td>
                      <td>{g.side}</td>
                      <td>{g.direction}</td>
                      <td>{g.count}</td>
                      <td>
                        {g.totalOutcome
                          ? Number(g.totalT) / Number(g.totalOutcome)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h3>Execution ledger</h3>
            <p className="note">
              The fee shown is 0.30% of the input asset, including the protocol
              share. CSV amounts use exact base units (18 decimals). This ledger
              covers swaps through this protocol’s pools; transfers, LP cost
              basis and profit/loss accounting are separate.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Block / time</th>
                    <th>Market</th>
                    <th>Trade</th>
                    <th>Paid</th>
                    <th>Received</th>
                    <th>Input fee</th>
                    <th>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.tx + ":" + r.logIndex}>
                      <td>
                        #{r.block}
                        <small className="table-sub">
                          {new Date(r.timestamp * 1000).toLocaleString()}
                        </small>
                      </td>
                      <td>{r.title}</td>
                      <td className={r.direction === "Buy" ? "green" : "dim"}>
                        {r.direction} {r.side}
                      </td>
                      <td>
                        {fmt(r.amountIn)} {r.inputAsset}
                      </td>
                      <td>
                        {fmt(r.amountOut)} {r.outputAsset}
                      </td>
                      <td>
                        {fmt(r.nominalFeeInput, 6)} {r.inputAsset}
                      </td>
                      <td>
                        <code title={r.tx}>{short(r.tx)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <div className="empty">No swap fills for this address yet.</div>
            )}
          </section>
        </>
      )}
    </>
  );
}
function Heading({ eyebrow, title, text, children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="accent">.</span>
        </h1>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}
function Governance({ sdk, address, run, busy, deployment }) {
  const [snapshot, setSnapshot] = useState(null), [viewError, setViewError] = useState(""),
    [description, setDescription] = useState(""),
    [target, setTarget] = useState(deployment?.contracts.protocol || ""),
    [calldata, setCalldata] = useState(""), [profileId, setProfileId] = useState(""),
    [verifier, setVerifier] = useState(""), [manifest, setManifest] = useState(""),
    [proposalKind, setProposalKind] = useState("profile");
  const request = useRef(0);
  async function refresh() {
    const ticket = ++request.current;
    if (!sdk) return;
    try {
      const next = await sdk.governanceSnapshot(address);
      sdk.assertCurrent?.();
      if (request.current === ticket) { setSnapshot(next); setViewError(""); }
    } catch (e) {
      if (request.current === ticket) { setSnapshot(null); setViewError(e.shortMessage || e.message); }
    }
  }
  useEffect(() => {
    setSnapshot(null); refresh();
    const interval = setInterval(refresh, 6000);
    return () => { request.current++; clearInterval(interval); };
  }, [sdk, address]);
  const items = snapshot?.proposals || [];
  async function proposalAction(p, action, support) {
    const fresh = await sdk.governanceSnapshot(address);
    const current = fresh.proposals.find(x => x.id === p.id);
    if (!current?.actions[action]?.available) throw Error(current?.actions[action]?.reason || "Proposal is no longer actionable");
    sdk.assertCurrent?.();
    if (action === "vote") await sdk.vote(p.id, support);
    else if (action === "cancel") await sdk.cancelProposal(current);
    else await sdk[action](current);
    await refresh();
  }
  async function advance(blocks, seconds = 0) {
    if (![1, 14].includes(blocks) || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86400)
      throw Error("Invalid bounded local clock step");
    if (!sdk || Number((await sdk.provider.getNetwork()).chainId) !== 31372)
      throw Error("Clock controls require actual local chain 31372");
    sdk.assertCurrent?.();
    await api("devnet/advance", { blocks, seconds });
    await refresh();
  }
  return (
    <>
      <Heading eyebrow="OPENZEPPELIN GOVERNOR + TIMELOCK" title="Governance"
        text="Review exact calls, historical T voting power and the current Timelock state." />
      {viewError && <div className="alert">Governance snapshot unavailable: {viewError}</div>}
      <div className="panel">
        <div className="section-head"><div>
          <h3>Your current delegated power · {snapshot ? fmt(snapshot.currentVotes) : "…"} T</h3>
          <p className="note">Escrowed T in CTF or pools does not vote for its original holder. Proposal eligibility uses the previous checkpoint, and voting uses each proposal's historical snapshot.</p>
          {snapshot && <p className="note">Observed block #{snapshot.blockNumber} · {new Date(snapshot.blockTimestamp * 1000).toISOString()}<br />
            Clock: {snapshot.clockMode} · voting delay {snapshot.votingDelay} / period {snapshot.votingPeriod}<br />
            Quorum {snapshot.quorumNumerator}/{snapshot.quorumDenominator} · proposer threshold {fmt(snapshot.proposalThreshold)} T · your proposer checkpoint {fmt(snapshot.proposerVotes)} T<br />
            Timelock <code>{snapshot.timelock}</code> · delay {snapshot.timelockDelay}s · balance {fmt(snapshot.timelockBalance)} ETH</p>}
        </div><Button secondary disabled={!address || !!busy || !snapshot}
          onClick={() => run("Delegate votes", async () => { await sdk.delegate(); await refresh(); })}>Delegate to myself</Button></div>
      </div>
      <div className="two-columns">
        <div className="panel"><h3>Register an immutable version</h3>
          <label className="field"><span>VERSIONED COMPONENT</span><select value={proposalKind} onChange={e => {
            setProposalKind(e.target.value);
            if (e.target.value === "operator") {
              setProfileId(keccak256(toUtf8Bytes("UNRESOLVED_BY_V1")));
              setVerifier(deployment.contracts.operatorSample);
              setManifest("UnresolvedByV1: ABI(bytes32 dependency,uint64 inclusiveDeadline)");
            }
          }}><option value="profile">Lean proof profile</option><option value="operator">Statement operator</option></select></label>
          <Field label="New immutable profile / operator ID" value={profileId} onChange={setProfileId} />
          <Field label="Verifier / operator adapter address" value={verifier} onChange={setVerifier} />
          <Field label="Manifest URI / commitment description" value={manifest} onChange={setManifest} />
          <Button secondary disabled={!sdk || !!busy} onClick={() => run("Encode profile proposal", async () => {
            setTarget(deployment.contracts.protocol);
            setCalldata(sdk.contract("protocol").interface.encodeFunctionData(proposalKind === "operator" ? "addOperator" : "addProfile", [profileId, verifier, manifest]));
            setDescription("Register " + proposalKind + " " + profileId);
          })}>Encode exact registration call</Button>
        </div>
        <div className="panel"><h3>Submit an exact transaction</h3>
          <Field label="Target contract" value={target} onChange={setTarget} />
          <Field label="Calldata" value={calldata} onChange={setCalldata} />
          <Field label="Proposal description" value={description} onChange={setDescription} />
          <p className="note">This composer submits one call with value 0 wei. SDK-created batches are reviewed below with all ordered values; execution sends 0 additional ETH.</p>
          <Button disabled={!!busy || !snapshot?.canPropose || !calldata || !description} onClick={() => run("Propose governance action", async () => {
            const current = await sdk.governanceSnapshot(address);
            if (!current.canPropose) throw Error("Current historical proposer weight is below the threshold");
            await sdk.propose([target], [0], [calldata], description); await refresh();
          })}>Create proposal</Button>
        </div>
      </div>
      <div className="panel"><h3>Local chain clock</h3>
        <p className="note">Chain 31372 produces blocks on transactions. Use one block to enter Active before voting. A 14-block jump can pass the entire voting period.</p>
        <div className="button-row">
          <Button secondary disabled={!!busy || !snapshot} onClick={() => run("Mine one local block", () => advance(1))}>Mine 1 block</Button>
          <Button secondary disabled={!!busy || !snapshot} onClick={() => run("Mine voting blocks", () => advance(14))}>Mine 14 blocks</Button>
          <Button secondary disabled={!!busy || !snapshot} onClick={() => run("Advance local timelock", () => advance(1, Number(snapshot.timelockDelay) + 1))}>Advance timelock delay + 1s</Button>
        </div>
      </div>
      <div className="section-label">ONCHAIN PROPOSALS · {snapshot ? `BLOCK ${snapshot.blockNumber}` : "LOADING"}</div>
      {items.map(p => <div key={p.id} className="panel proposal">
        <div className="section-head"><h3>{p.description}</h3><span className="tag">{p.stateName}</span></div>
        <div className="proposal-details">
          <span>Snapshot #{p.snapshot} → deadline #{p.deadline}</span>
          <span>For {fmt(p.votes[1])} · Against {fmt(p.votes[0])} · Abstain {fmt(p.votes[2])}</span>
          <span>Quorum: {p.quorum === null ? "not available before historical snapshot" : `${fmt(p.quorumVotes)} / ${fmt(p.quorum)} T · ${p.quorumReached ? "reached" : "not reached"}`} (For + Abstain)</span>
          <span>Your historical power: {p.snapshotVotes === null ? "not yet available" : fmt(p.snapshotVotes) + " T"} · {p.hasVoted ? "Already voted" : "Not voted"}</span>
          <span>ETA: {p.eta === "0" ? "not queued" : new Date(Number(p.eta) * 1000).toISOString()} · observed chain time {new Date(snapshot.blockTimestamp * 1000).toISOString()}</span>
        </div>
        <details><summary>Inspect exact targets, values & calldata</summary><pre>{JSON.stringify({ id: p.id, proposer: p.proposer, descriptionHash: p.descriptionHash,
          targets: p.targets, values: p.values, calldatas: p.calldatas, calls: p.calls }, null, 2)}</pre></details>
        <p className="note">Total call value {p.totalValue} wei. Full action preflight uses your address and the same observation block; the chain rechecks it at execution.</p>
        <div className="button-row">
          {p.state === 1 && [["For", 1], ["Against", 0], ["Abstain", 2]].map(([label, support]) => <Button key={label} secondary
            disabled={!!busy || !p.actions.vote.available} title={p.actions.vote.reason}
            onClick={() => run("Cast vote", () => proposalAction(p, "vote", support))}>{label}</Button>)}
          {p.state === 4 && <Button disabled={!!busy || !p.actions.queue.available} title={p.actions.queue.reason}
            onClick={() => run("Queue timelock", () => proposalAction(p, "queue"))}>Queue proposal</Button>}
          {p.state === 5 && <Button disabled={!!busy || !p.actions.execute.available} title={p.actions.execute.reason}
            onClick={() => run("Execute timelock", () => proposalAction(p, "execute"))}>Execute after delay</Button>}
          {p.state === 0 && <Button secondary disabled={!!busy || !p.actions.cancel.available} title={p.actions.cancel.reason}
            onClick={() => run("Cancel pending proposal", () => proposalAction(p, "cancel"))}>Cancel pending proposal</Button>}
        </div>
        {[[1, "vote"], [4, "queue"], [5, "execute"], [0, "cancel"]].filter(([state]) => state === p.state).map(([, action]) =>
          !p.actions[action].available && <p className="note" key={action}>{p.actions[action].reason}</p>)}
      </div>)}
      {snapshot && !items.length && <div className="empty">No proposals yet. All decisions are recorded onchain.</div>}
    </>
  );
}

function Fees({ sdk, address, markets, run, busy, deployment }) {
  const [epochs, setEpochs] = useState([]),
    [proposals, setProposals] = useState([]),
    [rows, setRows] = useState(""),
    [asset, setAsset] = useState(""),
    [balances, setBalances] = useState({});
  const assets = markets.flatMap((m) =>
    m.pairs.map((address, i) => ({
      address,
      label:
        (m.metadata.title || short(m.id)) +
        " · " +
        (i ? "NO" : "YES") +
        "/T LP",
    })),
  );
  async function refresh() {
    if (!sdk) return;
    const a = sdk.contract("allocation"),
      blockTag = Number(await sdk.provider.send("eth_blockNumber", [])),
      snapshot = { blockTag },
      count = Number(await a.currentEpoch(snapshot)),
      pc = Number(await a.proposalCount(snapshot));
    const es = [];
    for (let i = 1; i <= count; i++) {
      const e = await a.epoch(i, snapshot);
      es.push({
        id: i,
        split: e.split,
        recipients: [...e.recipients],
        shares: [...e.shares].map(Number),
      });
    }
    setEpochs(es);
    const ps = [];
    for (let i = 1; i <= pc; i++) {
      const p = await a.proposal(i, snapshot);
      const baseEpoch = es.find((e) => e.id === Number(p.base));
      const required = (await Promise.all((baseEpoch?.recipients || []).map(async (recipient) => ({
        recipient,
        losing: await a.isLosing(i, recipient, snapshot),
        consent: await a.consent(i, recipient, snapshot),
      })))).filter((r) => r.losing);
      const own = required.find((r) => r.recipient.toLowerCase() === address?.toLowerCase());
      const losing = Boolean(own), consent = Boolean(own?.consent);
      ps.push({
        id: i,
        base: Number(p.base),
        recipients: [...p.recipients],
        shares: [...p.shares].map(Number),
        applied: p.applied,
        losing,
        consent,
        required,
        ready: Boolean(baseEpoch) && required.every((r) => r.consent),
        blockTag,
      });
    }
    setProposals(ps);
    if (!rows)
      setRows(
        es
          .at(-1)
          ?.recipients.map((r, i) => r + "," + es.at(-1).shares[i] / 100)
          .join("\n") || "",
      );
    if (asset) {
      const b = {
        collector: String(
          await sdk.erc20(asset).balanceOf(deployment.contracts.allocation),
        ),
        epochs: {},
      };
      for (const e of es)
        b.epochs[e.id] = String(await sdk.erc20(asset).balanceOf(e.split));
      if (address)
        b.warehouse = String(
          (await sdk.contract("warehouse").balanceOf(address, BigInt(asset))) >
            0n
            ? (await sdk
                .contract("warehouse")
                .balanceOf(address, BigInt(asset))) - 1n
            : 0n,
        );
      setBalances(b);
    }
  }
  useEffect(() => {
    refresh().catch(console.error);
    const i = setInterval(() => refresh().catch(console.error), 7000);
    return () => clearInterval(i);
  }, [sdk, address, asset]);
  return (
    <>
      <Heading
        eyebrow="SPLITS V2 · RECEIPT-TIME EPOCHS"
        title="Fee income"
        text="Protocol swap fees arrive as LP tokens. Each collected balance belongs to one immutable allocation epoch."
      />
      <div className="two-columns">
        <section className="panel">
          <h3>Collect & withdraw</h3>
          <label className="field">
            <span>PROTOCOL LP ASSET</span>
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">Choose a market pool</option>
              {assets.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <div className="balance-list">
            <div>
              <span>Unallocated received LP</span>
              <b>{fmt(balances.collector)}</b>
            </div>
            <div>
              <span>Your Warehouse credit</span>
              <b>{fmt(balances.warehouse)}</b>
            </div>
          </div>
          <div className="button-row">
            <Button
              disabled={
                !address || busy || !asset || !(Number(balances.collector) > 0)
              }
              onClick={() =>
                run("Collect fees into current epoch", async () => {
                  await sdk.collect(asset);
                  refresh();
                })
              }
            >
              Collect into epoch {epochs.length}
            </Button>
            <Button
              secondary
              disabled={
                !address || busy || !asset || !(Number(balances.warehouse) > 0)
              }
              onClick={() =>
                run("Withdraw fee LP", async () => {
                  await sdk.withdraw(asset);
                  refresh();
                })
              }
            >
              Withdraw my LP
            </Button>
          </div>
          <p className="note">
            V2 mints protocol LP on add/remove liquidity. Its value is realized
            by removing liquidity and redeeming the outcome token. Pool trading
            continues after proof resolution.
          </p>
        </section>
        <section className="panel">
          <h3>Propose a new allocation</h3>
          <p className="note">
            One address and percentage per line. Total 100%. Every beneficiary
            whose percentage falls must consent; anyone can apply the complete
            proposal.
          </p>
          <textarea
            className="code-editor"
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            placeholder="0xAddress,60\n0xAddress,40"
          />
          <Button
            disabled={!address || busy}
            onClick={() =>
              run("Propose allocation", async () => {
                const parsed = rows
                  .trim()
                  .split("\n")
                  .map((line) => {
                    const [a, s] = line.split(",");
                    return {
                      address: a.trim(),
                      share: Math.round(Number(s) * 100),
                    };
                  });
                await sdk.proposeAllocation(parsed);
                refresh();
              })
            }
          >
            Propose distribution
          </Button>
        </section>
      </div>
      <div className="section-label">ALLOCATION PROPOSALS</div>
      {proposals.map((p) => (
        <section className="panel" key={p.id}>
          <div className="section-head">
            <h3>
              Proposal #{p.id} · based on epoch {p.base}
            </h3>
            <span className="tag">
              {p.applied
                ? "Applied"
                : p.base !== epochs.length
                  ? "Stale"
                  : p.ready ? "Ready to apply" : "Awaiting consent"}
            </span>
          </div>
          <table>
            <tbody>
              {p.recipients.map((r, i) => (
                <tr key={r}>
                  <td>
                    <code>{r}</code>
                  </td>
                  <td>{p.shares[i] / 100}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Required consents at block #{p.blockTag}:</p>
          {p.required.length ? (
            <ul>{p.required.map((r) => (
              <li key={r.recipient}><code>{r.recipient}</code> · {r.consent ? "Consented" : "Consent missing"}</li>
            ))}</ul>
          ) : <p className="note">No beneficiary's share decreases.</p>}
          {!p.applied && p.base === epochs.length && (
            <div className="button-row">
              {p.losing && (
                <Button
                  secondary
                  disabled={busy || !address}
                  onClick={() =>
                    run(
                      p.consent ? "Revoke consent" : "Consent to reduced share",
                      async () => {
                        await sdk.consent(p.id, !p.consent);
                        refresh();
                      },
                    )
                  }
                >
                  {p.consent ? "Revoke my consent" : "Consent to my reduction"}
                </Button>
              )}
              <Button
                disabled={busy || !address || !p.ready}
                onClick={() =>
                  run("Apply allocation", async () => {
                    await sdk.applyAllocation(p.id);
                    refresh();
                  })
                }
              >
                Apply when all losing recipients consent
              </Button>
            </div>
          )}
        </section>
      ))}
      <div className="section-label">IMMUTABLE EPOCHS</div>
      <div className="two-columns">
        {epochs.toReversed().map((e) => (
          <section className="panel" key={e.id}>
            <div className="section-head">
              <h3>Epoch {e.id}</h3>
              <span className="tag">
                {e.id === epochs.length ? "Current" : "Historical"}
              </span>
            </div>
            <code className="address">{e.split}</code>
            <table>
              <tbody>
                {e.recipients.map((r, i) => (
                  <tr key={r}>
                    <td>{short(r)}</td>
                    <td>{e.shares[i] / 100}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Selected LP available: {fmt(balances.epochs?.[e.id])}</p>
            <Button
              secondary
              disabled={busy || !address || !asset}
              onClick={() =>
                run("Distribute epoch income", async () => {
                  await sdk.distribute(e.id, asset);
                  refresh();
                })
              }
            >
              Distribute to Warehouse
            </Button>
          </section>
        ))}
      </div>
    </>
  );
}
function Activity({ run, initialHash }) {
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(null),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false);
  async function refresh(before) {
    setLoading(true);
    try {
      setData(
        await api(
          "activity" + (before !== undefined ? "?before=" + before : ""),
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (initialHash)
      run("Read confirmed transaction", () => inspect(initialHash));
  }, [initialHash]);
  async function inspect(hash) {
    setSelected(await api("activity/" + hash));
  }
  return (
    <>
      <Heading
        eyebrow="LOCAL BLOCK EXPLORER · CHAIN 31372"
        title="Block activity"
        text="Follow actual transactions, contract events and balance changes. Every state transition has a block and a transaction hash."
      >
        <Button
          secondary
          disabled={loading}
          onClick={() => run("Refresh blocks", () => refresh())}
        >
          ↻ Latest blocks
        </Button>
      </Heading>
      <div className="panel input-row">
        <input
          className="grow"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Inspect a transaction hash · 0x…"
        />
        <Button
          secondary
          onClick={() => run("Inspect transaction", () => inspect(search))}
        >
          Inspect transaction
        </Button>
      </div>
      {selected && (
        <section className="panel">
          <div className="section-head">
            <h3>Transaction in block #{selected.block}</h3>
            <button className="close" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <code className="address">{selected.hash}</code>
          <p className="note">
            From {selected.from}
            <br />
            To {selected.to}
          </p>
          <p className="note">
            Balances compare the end of the previous block with the end of this
            block. Multiple transactions in one block share the same balance
            snapshot.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Actor</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {selected.balances.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <code title={b.asset}>{short(b.asset)}</code>
                    </td>
                    <td>
                      <code title={b.actor}>{short(b.actor)}</code>
                    </td>
                    <td>{fmt(b.before)}</td>
                    <td>{fmt(b.after)}</td>
                    <td
                      className={
                        BigInt(b.after) >= BigInt(b.before) ? "green" : "red"
                      }
                    >
                      {fmt(BigInt(b.after) - BigInt(b.before))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {loading && (
        <div className="progress">
          <i />
          Reading blocks and receipts…
        </div>
      )}
      {data?.blocks.map((b) => (
        <section className="panel block" key={b.hash}>
          <div className="section-head">
            <h3>
              <span className="accent">#</span>
              {b.number}{" "}
              <small>
                {b.transactions.length} transaction
                {b.transactions.length !== 1 ? "s" : ""}
              </small>
            </h3>
            <time>{new Date(b.timestamp * 1000).toLocaleString()}</time>
          </div>
          <code className="block-hash">{b.hash}</code>
          {b.transactions.map((tx) => (
            <details className="transaction" key={tx.hash}>
              <summary>
                <span className={tx.status ? "green" : "red"}>
                  {tx.status ? "● Confirmed" : "● Reverted"}
                </span>
                <code>{short(tx.hash)}</code>
                <span>
                  {short(tx.from)} → {short(tx.to) || "Contract creation"}
                </span>
                <b>{tx.events.length} events</b>
              </summary>
              <div className="transaction-content">
                <code className="address">{tx.hash}</code>
                <p className="note">
                  Gas used {Number(tx.gasUsed).toLocaleString()}
                </p>
                {tx.events.map((e, i) => (
                  <div className="event" key={i}>
                    <b>{e.event}</b>
                    <span>
                      {e.contract} · {short(e.address)}
                    </span>
                    <pre>{JSON.stringify(e.args, null, 2)}</pre>
                  </div>
                ))}
                <Button
                  secondary
                  onClick={() =>
                    run("Read historical balances", () => inspect(tx.hash))
                  }
                >
                  Inspect balances for this block
                </Button>
              </div>
            </details>
          ))}
        </section>
      ))}
      {data?.next !== null && (
        <Button
          secondary
          disabled={loading}
          onClick={() => run("Read earlier blocks", () => refresh(data.next))}
        >
          Earlier blocks ↓
        </Button>
      )}
    </>
  );
}
function Research({ run, onImport }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [entryId, setEntryId] = useState(""),
    [entryVersion, setEntryVersion] = useState("1");
  useEffect(() => {
    api("palomar")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const raw = data?.data,
    items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.entries)
        ? raw.entries
        : Array.isArray(raw?.records)
          ? raw.records
          : [];
  return (
    <>
      <Heading
        eyebrow="EXTERNAL RESEARCH · OFFCHAIN DISCOVERY"
        title="Palomar library"
        text="Explore published Lean repository snapshots. A registry entry is discovery metadata; this protocol separately verifies the exact kernel goal."
      />
      <section className="panel">
        <div className="section-head">
          <h3>Import a published result</h3>
          <Button onClick={onImport}>Upload Lean package →</Button>
        </div>
        <p>
          Pin the repository commit, toolchain and dependencies, select the
          exact declaration and build its registration certificate. Source text
          and descriptions do not authorize resolution.
        </p>
        <div className="button-row">
          <a
            className="button secondary"
            href="https://palomar-registry.org"
            target="_blank"
            rel="noreferrer"
          >
            Open Palomar ↗
          </a>
          <a
            className="button secondary"
            href="https://github.com/leanprover/comparator"
            target="_blank"
            rel="noreferrer"
          >
            Lean Comparator ↗
          </a>
        </div>
        <div className="rule" />
        <div className="input-row">
          <Field
            label="Any exact Palomar ID"
            value={entryId}
            onChange={setEntryId}
            placeholder="PALOMAR-YYYY-MM-DD-NNNNNN"
          />
          <Field
            label="Version"
            value={entryVersion}
            onChange={setEntryVersion}
            type="number"
          />
          <Button
            secondary
            disabled={!entryId}
            onClick={() =>
              run("Import exact registry version", async () =>
                onImport(
                  await api("palomar/import", {
                    id: entryId,
                    version: Number(entryVersion),
                  }),
                ),
              )
            }
          >
            Import pinned entry
          </Button>
        </div>
      </section>
      {error ? (
        <div className="alert">
          Registry request unavailable: {error}. Package import still works.
        </div>
      ) : !data ? (
        <div className="progress">
          <i />
          Loading published registry data…
        </div>
      ) : (
        <>
          <input
            className="search"
            placeholder="Search the 200 most recent registry entries…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {items.length ? (
            items
              .filter((i) =>
                JSON.stringify(i).toLowerCase().includes(filter.toLowerCase()),
              )
              .slice(0, 100)
              .map((entry, i) => (
                <section className="panel" key={i}>
                  <h3>
                    {entry.title ||
                      entry.name ||
                      entry.id ||
                      "Published snapshot " + (i + 1)}
                  </h3>
                  <p>{entry.abstract}</p>
                  <p className="note">
                    {entry.id} · version {entry.version} ·{" "}
                    {entry.source?.repository}
                    <br />
                    Commit <code>{entry.source?.commit}</code>
                  </p>
                  <details>
                    <summary>Declarations and snapshot metadata</summary>
                    <pre>{JSON.stringify(entry, null, 2)}</pre>
                  </details>
                  <div className="button-row">
                    <Button
                      secondary
                      onClick={() =>
                        download(
                          new Blob([JSON.stringify(entry, null, 2)], {
                            type: "application/json",
                          }),
                          "palomar-snapshot.json",
                        )
                      }
                    >
                      Export snapshot metadata
                    </Button>
                    <Button
                      onClick={() =>
                        run("Import pinned Palomar snapshot", async () => {
                          const p = await api("palomar/import", {
                            id: entry.id,
                            version: entry.version,
                          });
                          onImport(p);
                        })
                      }
                    >
                      Import exact snapshot & goal →
                    </Button>
                  </div>
                </section>
              ))
          ) : (
            <section className="panel">
              <h3>Registry response</h3>
              <pre>{JSON.stringify(raw, null, 2)}</pre>
            </section>
          )}
          <p className="note">Live data source: {data.source}</p>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
