import { useState, useEffect } from 'react';

const API = '/api/bots';
const WALLETS_API = '/api/wallets';
const POLL_MS = 6000;

const CHAINS = [
  { key: 'walletEthereum', label: 'Ethereum', icon: '/icons/eth.svg' },
  { key: 'walletSolana', label: 'Solana', icon: '/icons/sol.svg' },
  { key: 'walletBnb', label: 'BNB', icon: '/icons/bnb.svg' },
  { key: 'walletBitcoin', label: 'Bitcoin', icon: '/icons/btc.svg' },
  { key: 'walletLitecoin', label: 'Litecoin', icon: '/icons/ltc.svg' },
  { key: 'walletTron', label: 'Tron', icon: '/icons/tron.svg' },
];

const emptyWallets = () => Object.fromEntries(CHAINS.map((c) => [c.key, '']));

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function getBotEthAddress(bot) {
  const raw = bot?.walletEthereum || bot?.walletAddress || '';
  return (raw && String(raw).trim()) ? String(raw).trim() : null;
}

function getBotAddress(bot, key) {
  if (key === 'walletEthereum') return bot?.walletEthereum || bot?.walletAddress || '';
  return bot?.[key] || '';
}

function formatBalance(str, maxDigits = 10) {
  if (str == null || str === '' || String(str).trim() === '' || str === '—') return str === undefined || str === null ? '—' : str;
  const num = parseFloat(str);
  if (Number.isNaN(num)) return str;
  if (num === 0) return '0';
  const s = num.toPrecision(maxDigits);
  return s.includes('e') ? s : s.replace(/\.?0+$/, '') || s;
}

function ChainIcon({ chain, size = 20 }) {
  return (
    <img
      src={chain.icon}
      alt={chain.label}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling?.classList?.add('show'); }}
    />
  );
}

