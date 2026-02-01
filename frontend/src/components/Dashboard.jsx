import { useState, useEffect } from 'react';

const BOTS_API = '/api/bots';
const WALLETS_API = '/api/wallets';
const POLL_MS = 6000;
const WALLET_LOOP_MS = 4000;

const CHAINS = [
  { key: 'walletEthereum', label: 'Ethereum', icon: '/icons/eth.svg' },
  { key: 'walletSolana', label: 'Solana', icon: '/icons/sol.svg' },
  { key: 'walletBnb', label: 'BNB', icon: '/icons/bnb.svg' },
  { key: 'walletBitcoin', label: 'Bitcoin', icon: '/icons/btc.svg' },
  { key: 'walletLitecoin', label: 'Litecoin', icon: '/icons/ltc.svg' },
  { key: 'walletTron', label: 'Tron', icon: '/icons/tron.svg' },
];
const IN_ICON = '📥';
const OUT_ICON = '📤';

function getBotEthAddress(bot) {
  const raw = bot?.walletEthereum || bot?.walletAddress || '';
  return (raw && String(raw).trim()) ? String(raw).trim() : null;
}

function getBotAddress(bot, key) {
  if (key === 'walletEthereum') return bot?.walletEthereum || bot?.walletAddress || '';
  return bot?.[key] || '';
}

const DATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'year', label: 'This year' },
  { id: 'month', label: 'This month' },
  { id: 'week', label: 'This week' },
  { id: 'today', label: 'Today' },
];

