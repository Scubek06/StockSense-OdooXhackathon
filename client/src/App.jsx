import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowRight, Boxes, Check, ChevronDown,
  CircleAlert, ClipboardList, Command, Home, LogOut, Menu, Package, Plus, Search, Trash2,
  Settings, ShieldCheck, SlidersHorizontal, Truck, UserRound, Warehouse, X,
} from 'lucide-react';
import { listOf, request } from './services/api.js';

const groups = [
  { title: 'WORKSPACE', links: [{ id: 'dashboard', label: 'Dashboard', icon: Home }] },
  { title: 'CATALOG', links: [{ id: 'products', label: 'All products', icon: Package }, { id: 'categories', label: 'Categories', icon: Boxes }, { id: 'reorder', label: 'Reordering rules', icon: SlidersHorizontal }] },
  { title: 'OPERATIONS', links: [{ id: 'receipts', label: 'Receipts', icon: ArrowDownToLine }, { id: 'deliveries', label: 'Delivery orders', icon: Truck }, { id: 'transfers', label: 'Internal transfers', icon: ArrowLeftRight }, { id: 'adjustments', label: 'Inventory adjustments', icon: ClipboardList }, { id: 'ledger', label: 'Move history', icon: Activity }] },
  { title: 'FACILITIES', links: [{ id: 'warehouse', label: 'Warehouses & locations', icon: Warehouse }, { id: 'settings', label: 'Settings', icon: Settings }] },
];