export default function Admin({ onSelectWallet }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [wallets, setWallets] = useState(emptyWallets());
  const [selectedBotId, setSelectedBotId] = useState('');
  const [botWallets, setBotWallets] = useState({});

  const WALLET_TYPE_QUERY = {
    walletEthereum: '',
    walletBnb: '?walletType=BNB',
    walletTron: '?walletType=Tron',
    walletBitcoin: '?walletType=Bitcoin',
    walletLitecoin: '?walletType=Litecoin',
    walletSolana: '?walletType=Solana',
  };

  const loadBots = async () => {
    try {
      const res = await fetch(API);
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

  const botIdList = bots.length ? bots.map((b) => b._id).sort().join(',') : '';

  useEffect(() => {
    if (bots.length === 0) {
      setBotWallets({});
      return;
    }
    const fetchAll = async () => {
      const next = {};
      for (const bot of bots) {
        const id = bot._id;
        next[id] = {};
        for (const c of CHAINS) {
          const addr = (getBotAddress(bot, c.key) || '').trim();
          if (!addr) continue;
          try {
            const q = WALLET_TYPE_QUERY[c.key] || '';
            const res = await fetch(`${WALLETS_API}/${encodeURIComponent(addr)}${q}`);
            if (res.ok) next[id][c.key] = await res.json();
          } catch (_) {}
        }
      }
      setBotWallets((prev) => ({ ...prev, ...next }));
    };
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [botIdList]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditId(null);
    setName('');
    setDiscordWebhookUrl('');
    setWallets(emptyWallets());
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (bot) => {
    setModalMode('edit');
    setEditId(bot._id);
    setName(bot.name);
    setDiscordWebhookUrl(bot.discordWebhookUrl || '');
    setWallets({
      walletEthereum: bot.walletEthereum || bot.walletAddress || '',
      walletSolana: bot.walletSolana || '',
      walletBnb: bot.walletBnb || '',
      walletBitcoin: bot.walletBitcoin || '',
      walletLitecoin: bot.walletLitecoin || '',
      walletTron: bot.walletTron || '',
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditId(null);
    setName('');
    setDiscordWebhookUrl('');
    setWallets(emptyWallets());
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Bot name is required');
      return;
    }
    setLoading(true);
    try {
      const payload = { name: name.trim(), discordWebhookUrl: discordWebhookUrl.trim(), ...Object.fromEntries(CHAINS.map((c) => [c.key, (wallets[c.key] || '').trim()])) };
      if (modalMode === 'create') {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create bot');
        closeModal();
        await loadBots();
        setSelectedBotId(data._id);
      } else {
        const res = await fetch(`${API}/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update bot');
        setBots((prev) => prev.map((b) => (b._id === editId ? data : b)));
        if (selectedBotId === editId) setSelectedBotId(editId);
        closeModal();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setBots((prev) => prev.filter((b) => b._id !== id));
      if (selectedBotId === id) setSelectedBotId('');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRun = async (id) => {
    try {
      const res = await fetch(`${API}/${id}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run');
      setBots((prev) => prev.map((b) => (b._id === id ? { ...b, isRunning: true } : b)));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleStop = async (id) => {
    try {
      const res = await fetch(`${API}/${id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop');
      setBots((prev) => prev.map((b) => (b._id === id ? { ...b, isRunning: false } : b)));
    } catch (e) {
      setError(e.message);
    }
  };

  function getWalletForChain(bot, chainKey) {
    return botWallets[bot._id]?.[chainKey] ?? null;
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600 }}>Bots</h2>
      </div>

      {error && !modalOpen && <div style={{ color: 'var(--warning)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

      <div className="admin-cards-grid">
        {bots.map((bot) => {
          const firstWalletKey = CHAINS.find((c) => (getBotAddress(bot, c.key) || '').trim())?.key;
          return (
            <div
              key={bot._id}
              className="admin-bot-card card card-fade"
              onClick={() => {
                if (onSelectWallet && firstWalletKey) {
                  onSelectWallet(bot, firstWalletKey);
                } else {
                  setSelectedBotId((prev) => (prev === bot._id ? '' : bot._id));
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="admin-bot-card-header">
                <h3 className="admin-bot-card-title">{bot.name}</h3>
                <span className={`admin-bot-badge ${bot.isRunning ? 'running' : 'stopped'}`}>
                  {bot.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <div className="admin-bot-card-chains">
                {CHAINS.map((c) => {
                  const wallet = getWalletForChain(bot, c.key);
                  const balance = formatBalance(wallet?.ethBalance ?? '—');
                  const value = wallet?.ethValue ?? '—';
                  return (
                    <div key={c.key} className="admin-bot-chain-row">
                      <ChainIcon chain={c} size={22} />
                      <span className="admin-bot-chain-label">{c.label}</span>
                      <span className="admin-bot-chain-balance mono">{balance}</span>
                      <span className="admin-bot-chain-value mono">{value}</span>
                    </div>
                  );
                })}
              </div>
              <div className="admin-bot-card-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => openEditModal(bot)} className="btn btn-ghost btn-icon" title="Edit">
                  <IconEdit /> Edit
                </button>
                {bot.isRunning ? (
                  <button type="button" onClick={() => handleStop(bot._id)} className="btn btn-icon admin-btn-stop" title="Stop">
                    <IconStop /> Stop
                  </button>
                ) : (
                  <button type="button" onClick={() => handleRun(bot._id)} className="btn btn-icon admin-btn-run" title="Run">
                    <IconPlay /> Run
                  </button>
                )}
                <button type="button" onClick={() => handleDelete(bot._id)} className="btn btn-ghost btn-icon admin-btn-delete" title="Delete">
                  <IconTrash /> Delete
                </button>
              </div>
            </div>
          );
        })}
        <div
          className="admin-bot-card admin-bot-card-add card card-fade"
          onClick={openCreateModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCreateModal(); } }}
          aria-label="Create bot"
        >
          <div className="admin-bot-card-add-inner">
            <span className="admin-bot-card-add-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="admin-bot-card-add-label">Add bot</span>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modalMode === 'create' ? 'Create bot' : 'Edit bot'}</h3>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && modalOpen && <div style={{ color: 'var(--warning)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}
                <div className="form-group">
                  <label className="form-label">Bot name</label>
                  <input type="text" className="form-input" placeholder="My bot" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Discord webhook URL (alerts for new transactions)</label>
                  <input type="url" className="form-input mono" placeholder="https://discord.com/api/webhooks/..." value={discordWebhookUrl} onChange={(e) => setDiscordWebhookUrl(e.target.value)} />
                </div>
                {CHAINS.map((c) => (
                  <div key={c.key} className="form-group form-group-with-icon">
                    <label className="form-label">
                      <img src={c.icon} alt="" width="18" height="18" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                      {c.label}
                    </label>
                    <input
                      type="text"
                      className="form-input mono"
                      placeholder={`${c.label} address`}
                      value={wallets[c.key] || ''}
                      onChange={(e) => setWallets((prev) => ({ ...prev, [c.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={closeModal} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? 'Saving…' : (modalMode === 'create' ? 'Create' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