export default function Dashboard({ selectedBotId, selectedWalletTypeKey, onSelectedBotIdChange, onSelectedWalletTypeChange, onBackToBots }) {
  const [bots, setBots] = useState([]);
  const [ethWallet, setEthWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChainKey, setSelectedChainKey] = useState(''); // user dropdown → controls table
  const [summaryLoopKey, setSummaryLoopKey] = useState(''); // auto-loop only → summary card
  const [dateFilter, setDateFilter] = useState('all');

  const [bnbWallet, setBnbWallet] = useState(null);
  const [tronWallet, setTronWallet] = useState(null);
  const [btcWallet, setBtcWallet] = useState(null);
  const [ltcWallet, setLtcWallet] = useState(null);
  const [solWallet, setSolWallet] = useState(null);

  const selectedBot = bots.find((b) => b._id === selectedBotId);
  const walletsInBot = selectedBot
    ? CHAINS.filter((c) => (getBotAddress(selectedBot, c.key) || '').trim().length > 0)
    : [];
  const summaryChain = walletsInBot.find((c) => c.key === summaryLoopKey) || walletsInBot[0];
  const isSummaryEthereum = summaryChain?.key === 'walletEthereum';
  const isSummaryBnb = summaryChain?.key === 'walletBnb';
  const isSummaryTron = summaryChain?.key === 'walletTron';
  const isSummaryBtc = summaryChain?.key === 'walletBitcoin';
  const isSummaryLtc = summaryChain?.key === 'walletLitecoin';
  const isSummarySol = summaryChain?.key === 'walletSolana';
  const selectedChain = walletsInBot.find((c) => c.key === selectedChainKey) || walletsInBot[0];
  const isSelectedEthereum = selectedChain?.key === 'walletEthereum';
  const isSelectedBnb = selectedChain?.key === 'walletBnb';
  const isSelectedTron = selectedChain?.key === 'walletTron';
  const isSelectedBtc = selectedChain?.key === 'walletBitcoin';
  const isSelectedLtc = selectedChain?.key === 'walletLitecoin';
  const isSelectedSol = selectedChain?.key === 'walletSolana';

  // Sync dropdown (user selection) from URL/session; never touched by auto-loop
  useEffect(() => {
    if (walletsInBot.length === 0) {
      setSelectedChainKey('');
      setSummaryLoopKey('');
      return;
    }
    const validKey = selectedWalletTypeKey && walletsInBot.some((c) => c.key === selectedWalletTypeKey)
      ? selectedWalletTypeKey
      : walletsInBot[0].key;
    setSelectedChainKey(validKey);
    if (validKey !== selectedWalletTypeKey && onSelectedWalletTypeChange) {
      onSelectedWalletTypeChange(validKey);
    }
    if (!summaryLoopKey || !walletsInBot.some((c) => c.key === summaryLoopKey)) {
      setSummaryLoopKey(walletsInBot[0].key);
    }
  }, [selectedBotId, selectedWalletTypeKey, walletsInBot.length]);

  // Auto-loop: only updates summary card, never dropdown/table
  useEffect(() => {
    if (walletsInBot.length <= 1) return;
    const id = setInterval(() => {
      const idx = walletsInBot.findIndex((c) => c.key === summaryLoopKey);
      const nextIdx = idx < 0 || idx >= walletsInBot.length - 1 ? 0 : idx + 1;
      setSummaryLoopKey(walletsInBot[nextIdx].key);
    }, WALLET_LOOP_MS);
    return () => clearInterval(id);
  }, [walletsInBot.length, summaryLoopKey]);

  const loadBots = async () => {
    try {
      const res = await fetch(BOTS_API);
      if (!res.ok) throw new Error('Failed to load bots');
      const data = await res.json();
      setBots(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  // Clear selection if selected bot was deleted
  useEffect(() => {
    if (bots.length > 0 && selectedBotId && !selectedBot && onSelectedBotIdChange) {
      onSelectedBotIdChange('');
    }
  }, [bots.length, selectedBotId, selectedBot, onSelectedBotIdChange]);

  const ethAddr = selectedBot ? getBotEthAddress(selectedBot) : null;
  const bnbAddrRaw = selectedBot ? (getBotAddress(selectedBot, 'walletBnb') || '').trim() : '';
  const bnbAddr = bnbAddrRaw && bnbAddrRaw.startsWith('0x') && bnbAddrRaw.length >= 40 ? bnbAddrRaw : null;
  const tronAddrRaw = selectedBot ? (getBotAddress(selectedBot, 'walletTron') || '').trim() : '';
  const tronAddr = tronAddrRaw && tronAddrRaw.length >= 34 ? tronAddrRaw : null;
  const btcAddrRaw = selectedBot ? (getBotAddress(selectedBot, 'walletBitcoin') || '').trim() : '';
  const btcAddr = btcAddrRaw && btcAddrRaw.length >= 25 ? btcAddrRaw : null;
  const ltcAddrRaw = selectedBot ? (getBotAddress(selectedBot, 'walletLitecoin') || '').trim() : '';
  const ltcAddr = ltcAddrRaw && ltcAddrRaw.length >= 25 ? ltcAddrRaw : null;
  const solAddrRaw = selectedBot ? (getBotAddress(selectedBot, 'walletSolana') || '').trim() : '';
  const solAddr = solAddrRaw && solAddrRaw.length >= 32 ? solAddrRaw : null;

  const loadEthWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}`);
      if (!res.ok) return;
      const data = await res.json();
      setEthWallet(data);
    } catch (_) {
      setEthWallet(null);
    }
  };

  useEffect(() => {
    if (ethAddr) {
      setLoading(true);
      loadEthWallet(ethAddr).finally(() => setLoading(false));
    } else {
      setEthWallet(null);
    }
  }, [ethAddr]);

  useEffect(() => {
    if (!ethAddr) return;
    const id = setInterval(() => loadEthWallet(ethAddr), POLL_MS);
    return () => clearInterval(id);
  }, [ethAddr]);

  const loadBnbWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}?walletType=BNB`);
      if (!res.ok) return;
      const data = await res.json();
      setBnbWallet(data);
    } catch (_) {
      setBnbWallet(null);
    }
  };

  useEffect(() => {
    if (bnbAddr) {
      setLoading(true);
      loadBnbWallet(bnbAddr).finally(() => setLoading(false));
    } else {
      setBnbWallet(null);
    }
  }, [bnbAddr]);

  useEffect(() => {
    if (!bnbAddr) return;
    const id = setInterval(() => loadBnbWallet(bnbAddr), POLL_MS);
    return () => clearInterval(id);
  }, [bnbAddr]);

  const loadTronWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}?walletType=Tron`);
      if (!res.ok) return;
      const data = await res.json();
      setTronWallet(data);
    } catch (_) {
      setTronWallet(null);
    }
  };

  useEffect(() => {
    if (tronAddr) {
      setLoading(true);
      loadTronWallet(tronAddr).finally(() => setLoading(false));
    } else {
      setTronWallet(null);
    }
  }, [tronAddr]);

  useEffect(() => {
    if (!tronAddr) return;
    const id = setInterval(() => loadTronWallet(tronAddr), POLL_MS);
    return () => clearInterval(id);
  }, [tronAddr]);

  const loadBtcWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}?walletType=Bitcoin`);
      if (!res.ok) return;
      const data = await res.json();
      setBtcWallet(data);
    } catch (_) {
      setBtcWallet(null);
    }
  };
  const loadLtcWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}?walletType=Litecoin`);
      if (!res.ok) return;
      const data = await res.json();
      setLtcWallet(data);
    } catch (_) {
      setLtcWallet(null);
    }
  };
  const loadSolWallet = async (addr) => {
    if (!addr || !addr.trim()) return;
    try {
      const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}?walletType=Solana`);
      if (!res.ok) return;
      const data = await res.json();
      setSolWallet(data);
    } catch (_) {
      setSolWallet(null);
    }
  };

  useEffect(() => {
    if (btcAddr) {
      setLoading(true);
      loadBtcWallet(btcAddr).finally(() => setLoading(false));
    } else setBtcWallet(null);
  }, [btcAddr]);
  useEffect(() => {
    if (!btcAddr) return;
    const id = setInterval(() => loadBtcWallet(btcAddr), POLL_MS);
    return () => clearInterval(id);
  }, [btcAddr]);

  useEffect(() => {
    if (ltcAddr) {
      setLoading(true);
      loadLtcWallet(ltcAddr).finally(() => setLoading(false));
    } else setLtcWallet(null);
  }, [ltcAddr]);
  useEffect(() => {
    if (!ltcAddr) return;
    const id = setInterval(() => loadLtcWallet(ltcAddr), POLL_MS);
    return () => clearInterval(id);
  }, [ltcAddr]);

  useEffect(() => {
    if (solAddr) {
      setLoading(true);
      loadSolWallet(solAddr).finally(() => setLoading(false));
    } else setSolWallet(null);
  }, [solAddr]);
  useEffect(() => {
    if (!solAddr) return;
    const id = setInterval(() => loadSolWallet(solAddr), POLL_MS);
    return () => clearInterval(id);
  }, [solAddr]);

  if (!bots.length) {
    return (
      <div>
        {onBackToBots && (
          <button type="button" onClick={onBackToBots} className="btn btn-ghost btn-icon" style={{ marginBottom: '1.5rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Bots
          </button>
        )}
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
          <p>No bots yet. Create a bot on the Bots page first.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* One row: Bots | Wallet type dropdown | Wallet type / Balance / Value (USD) summary */}
      <div className="dashboard-top-row">
        {onBackToBots && (
          <button type="button" onClick={onBackToBots} className="btn btn-ghost btn-icon" style={{ whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Bots
          </button>
        )}
        {selectedBot && walletsInBot.length > 0 && (
          <>
            <label htmlFor="dashboard-wallet-type" className="dashboard-wallet-type-label">
              Wallet type
            </label>
            <select
              id="dashboard-wallet-type"
              value={selectedChainKey}
              onChange={(e) => {
                const key = e.target.value;
                setSelectedChainKey(key);
                if (onSelectedWalletTypeChange) onSelectedWalletTypeChange(key);
              }}
              className="dashboard-wallet-type-select"
            >
              {walletsInBot.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {(isSelectedEthereum && ethAddr) || (isSelectedBnb && bnbAddr) || (isSelectedTron && tronAddr) || (isSelectedBtc && btcAddr) || (isSelectedLtc && ltcAddr) || (isSelectedSol && solAddr) ? (
              <div className="tx-date-filters tx-date-filters-inline">
                {DATE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDateFilter(f.id)}
                    className={`tx-filter-btn ${dateFilter === f.id ? 'active' : ''}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="tx-summary tx-summary-animate" key={`summary-${summaryLoopKey}`}>
              <div className="tx-summary-item tx-summary-wallet-type">
                <strong>Wallet</strong>
                <span className="tx-summary-chain">
                  {summaryChain?.icon && <img src={summaryChain.icon} alt="" width="20" height="20" className="tx-summary-chain-icon" />}
                  {summaryChain?.label || '—'}
                </span>
              </div>
              <div className="tx-summary-item">
                <strong>Balance</strong>
                <span className="mono">
                  {isSummaryEthereum && ethWallet ? (ethWallet.ethBalance || '—') : isSummaryBnb && bnbWallet ? (bnbWallet.ethBalance || '—') : isSummaryTron && tronWallet ? (tronWallet.ethBalance || '—') : isSummaryBtc && btcWallet ? (btcWallet.ethBalance || '—') : isSummaryLtc && ltcWallet ? (ltcWallet.ethBalance || '—') : isSummarySol && solWallet ? (solWallet.ethBalance || '—') : (isSummaryEthereum && loading) || (isSummaryBnb && loading) || (isSummaryTron && loading) || (isSummaryBtc && loading) || (isSummaryLtc && loading) || (isSummarySol && loading) ? '…' : '—'}
                </span>
              </div>
              <div className="tx-summary-item">
                <strong>Value (USD)</strong>
                <span className="mono">
                  {isSummaryEthereum && ethWallet ? (ethWallet.ethValue || '—') : isSummaryBnb && bnbWallet ? (bnbWallet.ethValue || '—') : isSummaryTron && tronWallet ? (tronWallet.ethValue || '—') : isSummaryBtc && btcWallet ? (btcWallet.ethValue || '—') : isSummaryLtc && ltcWallet ? (ltcWallet.ethValue || '—') : isSummarySol && solWallet ? (solWallet.ethValue || '—') : (isSummaryEthereum && loading) || (isSummaryBnb && loading) || (isSummaryTron && loading) || (isSummaryBtc && loading) || (isSummaryLtc && loading) || (isSummarySol && loading) ? '…' : '—'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {error && <div style={{ color: 'var(--warning)', marginBottom: '1rem' }}>{error}</div>}

      {!selectedBotId && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
          <p>Go to Bots and click a wallet address or &quot;View on Dashboard&quot; to see wallets here.</p>
        </div>
      )}

      {selectedBot && walletsInBot.length > 0 && (
        <>
          {loading && ((isSummaryEthereum && !ethWallet && ethAddr) || (isSummaryBnb && !bnbWallet && bnbAddr) || (isSummaryTron && !tronWallet && tronAddr) || (isSummaryBtc && !btcWallet && btcAddr) || (isSummaryLtc && !ltcWallet && ltcAddr) || (isSummarySol && !solWallet && solAddr)) && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading…</div>
          )}

          {/* Table: driven by dropdown (selectedChainKey), not by auto-loop */}
          {isSelectedEthereum && ethAddr && ethWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={ethWallet.transactions || []} walletAddress={ethWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} />
            </div>
          )}
          {isSelectedEthereum && ethAddr && !ethWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading transactions…</div>
          )}
          {isSelectedEthereum && ethAddr && !ethWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No wallet data yet. Run the bot to fetch Ethereum transactions.</div>
          )}
          {isSelectedEthereum && !ethAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no Ethereum address. Add one to see transactions here.
            </div>
          )}
          {isSelectedBnb && bnbAddr && bnbWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={bnbWallet.transactions || []} walletAddress={bnbWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} explorerBaseUrl="https://bscscan.com" />
            </div>
          )}
          {isSelectedBnb && bnbAddr && !bnbWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading BNB transactions…</div>
          )}
          {isSelectedBnb && bnbAddr && !bnbWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No BNB wallet data yet. Run the bot to fetch BNB transactions.</div>
          )}
          {isSelectedBnb && !bnbAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no BNB address. Add one to see transactions here.
            </div>
          )}
          {isSelectedTron && tronAddr && tronWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={tronWallet.transactions || []} walletAddress={tronWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} explorerBaseUrl="https://tronscan.org/#/transaction" explorerTxPath="/" />
            </div>
          )}
          {isSelectedTron && tronAddr && !tronWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading Tron transactions…</div>
          )}
          {isSelectedTron && tronAddr && !tronWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No Tron wallet data yet. Run the bot to fetch Tron transactions.</div>
          )}
          {isSelectedTron && !tronAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no Tron address. Add one to see transactions here.
            </div>
          )}
          {isSelectedBtc && btcAddr && btcWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={btcWallet.transactions || []} walletAddress={btcWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} explorerBaseUrl="https://blockstream.info/tx" explorerTxPath="/" />
            </div>
          )}
          {isSelectedBtc && btcAddr && !btcWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading Bitcoin transactions…</div>
          )}
          {isSelectedBtc && btcAddr && !btcWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No Bitcoin wallet data yet. Run the bot to fetch Bitcoin transactions.</div>
          )}
          {isSelectedBtc && !btcAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no Bitcoin address. Add one to see transactions here.
            </div>
          )}
          {isSelectedLtc && ltcAddr && ltcWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={ltcWallet.transactions || []} walletAddress={ltcWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} explorerBaseUrl="https://litecoinspace.org/tx" explorerTxPath="/" />
            </div>
          )}
          {isSelectedLtc && ltcAddr && !ltcWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading Litecoin transactions…</div>
          )}
          {isSelectedLtc && ltcAddr && !ltcWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No Litecoin wallet data yet. Run the bot to fetch Litecoin transactions.</div>
          )}
          {isSelectedLtc && !ltcAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no Litecoin address. Add one to see transactions here.
            </div>
          )}
          {isSelectedSol && solAddr && solWallet && (
            <div className="card-fade">
              <TransactionsTable transactions={solWallet.transactions || []} walletAddress={solWallet.address} dateFilter={dateFilter} onDateFilterChange={setDateFilter} explorerBaseUrl="https://explorer.solana.com/tx" explorerTxPath="/" />
            </div>
          )}
          {isSelectedSol && solAddr && !solWallet && loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Loading Solana transactions…</div>
          )}
          {isSelectedSol && solAddr && !solWallet && !loading && (
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No Solana wallet data yet. Run the bot to fetch Solana transactions.</div>
          )}
          {isSelectedSol && !solAddr && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              This bot has no Solana address. Add one to see transactions here.
            </div>
          )}
          {!isSelectedEthereum && !isSelectedBnb && !isSelectedTron && !isSelectedBtc && !isSelectedLtc && !isSelectedSol && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              Transactions not available for {selectedChain?.label} yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const IST_TZ = 'Asia/Kolkata';

function parseAgeDate(ageStr) {
  if (!ageStr || typeof ageStr !== 'string') return null;
  const trimmed = String(ageStr).trim();
  if (!trimmed) return null;
  const iso = trimmed.replace(/\s+(\d{1,2}):(\d{2}):(\d{2})$/, 'T$1:$2:$3Z');
  let d = new Date(iso);
  if (!isNaN(d.getTime())) return d;
  d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/** Format age string for display in IST (all steps use IST). */
function formatAgeIST(ageStr) {
  const d = parseAgeDate(ageStr);
  if (!d) return ageStr || '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' (IST)';
}

function ageToAgo(ageStr) {
  const d = parseAgeDate(ageStr);
  if (!d) return ageStr || '—';
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);
  const years = Math.floor(days / 365);
  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  if (min > 0) return `${min} min ago`;
  if (sec > 0) return `${sec}s ago`;
  return 'just now';
}

/** Start of current day in IST (as Date). */
function getStartOfDayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);
}

/** Start of "this week" filter: 7 days before start of today in IST. */
function getStartOfWeekIST() {
  const startDay = getStartOfDayIST();
  return new Date(startDay.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/** Start of current month in IST. */
function getStartOfMonthIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffset);
}

/** Start of current year in IST. */
function getStartOfYearIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return new Date(Date.UTC(istNow.getUTCFullYear(), 0, 1) - istOffset);
}

function filterByDateRange(transactions, filterId) {
  if (filterId === 'all') return transactions;
  let start;
  if (filterId === 'today') {
    start = getStartOfDayIST();
  } else if (filterId === 'week') {
    start = getStartOfWeekIST();
  } else if (filterId === 'month') {
    start = getStartOfMonthIST();
  } else if (filterId === 'year') {
    start = getStartOfYearIST();
  } else {
    return transactions;
  }
  return transactions.filter((tx) => {
    const d = parseAgeDate(tx.age);
    return d && d >= start;
  });
}

const PAGE_SIZE = 10;

function TransactionsTable({ transactions, walletAddress, dateFilter = 'all', onDateFilterChange, explorerBaseUrl = 'https://etherscan.io', explorerTxPath = '/tx/' }) {
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...(transactions || [])].sort((a, b) => {
    const da = parseAgeDate(a.age)?.getTime() ?? 0;
    const db = parseAgeDate(b.age)?.getTime() ?? 0;
    return db - da;
  });
  const filtered = filterByDateRange(sorted, dateFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const mainAddr = (walletAddress || '').toLowerCase();

  useEffect(() => {
    setPage(0);
  }, [dateFilter]);

  if (!transactions?.length) {
    return (
      <p style={{ color: 'var(--muted)' }}>No transactions saved yet. When the bot finds new transactions, they will appear here.</p>
    );
  }

  const columns = ['Transaction Hash', 'Method', 'Block', 'Age', 'From', 'In/Out', 'To', 'Amount', 'Amount (USD)', 'Token', 'Txn Fee'];

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {columns.map((col) => (
                <th key={col} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((tx) => {
              const isFromMain = mainAddr && tx.from && tx.from.toLowerCase() === mainAddr;
              const isToMain = mainAddr && tx.to && tx.to.toLowerCase() === mainAddr;
              return (
                <tr key={`${tx.transactionHash}-${tx.token || 'eth'}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem' }} className="mono">
                    <a href={`${explorerBaseUrl}${explorerTxPath}${tx.transactionHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {tx.transactionHash.slice(0, 10)}…{tx.transactionHash.slice(-8)}
                    </a>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{tx.method || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }} className="mono">{tx.block || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }} title={formatAgeIST(tx.age)}>{ageToAgo(tx.age)}</td>
                  <td style={{ padding: '0.75rem 1rem', ...(isFromMain ? { color: 'var(--accent)', fontWeight: 600 } : {}) }} className="mono" title={tx.from}>
                    {tx.from ? `${tx.from.slice(0, 8)}…${tx.from.slice(-6)}` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {tx.inOut ? (
                      <span className={tx.inOut === 'IN' ? 'flow-in' : tx.inOut === 'OUT' ? 'flow-out' : ''} style={!tx.inOut || (tx.inOut !== 'IN' && tx.inOut !== 'OUT') ? { background: 'rgba(139, 148, 158, 0.2)', color: 'var(--muted)' } : undefined}>
                        {tx.inOut === 'IN' && `${IN_ICON} `}
                        {tx.inOut === 'OUT' && `${OUT_ICON} `}
                        {tx.inOut}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', ...(isToMain ? { color: 'var(--accent)', fontWeight: 600 } : {}) }} className="mono" title={tx.to}>
                    {tx.to ? `${tx.to.slice(0, 8)}…${tx.to.slice(-6)}` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }} className="mono">{tx.amount || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }} className="mono">{tx.amountUsd || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{tx.token || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }} className="mono">{tx.txnFee || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Page {safePage + 1} of {totalPages} ({filtered.length} transaction{filtered.length !== 1 ? 's' : ''})
        </span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage <= 0}
              className="btn btn-ghost"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="btn btn-ghost"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