const titles = {
  dashboard: ['Inventory overview', 'A live view of stock and warehouse activity.'],
  products: ['Product catalog', 'Manage your items, units, and stock thresholds.'],
  categories: ['Categories', 'Organize products into practical groups.'],
  reorder: ['Reordering rules', 'Monitor products approaching their reorder point.'],
  receipts: ['Receipts', 'Record inbound stock. Quantities change when validated.'],
  deliveries: ['Delivery orders', 'Fulfil outgoing orders with available stock.'],
  transfers: ['Internal transfers', 'Move stock between storage locations.'],
  adjustments: ['Inventory adjustments', 'Reconcile counted stock with system quantities.'],
  ledger: ['Move history', 'A traceable record of validated stock operations.'],
  warehouse: ['Warehouses & locations', 'Manage the physical layout of your inventory.'],
  settings: ['Settings', 'Workspace and account preferences.'],
};
const operations = ['receipts', 'deliveries', 'transfers', 'adjustments'];
const statusClass = (status) => `status status-${String(status || 'draft').toLowerCase()}`;
const get = (object, ...keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null);
const emptyData = () => ({ products: [], categories: [], warehouses: [], locations: [], stock: [], ledger: [], receipts: [], deliveries: [], transfers: [], adjustments: [], dashboard: {} });

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('stocksense-token'));
  const [restoringSession, setRestoringSession] = useState(() => Boolean(localStorage.getItem('stocksense-token')));
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [documentFilter, setDocumentFilter] = useState('');
  const [data, setData] = useState(emptyData);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);
  const [deletingLocationId, setDeletingLocationId] = useState(null);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  const loadPage = useCallback(async () => {
    const sessionToken = localStorage.getItem('stocksense-token');
    if (!sessionToken) return;
    setLoading(true);
    setError('');
    try {
      const [products, categories, warehouses, locations] = await Promise.all([
        request('/products'), request('/categories'), request('/warehouses'), request('/locations'),
      ]);
      const next = {
        products: listOf(products), categories: listOf(categories),
        warehouses: listOf(warehouses), locations: listOf(locations),
      };
      const filters = new URLSearchParams();
      if (warehouseFilter) filters.set('warehouseId', warehouseFilter);
      if (locationFilter) filters.set('locationId', locationFilter);
      if (categoryFilter) filters.set('categoryId', categoryFilter);
      if (statusFilter) filters.set('status', statusFilter.toLowerCase());
      if (documentFilter) filters.set('kind', documentFilter);
      if (page === 'dashboard') {
        next.dashboard = (await request(`/dashboard${filters.size ? `?${filters}` : ''}`)).summary;
        const stockFilters = new URLSearchParams();
        if (warehouseFilter) stockFilters.set('warehouseId', warehouseFilter);
        if (locationFilter) stockFilters.set('locationId', locationFilter);
        if (categoryFilter) stockFilters.set('categoryId', categoryFilter);
        next.products = listOf(await request(`/products${stockFilters.size ? `?${stockFilters}` : ''}`));
        if (statusFilter && statusFilter.toLowerCase() !== 'done') next.ledger = [];
        else {
          const recentFilters = new URLSearchParams(filters);
          recentFilters.delete('status');
          recentFilters.set('limit', '5');
          next.ledger = listOf(await request(`/ledger?${recentFilters}`));
        }
      }
      if (operations.includes(page)) next[page] = listOf(await request(`/operations/${page}${filters.size ? `?${filters}` : ''}`));
      if (page === 'ledger') next.ledger = listOf(await request(`/ledger${filters.size ? `?${filters}` : ''}`));
      if (page === 'warehouse') {
        const stockFilters = new URLSearchParams();
        if (warehouseFilter) stockFilters.set('warehouseId', warehouseFilter);
        next.stock = listOf(await request(`/stock${stockFilters.size ? `?${stockFilters}` : ''}`));
      }
      if (localStorage.getItem('stocksense-token') === sessionToken) {
        setData((current) => ({ ...current, ...next }));
      }
    } catch (e) {
      if (localStorage.getItem('stocksense-token') === sessionToken) setError(e.message);
    } finally {
      if (localStorage.getItem('stocksense-token') === sessionToken) setLoading(false);
    }
  }, [page, warehouseFilter, locationFilter, categoryFilter, statusFilter, documentFilter]);

  useEffect(() => {
    if (!token) {
      setRestoringSession(false);
      return undefined;
    }
    let active = true;
    const tokenBeingChecked = token;
    const isCurrentSession = () => active && localStorage.getItem('stocksense-token') === tokenBeingChecked;
    request('/auth/me')
      .then((result) => {
        if (isCurrentSession()) setUser(result.user || result);
      })
      .catch(() => {
        if (!isCurrentSession()) return;
        localStorage.removeItem('stocksense-token');
        setToken(null);
        setUser(null);
        setData(emptyData());
      })
      .finally(() => {
        if (isCurrentSession()) setRestoringSession(false);
      });
    return () => { active = false; };
  }, [token]);
  useEffect(() => { if (token && user) loadPage(); }, [token, user, loadPage]);

  const logout = async () => {
    const revocation = request('/auth/logout', { method: 'POST' });
    localStorage.removeItem('stocksense-token');
    setToken(null);
    setRestoringSession(false);
    setUser(null);
    setPage('dashboard');
    setMenuOpen(false);
    setSearch('');
    setCategoryFilter('');
    setWarehouseFilter('');
    setLocationFilter('');
    setStatusFilter('');
    setDocumentFilter('');
    setData(emptyData());
    setLoading(false);
    setBusy(false);
    setError('');
    setDialog(null);
    setDialogError('');
    setDeletingCategoryId(null);
    setDeletingLocationId(null);
    try { await revocation; }
    catch (e) { setError(`Signed out locally; server token revocation failed: ${e.message}`); }
  };
  const login = async (credentials, action) => {
    setBusy(true); setError('');
    try {
      const result = await request(`/auth/${action}`, { method: 'POST', body: credentials });
      if (result?.token) {
        localStorage.setItem('stocksense-token', result.token);
        setToken(result.token); setUser(result.user || result.profile || null);
      } else notify(result?.otp || result?.reset_code || result?.code ? `Demo reset code: ${result.otp || result.reset_code || result.code}` : result?.message || 'If the account exists, a reset code has been issued.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const saveEntity = async (path, method, body, message) => {
    setBusy(true);
    setDialogError('');
    try {
      await request(path, { method, body });
      setDialog(null); await loadPage(); notify(message);
    } catch (e) { setDialogError(e.message); }
    finally { setBusy(false); }
  };
  const deleteCategory = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? Categories assigned to products cannot be deleted.`)) return;
    setDeletingCategoryId(item.id);
    setBusy(true);
    try {
      await request(`/categories/${item.id}`, { method: 'DELETE' });
      await loadPage(); notify('Category deleted.');
    } catch (e) { setError(e.message); }
    finally {
      setDeletingCategoryId(null);
      setBusy(false);
    }
  };
  const deleteLocation = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? Locations referenced by inventory or operation history cannot be deleted.`)) return;
    setDeletingLocationId(item.id);
    setBusy(true);
    try {
      await request(`/locations/${item.id}`, { method: 'DELETE' });
      await loadPage(); notify('Location deleted.');
    } catch (e) { setError(e.message); }
    finally {
      setDeletingLocationId(null);
      setBusy(false);
    }
  };
  const validateOperation = async (type, id) => {
    if (!window.confirm('Validate this operation? Stock will be updated and recorded in the ledger.')) return;
    setBusy(true);
    try {
      await request(`/operations/${type}/${id}/validate`, { method: 'POST' });
      await loadPage(); notify('Operation validated. Stock ledger updated.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const updateOperationStatus = async (type, id, status) => {
    setBusy(true);
    try {
      await request(`/operations/${type}/${id}/status`, { method: 'PATCH', body: { status } });
      await loadPage(); notify(`Operation moved to ${status}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const cancelOperation = async (type, id) => {
    if (!window.confirm('Cancel this draft operation? Stock will remain unchanged.')) return;
    setBusy(true);
    try {
      await request(`/operations/${type}/${id}/cancel`, { method: 'POST' });
      await loadPage(); notify('Operation canceled.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const deleteProduct = async (item) => {
    if (!window.confirm(`Delete ${item.name}? This is only possible when it has no stock or movement history.`)) return;
    setBusy(true);
    try {
      await request(`/products/${item.id}`, { method: 'DELETE' });
      await loadPage(); notify('Product deleted.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const rows = useMemo(() => {
    if (page === 'products' || page === 'reorder') {
      return data.products.filter((p) => {
        const name = `${p.name || ''} ${p.sku || p.code || ''}`.toLowerCase();
        const matchesSearch = name.includes(search.toLowerCase()) && (!categoryFilter || String(get(p, 'categoryId', 'category_id')) === categoryFilter);
        const quantity = Number(get(p, 'onHand', 'total_stock', 'quantity', 'current_stock', 'stock') || 0);
        return matchesSearch && (page !== 'reorder' || quantity <= Number(get(p, 'reorderLevel', 'reorder_level') || 0));
      });
    }
    if (page === 'categories') return data.categories.filter((c) => String(c.name || '').toLowerCase().includes(search.toLowerCase()));
    if (page === 'warehouse') return data.locations.filter((l) => !warehouseFilter || String(get(l, 'warehouseId', 'warehouse_id')) === warehouseFilter);
    if (operations.includes(page)) {
      return data[page].filter((record) => {
        const status = String(get(record, 'status', 'state') || '').toLowerCase();
        return (!statusFilter || status === statusFilter.toLowerCase()) && JSON.stringify(record).toLowerCase().includes(search.toLowerCase());
      });
    }
    if (page === 'ledger') return data.ledger.filter((entry) => JSON.stringify(entry).toLowerCase().includes(search.toLowerCase()));
    return [];
  }, [page, data, search, categoryFilter, warehouseFilter, statusFilter]);

  if (restoringSession) {
    return <div className="auth-screen" aria-busy="true"><div className="loading-note" role="status" style={{ gridColumn: '1 / -1', placeSelf: 'center' }}><Activity size={15} /> Restoring your secure session…</div></div>;
  }
  if (!token || !user) {
    return <AuthScreen onSubmit={login} error={error} busy={busy} />;
  }

  const [heading, subheading] = titles[page] || titles.dashboard;
  const selectPage = (id) => { setPage(id); setSearch(''); setError(''); setMenuOpen(false); };
  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Command size={19} /></span><span>stock<span className="brand-light">sense</span><small>INVENTORY CONTROL</small></span><button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={17} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">N</span><span><b>Northstar Works</b><small>Operations workspace</small></span><ChevronDown size={15} /></div>
        <nav>{groups.map((group) => <section className="nav-group" key={group.title}><p>{group.title}</p>{group.links.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectPage(id)} className={`nav-link ${page === id ? 'active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'reorder' && data.dashboard?.lowStockItems > 0 && <i className="nav-count">{data.dashboard.lowStockItems}</i>}</button>)}</section>)}</nav>
        <div className="sidebar-foot"><div className="secure-chip"><ShieldCheck size={15} /><span>Secure session</span><i /></div><button className="account-link" onClick={() => selectPage('profile')}><span className="user-avatar">{(user.name || user.email || 'U').slice(0, 1).toUpperCase()}</span><span className="account-name"><b>{user.name || user.full_name || 'Inventory user'}</b><small>{user.email}</small></span><ChevronDown size={15} /></button><button className="account-link logout-link" onClick={logout}><LogOut size={15} /> Sign out</button></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb">StockSense <span>/</span> <b>{heading}</b></div><div className="top-actions"><div className="system-state"><i /> SYSTEM OPERATIONAL</div><button className="top-avatar" title="My profile" onClick={() => selectPage('profile')}>{(user.name || user.email || 'U').slice(0, 1).toUpperCase()}</button></div></header>
        <div className="content">
          <div className="page-heading"><div><div className="eyebrow">WAREHOUSE CONTROL <span>•</span> LIVE</div><h1>{heading}</h1><p>{subheading}</p></div>{page === 'warehouse' ? <div className="heading-actions"><button className="button button-secondary" onClick={() => setDialog({ type: 'warehouse' })}><Plus size={16} />New warehouse</button><button className="button button-primary" onClick={() => { setDialogError(''); setDialog({ type: 'location' }); }}><Plus size={16} />New location</button></div> : ['products', 'categories', ...operations].includes(page) && <button className="button button-primary" onClick={() => setDialog({ type: page === 'products' ? 'product' : page === 'categories' ? 'category' : ({ receipts: 'receipt', deliveries: 'delivery', transfers: 'transfer', adjustments: 'adjustment' })[page] })}><Plus size={16} />{page === 'products' ? 'New product' : page === 'categories' ? 'New category' : `New ${({ receipts: 'receipt', deliveries: 'delivery', transfers: 'transfer', adjustments: 'adjustment' })[page]}`}</button>}</div>
          {error && <div className="alert alert-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {loading && <div className="loading-note" role="status"><Activity size={15} /> Syncing warehouse records…</div>}
          {!loading && !error && page === 'dashboard' && <Dashboard dashboard={data.dashboard} products={data.products} ledger={data.ledger} onNavigate={selectPage} onWarehouse={setWarehouseFilter} warehouse={warehouseFilter} warehouses={data.warehouses} locations={data.locations} categories={data.categories} location={locationFilter} onLocation={setLocationFilter} category={categoryFilter} onCategory={setCategoryFilter} status={statusFilter} onStatus={setStatusFilter} document={documentFilter} onDocument={setDocumentFilter} onRefresh={loadPage} />}
          {!loading && !error && ['products', 'categories', 'reorder', 'warehouse', ...operations, 'ledger'].includes(page) && <section className="panel table-panel">
            <div className="table-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search records" placeholder="Search by name, SKU, or reference..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="toolbar-filters">
              {page === 'products' && <select aria-label="Filter category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              {(operations.includes(page) || page === 'ledger' || page === 'warehouse') && <select aria-label="Filter warehouse" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}><option value="">All warehouses</option>{data.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
              {operations.includes(page) && <select aria-label="Filter status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{['Draft', 'Waiting', 'Ready', 'Done', 'Canceled'].map((s) => <option key={s}>{s}</option>)}</select>}
              <span className="record-count">{rows.length} records</span>
            </div></div>
            {page === 'products' || page === 'reorder' ? <ProductTable rows={rows} onEdit={(item) => setDialog({ type: 'product', item })} onDelete={deleteProduct} /> :
              page === 'categories' ? <CategoryTable rows={rows} onEdit={(item) => { setDialogError(''); setDialog({ type: 'category', item }); }} onDelete={deleteCategory} deletingCategoryId={deletingCategoryId} busy={busy} /> :
              page === 'warehouse' ? <LocationTable rows={rows} warehouses={data.warehouses} stock={data.stock} onEdit={(item) => { setDialogError(''); setDialog({ type: 'location', item }); }} onDelete={deleteLocation} deletingLocationId={deletingLocationId} busy={busy} /> :
              page === 'ledger' ? <LedgerTable rows={rows} /> :
              <OperationTable rows={rows} type={page} onValidate={validateOperation} onStatus={updateOperationStatus} onCancel={cancelOperation} />}
          </section>}
          {page === 'settings' && <section className="panel settings-panel"><Settings size={24} /><div><h3>Inventory workspace</h3><p>Stock updates are recorded after an operation is validated. Session authentication uses a signed bearer token.</p><button className="button button-secondary" onClick={() => selectPage('warehouse')}>Manage warehouse locations <ArrowRight size={15} /></button></div></section>}
          {page === 'profile' && <section className="panel settings-panel"><span className="profile-large">{(user.name || user.email || 'U').slice(0, 1).toUpperCase()}</span><div><h3>{user.name || user.full_name || 'Inventory user'}</h3><p>{user.email}</p><p>Signed in to the Northstar Works inventory workspace.</p><button className="button button-secondary" onClick={logout}><LogOut size={15} /> Sign out</button></div></section>}
        </div>
      </main>
      {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      {dialog && <EntityDialog type={dialog.type} item={dialog.item} data={data} busy={busy} error={dialogError} onDismissError={() => setDialogError('')} onClose={() => { setDialog(null); setError(''); setDialogError(''); }} onSave={(path, method, body) => saveEntity(path, method, body, 'Changes saved successfully.')} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function AuthScreen({ onSubmit, error, busy }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({ name: '', email: '', password: '', otp: '', newPassword: '' });
  const change = (key) => (e) => setValues({ ...values, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (mode === 'register') onSubmit({ name: values.name, email: values.email, password: values.password }, 'register');
    if (mode === 'login') onSubmit({ email: values.email, password: values.password }, 'login');
    if (mode === 'request') onSubmit({ email: values.email }, 'reset/request');
    if (mode === 'confirm') onSubmit({ email: values.email, otp: values.otp, newPassword: values.newPassword }, 'reset/confirm');
  };
  const title = { login: 'Welcome back', register: 'Create your account', request: 'Reset your password', confirm: 'Choose a new password' }[mode];
  return <div className="auth-screen"><div className="auth-art"><div className="auth-grid" /><div className="auth-brand"><span className="brand-mark"><Command size={19} /></span>stock<span className="brand-light">sense</span></div><div className="auth-copy"><div className="eyebrow">WAREHOUSE CONTROL SYSTEM</div><h1>Know your stock.<br /><span>Move with confidence.</span></h1><p>A clearer view of every product, location, and movement across your operation.</p><div className="auth-art-stats"><span><b>01</b> &nbsp;LIVE INVENTORY</span><span><b>02</b> &nbsp;TRACEABLE MOVES</span><span><b>03</b> &nbsp;CONTROLLED ACCESS</span></div></div><div className="auth-art-foot">STOCKSENSE <span>•</span> INVENTORY OPERATIONS <span>•</span> 2026</div></div><div className="auth-form-side"><form className="auth-form" onSubmit={submit}><div className="eyebrow">NORTHSTAR WORKS <span>•</span> SECURE ACCESS</div><h2>{title}</h2><p className="auth-intro">{mode === 'login' ? 'Sign in to your inventory workspace.' : mode === 'register' ? 'Start tracking your inventory with StockSense.' : mode === 'request' ? 'We’ll issue a one-time reset code for your account.' : 'Enter your reset code and a new password.'}</p>{error && <div className="alert alert-error"><CircleAlert size={17} /><span>{error}</span></div>}
    {mode === 'register' && <Field label="Full name" value={values.name} onChange={change('name')} required autoComplete="name" />}
    <Field label="Email address" value={values.email} onChange={change('email')} type="email" required autoComplete="email" />
    {(mode === 'login' || mode === 'register') && <Field label="Password" value={values.password} onChange={change('password')} type="password" required minLength="8" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
    {mode === 'confirm' && <><Field label="One-time reset code" value={values.otp} onChange={change('otp')} required /><Field label="New password" value={values.newPassword} onChange={change('newPassword')} type="password" minLength="8" required /></>}
    <button disabled={busy} className="button button-primary auth-submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to workspace' : mode === 'register' ? 'Create account' : mode === 'request' ? 'Request reset code' : 'Reset password'} <ArrowRight size={16} /></button>
    <div className="auth-switch">{mode === 'login' ? <><button type="button" onClick={() => setMode('request')}>Forgot password?</button><span>New to StockSense? <button type="button" onClick={() => setMode('register')}>Create account</button></span></> : <button type="button" onClick={() => setMode('login')}>Back to sign in</button>}</div>
    {mode === 'request' && <button type="button" className="text-button" onClick={() => setMode('confirm')}>I have a reset code</button>}
  </form></div></div>;
}

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}

function Dashboard({ dashboard, products, ledger, onNavigate, onWarehouse, warehouse, warehouses, locations, location, onLocation, categories, category, onCategory, status, onStatus, document, onDocument, onRefresh }) {
  const summary = dashboard || {};
  const stats = [
    { label: 'PRODUCTS IN STOCK', value: get(summary, 'totalProductsInStock') ?? '—', icon: Boxes, tone: 'blue', detail: 'Unique products with stock on hand' },
    { label: 'LOW STOCK', value: get(summary, 'lowStockItems') ?? '—', icon: CircleAlert, tone: 'amber', detail: 'At or below reorder level' },
    { label: 'OUT OF STOCK', value: get(summary, 'outOfStockItems') ?? '—', icon: Package, tone: 'red', detail: 'Requires replenishment' },
    { label: 'PENDING RECEIPTS', value: get(summary, 'pendingReceipts') ?? '—', icon: ArrowDownToLine, tone: 'green', detail: 'Awaiting validation' },
    { label: 'PENDING DELIVERIES', value: get(summary, 'pendingDeliveries') ?? '—', icon: Truck, tone: 'blue', detail: 'Awaiting dispatch' },
    { label: 'SCHEDULED TRANSFERS', value: get(summary, 'scheduledInternalTransfers') ?? '—', icon: ArrowLeftRight, tone: 'slate', detail: 'In progress or waiting' },
  ];
  const inStock = Math.max(0, Number(summary.totalProductsInStock || 0) - Number(summary.lowStockItems || 0));
  return <><div className="dash-toolbar"><div className="live-stamp"><span /> LIVE INVENTORY SNAPSHOT <span className="stamp-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div className="toolbar-filters dashboard-filters"><select value={document} onChange={(e) => onDocument(e.target.value)} aria-label="Dashboard document type"><option value="">All document types</option><option value="receipt">Receipts</option><option value="delivery">Deliveries</option><option value="transfer">Transfers</option><option value="adjustment">Adjustments</option></select><select value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Dashboard status"><option value="">All statuses</option>{['Draft', 'Waiting', 'Ready', 'Done', 'Canceled'].map((s) => <option key={s}>{s}</option>)}</select><select value={warehouse} onChange={(e) => onWarehouse(e.target.value)} aria-label="Dashboard warehouse"><option value="">All warehouses</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select><select value={location} onChange={(e) => onLocation(e.target.value)} aria-label="Dashboard location"><option value="">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select value={category} onChange={(e) => onCategory(e.target.value)} aria-label="Dashboard category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="button button-secondary small-button" onClick={onRefresh}><Activity size={15} /> Refresh</button></div></div>
    <div className="stats-grid">{stats.map(({ label, value, icon: Icon, tone, detail }) => <article className="stat-card panel" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={16} /></span></div><strong>{value}</strong><small>{detail}</small></article>)}</div>
    <div className="dashboard-grid"><section className="panel stock-panel"><div className="panel-heading"><div><span className="eyebrow">STOCK HEALTH</span><h2>Inventory at a glance</h2></div><button className="text-button" onClick={() => onNavigate('products')}>View catalog <ArrowRight size={14} /></button></div><div className="stock-summary"><div><span className="summary-dot in-stock" /><span>Healthy stock</span><b>{inStock}</b></div><div><span className="summary-dot low-stock" /><span>Low stock</span><b>{get(summary, 'lowStockItems') ?? '—'}</b></div><div><span className="summary-dot out-stock" /><span>Out of stock</span><b>{get(summary, 'outOfStockItems') ?? '—'}</b></div></div><div className="stock-chart"><div className="chart-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="chart-area"><div className="chart-lines"><i /><i /><i /><i /><i /></div>{products.slice(0, 8).map((p, i) => <div className="chart-bar-wrap" key={p.id || p.sku || i}><div className={`chart-bar bar-${i % 5}`} style={{ height: `${Math.max(8, Math.min(100, Number(get(p, 'onHand', 'quantity', 'stock') || 0) / Math.max(Number(get(p, 'reorderLevel', 'reorder_level') || 10) * 2, 1) * 100))}%` }} title={p.name} /><small>{(p.name || 'Item').split(' ')[0].slice(0, 7)}</small></div>)}</div></div></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent movements</h2></div><button className="icon-button" aria-label="View full history" onClick={() => onNavigate('ledger')}><ArrowRight size={17} /></button></div>{ledger.length ? <div className="activity-list">{ledger.slice(0, 5).map((item, i) => <ActivityRow key={item.id || i} item={item} />)}</div> : <div className="empty-state compact"><div className="empty-icon"><Activity size={20} /></div><b>No movements yet</b><span>Validated receipts, deliveries, and transfers appear here.</span></div>}<button className="button button-secondary full-button" onClick={() => onNavigate('ledger')}>Open move history <ArrowRight size={14} /></button></section></div>
    <section className="panel quick-actions"><span className="eyebrow">QUICK ACTIONS</span><div className="quick-action-row"><QuickAction icon={Plus} title="Add a product" text="Register a new catalog item" action={() => onNavigate('products')} /><QuickAction icon={ArrowDownToLine} title="Receive stock" text="Create an incoming receipt" action={() => onNavigate('receipts')} /><QuickAction icon={ArrowLeftRight} title="Move inventory" text="Transfer between locations" action={() => onNavigate('transfers')} /><QuickAction icon={Truck} title="Create delivery" text="Prepare an outgoing order" action={() => onNavigate('deliveries')} /></div></section>
  </>;
}
function QuickAction({ icon: Icon, title, text, action }) { return <button className="quick-action" onClick={action}><span className="quick-icon"><Icon size={17} /></span><span><b>{title}</b><small>{text}</small></span><ArrowRight size={14} /></button>; }
function ActivityRow({ item }) {
  const operation = get(item, 'movementType', 'operation', 'operationType', 'type') || 'Stock move';
  return <div className="activity-row"><span className="activity-mark"><Activity size={14} /></span><span className="activity-copy"><b>{get(item, 'productName', 'product') || operation}</b><small>{operation} · {get(item, 'reference', 'referenceNumber') || 'Stock update'}</small></span><span className="activity-qty">{get(item, 'quantityChange', 'quantity', 'delta') ?? '—'}</span></div>;
}
function ProductTable({ rows, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState icon={Package} title="No products found" detail="Create a product to start tracking stock by location." />;
  return <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU / CODE</th><th>CATEGORY</th><th>ON HAND</th><th>REORDER AT</th><th>STOCK STATUS</th><th /></tr></thead><tbody>{rows.map((p) => {
    const quantity = Number(get(p, 'onHand', 'totalStock', 'quantity', 'currentStock', 'stock') || 0);
    const reorder = Number(get(p, 'reorderLevel', 'reorder_level') || 0);
    const status = quantity <= 0 ? 'Out of stock' : quantity <= reorder ? 'Low stock' : 'In stock';
    return <tr key={p.id}><td><div className="product-cell"><span className="product-glyph"><Package size={16} /></span><span><b>{p.name}</b><small>{get(p, 'unit', 'unitOfMeasure') || 'units'}</small></span></div></td><td className="code">{p.sku || p.code || '—'}</td><td>{get(p, 'categoryName', 'category_name', 'category') || 'Uncategorized'}</td><td className="number-cell">{quantity.toLocaleString()}</td><td>{reorder}</td><td><span className={`stock-pill ${status === 'In stock' ? 'pill-green' : status === 'Low stock' ? 'pill-amber' : 'pill-red'}`}><i />{status}</span></td><td><span className="row-actions"><button className="text-button" onClick={() => onEdit(p)}>Edit</button><button className="icon-button row-delete" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p)}><Trash2 size={14} /></button></span></td></tr>;
  })}</tbody></table></div>;
}
function CategoryTable({ rows, onEdit, onDelete, deletingCategoryId, busy }) {
  if (!rows.length) return <EmptyState icon={Boxes} title="No categories yet" detail="Create categories to organize the product catalog." />;
  return <div className="table-scroll"><table><thead><tr><th>CATEGORY</th><th>DESCRIPTION</th><th>PRODUCTS</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((c) => {
    const isDeleting = deletingCategoryId === c.id;
    return <tr key={c.id}><td><b>{c.name}</b></td><td>{c.description || '—'}</td><td>{c.productCount ?? c.product_count ?? c.products_count ?? '—'}</td><td><span className="row-actions"><button className="text-button" disabled={busy} onClick={() => onEdit(c)}>Edit</button><button className="text-button cancel-action" disabled={busy} onClick={() => onDelete(c)}>{isDeleting ? 'Deleting…' : <><Trash2 size={14} /> Delete</>}</button></span></td></tr>;
  })}</tbody></table></div>;
}
function LocationTable({ rows, warehouses, stock, onEdit, onDelete, deletingLocationId, busy }) {
  if (!rows.length) return <EmptyState icon={Warehouse} title="No locations yet" detail="Create a rack or storage location in a warehouse." />;
  return <div className="table-scroll"><table><thead><tr><th>LOCATION</th><th>WAREHOUSE</th><th>CODE</th><th>STOCK UNITS</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((l) => {
    const quantity = stock.filter((s) => String(get(s, 'locationId', 'location_id')) === String(l.id)).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    const isDeleting = deletingLocationId === l.id;
    return <tr key={l.id}><td><b>{l.name}</b></td><td>{get(l, 'warehouseName', 'warehouse_name') || warehouses.find((w) => String(w.id) === String(get(l, 'warehouseId', 'warehouse_id')))?.name || '—'}</td><td className="code">{l.code || '—'}</td><td>{quantity.toLocaleString()}</td><td><span className="row-actions"><button className="text-button" disabled={busy} onClick={() => onEdit(l)}>Edit</button><button className="text-button cancel-action" disabled={busy} onClick={() => onDelete(l)}>{isDeleting ? 'Deleting…' : <><Trash2 size={14} /> Delete</>}</button></span></td></tr>;
  })}</tbody></table></div>;
}
function OperationTable({ rows, type, onValidate, onStatus, onCancel }) {
  if (!rows.length) return <EmptyState icon={ClipboardList} title={`No ${type} found`} detail="Create a draft operation. Stock changes only after validation." />;
  return <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>ROUTE / LOCATION</th><th>PRODUCTS</th><th>QUANTITY</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map((r) => {
    const items = r.items || [];
    const names = items.map((item) => item.name).filter(Boolean).join(', ');
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const source = get(r, 'sourceLocation', 'source_location');
    const destination = get(r, 'destinationLocation', 'destination_location');
    const sourceName = typeof source === 'string' ? source : source?.name;
    const destinationName = typeof destination === 'string' ? destination : destination?.name;
    const route = type === 'receipts' ? `${r.partyName ? `${r.partyName} · ` : ''}To ${destinationName || '—'}` : type === 'deliveries' ? `${r.partyName ? `${r.partyName} · ` : ''}From ${sourceName || '—'}` : type === 'adjustments' ? destinationName || '—' : `${sourceName || '—'} → ${destinationName || '—'}`;
    const rawStatus = get(r, 'status', 'state');
    const normalizedStatus = String(rawStatus || 'draft').toLowerCase();
    const isOpen = ['draft', 'waiting', 'ready'].includes(normalizedStatus);
    const nextStatus = normalizedStatus === 'ready' ? 'waiting' : 'ready';
    return <tr key={r.id}><td className="code">{get(r, 'reference', 'referenceNumber', 'name') || `#${r.id}`}</td><td>{route}</td><td><b>{names || `${get(r, 'itemCount', 'item_count') || 0} items`}</b></td><td>{quantity.toLocaleString()}</td><td><span className={statusClass(rawStatus)}>{rawStatus || 'Draft'}</span></td><td>{isOpen && <span className="row-actions"><button className="button button-secondary small-button" onClick={() => onValidate(type, r.id)}><Check size={14} /> Validate</button><button className="text-button" onClick={() => onStatus(type, r.id, nextStatus)}>{normalizedStatus === 'ready' ? 'Wait' : 'Ready'}</button><button className="text-button cancel-action" onClick={() => onCancel(type, r.id)}>Cancel</button></span>}</td></tr>;
  })}</tbody></table></div>;
}
function LedgerTable({ rows }) {
  if (!rows.length) return <EmptyState icon={Activity} title="Ledger is ready" detail="Validated inventory operations will be recorded here with before-and-after quantities." />;
  return <div className="table-scroll"><table><thead><tr><th>TIME</th><th>OPERATION</th><th>PRODUCT</th><th>CHANGE</th><th>SOURCE</th><th>DESTINATION</th><th>PREVIOUS → RESULT</th><th>USER</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td className="time-cell">{new Date(get(r, 'createdAt', 'created_at', 'timestamp')).toLocaleString()}</td><td><span className={statusClass('done')}>{get(r, 'movementType', 'operation', 'operationType', 'type') || 'Move'}</span></td><td><b>{get(r, 'productName', 'product_name', 'product') || '—'}</b></td><td>{get(r, 'quantityChange', 'quantity', 'delta') ?? '—'}</td><td>{get(r, 'sourceLocation', 'source_location') || '—'}</td><td>{get(r, 'destinationLocation', 'destination_location') || '—'}</td><td>{get(r, 'quantityBefore', 'previous_stock', 'previous_quantity') ?? '—'} <ArrowRight size={12} /> {get(r, 'quantityAfter', 'resulting_stock', 'resulting_quantity') ?? '—'}</td><td>{get(r, 'userName', 'user_name', 'user_email') || '—'}</td></tr>)}</tbody></table></div>;
}
function EmptyState({ icon: Icon, title, detail }) { return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><b>{title}</b><span>{detail}</span></div>; }

function EntityDialog({ type, item, data, busy, error, onDismissError, onClose, onSave }) {
  const kind = type === 'receipt' ? 'Receipt' : type === 'delivery' ? 'Delivery order' : type === 'transfer' ? 'Internal transfer' : type === 'adjustment' ? 'Inventory adjustment' : type === 'product' ? (item ? 'Edit product' : 'New product') : type === 'category' ? (item ? 'Edit category' : 'New category') : type === 'warehouse' ? 'New warehouse' : item ? 'Edit location' : 'New location';
  const [values, setValues] = useState(type === 'product' && item ? { name: item.name, sku: item.sku || '', categoryId: item.categoryId || '', unit: item.unit || 'units', reorderLevel: item.reorderLevel ?? 0 } : type === 'category' && item ? { name: item.name, description: item.description || '' } : type === 'location' && item ? { name: item.name, code: item.code || '', warehouseId: get(item, 'warehouseId', 'warehouse_id') || '' } : {});
  const [lines, setLines] = useState([{ productId: '', quantity: '' }]);
  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value });
  const select = (label, key, options, required = true) => <label className="field"><span>{label}</span><select value={values[key] || ''} onChange={set(key)} required={required}><option value="">Select {label.toLowerCase()}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
  const field = (label, key, opts = {}) => <Field label={label} value={values[key] ?? ''} onChange={set(key)} required={opts.required !== false} type={opts.type || 'text'} min={opts.min} step={opts.step} />;
  const operationLines = (label) => <div className="line-editor"><span className="field-label">{label}</span>{lines.map((line, index) => <div className="operation-line" key={index}><label className="field"><span className="visually-hidden">{`${label} ${index + 1}`}</span><select value={line.productId} required onChange={(e) => setLines(lines.map((current, lineIndex) => lineIndex === index ? { ...current, productId: e.target.value } : current))}><option value="">Select product</option>{data.products.filter((p) => p.id === line.productId || !lines.some((other, lineIndex) => lineIndex !== index && other.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="field"><span className="visually-hidden">{`${label} quantity ${index + 1}`}</span><input aria-label={`${label} ${index + 1} quantity`} type="number" min={type === 'adjustment' ? 0 : 0.000001} step="any" required value={line.quantity} placeholder={type === 'adjustment' ? 'Physical count' : 'Quantity'} onChange={(e) => setLines(lines.map((current, lineIndex) => lineIndex === index ? { ...current, quantity: e.target.value } : current))} /></label><button type="button" className="icon-button line-remove" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove ${label.toLowerCase()} line ${index + 1}`}><X size={14} /></button></div>)}<button type="button" className="text-button add-line" onClick={() => setLines([...lines, { productId: '', quantity: '' }])}><Plus size={14} /> Add another product</button></div>;
  const submit = (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
    if (type === 'product') onSave(item ? `/products/${item.id}` : '/products', item ? 'PUT' : 'POST', payload);
    if (type === 'category') onSave(item ? `/categories/${item.id}` : '/categories', item ? 'PATCH' : 'POST', payload);
    if (type === 'location') onSave(item ? `/locations/${item.id}` : '/locations', item ? 'PATCH' : 'POST', payload);
    if (type === 'warehouse') onSave('/warehouses', 'POST', payload);
    if (type === 'receipt' || type === 'delivery' || type === 'transfer' || type === 'adjustment') {
      const operation = {
        items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
        reference: payload.reference,
        partyName: payload.partyName,
      };
      if (type === 'receipt' || type === 'adjustment') operation.destinationLocationId = payload.destinationLocationId;
      if (type === 'delivery' || type === 'transfer') operation.sourceLocationId = payload.sourceLocationId;
      if (type === 'transfer') operation.destinationLocationId = payload.destinationLocationId;
      onSave(`/operations/${({ receipt: 'receipts', delivery: 'deliveries', transfer: 'transfers', adjustment: 'adjustments' })[type]}`, 'POST', operation);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form className="modal panel" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">INVENTORY CONTROL</span><h2>{kind}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>{error && <div className="alert alert-error" role="alert"><CircleAlert size={17} /><span>{error}</span><button type="button" onClick={onDismissError} aria-label="Dismiss error"><X size={16} /></button></div>}<div className="modal-fields">
    {type === 'product' && <>{field('Product name', 'name')}{field('SKU / product code', 'sku')}{select('Category', 'categoryId', data.categories, false)}{field('Unit of measure', 'unit')}{field('Reorder level', 'reorderLevel', { type: 'number', min: 0, step: 'any' })}</>}
    {type === 'category' && <>{field('Category name', 'name')}{field('Description', 'description', { required: false })}</>}
    {type === 'warehouse' && <>{field('Warehouse name', 'name')}{field('Warehouse code', 'code')}{field('Address', 'address', { required: false })}</>}
    {type === 'location' && <>{field('Location name', 'name')}{field('Location code', 'code')}{select('Warehouse', 'warehouseId', data.warehouses)}</>}
    {type === 'receipt' && <>{field('Supplier', 'partyName')}{field('Reference', 'reference', { required: false })}{operationLines('Receipt lines')}{select('Destination location', 'destinationLocationId', data.locations)}</>}
    {type === 'delivery' && <>{field('Customer', 'partyName', { required: false })}{field('Reference', 'reference', { required: false })}{operationLines('Delivery lines')}{select('Source location', 'sourceLocationId', data.locations)}</>}
    {type === 'transfer' && <>{field('Reference', 'reference', { required: false })}{operationLines('Transfer lines')}{select('Source location', 'sourceLocationId', data.locations)}{select('Destination location', 'destinationLocationId', data.locations)}</>}
    {type === 'adjustment' && <>{field('Reference', 'reference', { required: false })}{operationLines('Counted product lines')}{select('Location', 'destinationLocationId', data.locations)}</>}
  </div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}><Check size={15} />{busy ? 'Saving…' : type === 'category' || type === 'product' || type === 'location' ? (item ? 'Save changes' : `Save ${type}`) : 'Save draft'}</button></div></form></div>;
}

export default App;
