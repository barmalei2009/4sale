/**
 * shop.js — Iris Shop Catalog Engine + PayPal Smart Buttons
 * GitHub Pages compatible · Pure vanilla JS · No dependencies
 *
 * Architecture:
 *  - State object drives all UI rendering (single source of truth)
 *  - Products loaded from products.json via fetch()
 *  - Cart persisted to localStorage
 *  - All filters/sort/view are reactive via render()
 *  - PayPal SDK loaded via shop.html script tag (client-id in that tag)
 */

'use strict';

/* ─────────────────────────────────────────────
   CONFIG  (edit these to customise your shop)
───────────────────────────────────────────── */
const CONFIG = {
  shopName:      'Melnikov Iris Garden',
  dataUrl:       'products.json',       // path to your JSON file
  currency:      'USD',
  currencySymbol:'$',
  contactEmail:  'sergey@example.com',  // shown in order confirmation
  cartKey:       'iris_shop_cart',      // localStorage key
  perPage:       0,                     // 0 = show all; set e.g. 12 for pagination

  // ─── PayPal ───────────────────────────────────────────────────────────
  // ⚠ Replace with your real Client ID from https://developer.paypal.com
  // Use your SANDBOX ID for testing, LIVE ID for real transactions.
  // Also update the client-id= parameter in the <script id="paypal-sdk"> tag
  // inside shop.html — both must match.
  paypalClientId: 'YOUR_CLIENT_ID',
};

/* ─────────────────────────────────────────────
   COLOR MAP — swatch dot colours for cards
───────────────────────────────────────────── */
const COLOR_MAP = {
  purple:  '#7b1fa2',
  blue:    '#1565c0',
  white:   '#e8e8e8',
  pink:    '#e91e8c',
  yellow:  '#f9a825',
  bicolor: 'linear-gradient(135deg,#fdd835 50%,#7b1fa2 50%)',
};

/* ─────────────────────────────────────────────
   APPLICATION STATE
───────────────────────────────────────────── */
let state = {
  products:   [],      // raw data from JSON
  filtered:   [],      // currently displayed products
  cart:       [],      // [{product, qty}]
  wishlist:   new Set(),
  view:       'grid',  // 'grid' | 'list'
  sort:       'name-asc',
  filters: {
    query:     '',
    color:     'all',
    type:      'All',
    bloom:     'All',
    maxPrice:  100,
    featured:  false,
    fragrant:  false,
    inStock:   false,
    awardOnly: false,
  },
};

/* ─────────────────────────────────────────────
   DOM REFERENCES  (populated after DOMContentLoaded)
───────────────────────────────────────────── */
let dom = {};

/** Holds the currently rendered paypal.Buttons() instance so we can close it cleanly. */
let paypalButtonsInstance = null;

/* ─────────────────────────────────────────────
   BOOTSTRAP
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  cacheDOM();
  loadCart();
  loadData();
  bindEvents();
});

function cacheDOM() {
  dom = {
    grid:          document.getElementById('product-grid'),
    resultCount:   document.getElementById('result-count'),
    activePills:   document.getElementById('active-filters'),
    featuredStrip: document.getElementById('featured-strip'),
    featuredChips: document.getElementById('featured-chips'),

    // filters
    searchInput:   document.getElementById('filter-search'),
    priceRange:    document.getElementById('price-range'),
    priceVal:      document.getElementById('price-val'),
    swatches:      document.querySelectorAll('.swatch-btn'),
    typeChips:     document.querySelectorAll('.type-chip'),
    bloomChips:    document.querySelectorAll('.bloom-chip'),
    chkFeatured:   document.getElementById('chk-featured'),
    chkFragrant:   document.getElementById('chk-fragrant'),
    chkInStock:    document.getElementById('chk-instock'),
    chkAward:      document.getElementById('chk-award'),
    btnReset:      document.getElementById('btn-reset'),

    // toolbar
    sortSelect:    document.getElementById('sort-select'),
    viewGrid:      document.getElementById('view-grid'),
    viewList:      document.getElementById('view-list'),

    // cart
    cartCount:        document.getElementById('cart-count'),
    cartBtn:          document.getElementById('cart-btn'),
    cartDrawer:       document.getElementById('cart-drawer'),
    cartOverlay:      document.getElementById('cart-overlay'),
    cartClose:        document.getElementById('cart-close'),
    cartItems:        document.getElementById('cart-items'),
    cartSubtotal:     document.getElementById('cart-subtotal'),
    cartTotal:        document.getElementById('cart-total'),
    cartItemCount:    document.getElementById('cart-item-count'),
    // PayPal-specific cart elements
    paypalContainer:  document.getElementById('paypal-button-container'),
    paypalEmptyMsg:   document.getElementById('paypal-empty-msg'),
    cartSuccess:      document.getElementById('cart-success'),
    cartShippingNote: document.getElementById('cart-shipping-note'),

    // modal
    modalOverlay:  document.getElementById('modal-overlay'),
    modalClose:    document.getElementById('modal-close'),
    modalContent:  document.getElementById('modal-content'),

    // toast
    toastContainer: document.getElementById('toast-container'),
  };
}

/* ─────────────────────────────────────────────
   DATA LOADING
───────────────────────────────────────────── */
async function loadData() {
  showSkeletons(8);
  try {
    const res  = await fetch(CONFIG.dataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.products = data;

    // derive max price for slider
    const maxP = Math.ceil(Math.max(...data.map(p => p.price)));
    state.filters.maxPrice = maxP;
    dom.priceRange.max     = maxP;
    dom.priceRange.value   = maxP;
    dom.priceVal.textContent = fmtPrice(maxP);

    buildFeaturedStrip();
    applyFilters();
  } catch (err) {
    dom.grid.innerHTML = `
      <div class="state-msg">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3>Could not load products</h3>
        <p>Make sure <code>products.json</code> is in the same folder as <code>shop.html</code>.<br>
           Error: ${err.message}</p>
      </div>`;
    console.error('Shop: failed to load products.json', err);
  }
}

/* ─────────────────────────────────────────────
   FILTERING & SORTING
───────────────────────────────────────────── */
function applyFilters() {
  const f = state.filters;

  let result = state.products.filter(p => {
    if (f.query && !p.name.toLowerCase().includes(f.query.toLowerCase()) &&
        !p.description.toLowerCase().includes(f.query.toLowerCase()) &&
        !p.color.toLowerCase().includes(f.query.toLowerCase())) return false;
    if (f.color !== 'all' && p.colorFamily !== f.color)    return false;
    if (f.type  !== 'All' && p.type !== f.type)            return false;
    if (f.bloom !== 'All' && p.bloomTime !== f.bloom)      return false;
    if (p.price > f.maxPrice)                              return false;
    if (f.featured  && !p.featured)                        return false;
    if (f.fragrant  && (!p.fragrance || p.fragrance === 'None')) return false;
    if (f.inStock   && p.stock < 1)                        return false;
    if (f.awardOnly && (!p.awards || p.awards.length === 0)) return false;
    return true;
  });

  result = sortProducts(result, state.sort);
  state.filtered = result;
  render();
  renderActivePills();
}

function sortProducts(list, sort) {
  const [key, dir] = sort.split('-');
  return [...list].sort((a, b) => {
    let va, vb;
    switch (key) {
      case 'name':  va = a.name;  vb = b.name;  break;
      case 'price': va = a.price; vb = b.price; break;
      case 'year':  va = a.year;  vb = b.year;  break;
      default:      va = a.name;  vb = b.name;
    }
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

/* ─────────────────────────────────────────────
   RENDERING
───────────────────────────────────────────── */
function render() {
  const products = state.filtered;

  // Update count
  const total = state.products.length;
  dom.resultCount.innerHTML =
    `Showing <strong>${products.length}</strong> of <strong>${total}</strong> varieties`;

  // Toggle grid/list class
  dom.grid.className = `product-grid${state.view === 'list' ? ' view-list' : ''}`;

  if (products.length === 0) {
    dom.grid.innerHTML = `
      <div class="state-msg">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h3>No varieties match your filters</h3>
        <p>Try adjusting the color, type, or price range — or <button onclick="resetFilters()" style="background:none;border:none;cursor:pointer;text-decoration:underline;font-size:inherit;padding:0;color:var(--clr-accent)">clear all filters</button>.</p>
      </div>`;
    return;
  }

  dom.grid.innerHTML = products.map(p => cardHTML(p)).join('');

  // Attach card-level events
  dom.grid.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.add));
    });
  });

  dom.grid.querySelectorAll('[data-wish]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleWishlist(parseInt(btn.dataset.wish), btn);
    });
  });

  dom.grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      openModal(id);
    });
  });

  // Lazy-load images: replace broken images with placeholder
  dom.grid.querySelectorAll('img[data-src]').forEach(img => {
    const src = img.dataset.src;
    const tmp = new Image();
    tmp.onload  = () => { img.src = src; img.removeAttribute('data-src'); };
    tmp.onerror = () => {
      // Show SVG placeholder instead
      const wrap = img.closest('.card-img-wrap') || img.closest('.modal-img');
      if (wrap) {
        img.remove();
        wrap.innerHTML += placeholderSVG(wrap.dataset.name || '');
      }
    };
    tmp.src = src;
  });
}

function cardHTML(p) {
  const inStock   = p.stock > 0;
  const lowStock  = inStock && p.stock <= 5;
  const hasDykes  = p.awards && p.awards.includes('Dykes Medal');
  const dotStyle  = COLOR_MAP[p.colorFamily]
    ? (COLOR_MAP[p.colorFamily].startsWith('linear')
        ? `style="background:${COLOR_MAP[p.colorFamily]};border:1px solid rgba(0,0,0,0.1)"`
        : `style="background:${COLOR_MAP[p.colorFamily]}"`)
    : '';
  const isWished  = state.wishlist.has(p.id);

  return `
  <article class="card" data-id="${p.id}" tabindex="0" aria-label="${p.name}">
    <div class="card-img-wrap" data-name="${p.name}">
      <img data-src="${p.image}" alt="${p.name}" src="" loading="lazy">
      <div class="card-img-placeholder">
        ${placeholderSVG(p.name)}
      </div>
      <div class="card-badges">
        ${p.featured  ? `<span class="badge badge-featured">⭐ Featured</span>` : ''}
        ${hasDykes    ? `<span class="badge badge-dykes">🏅 Dykes Medal</span>` : ''}
        ${lowStock    ? `<span class="badge badge-low">Only ${p.stock} left</span>` : ''}
        ${!inStock    ? `<span class="badge badge-sold">Sold Out</span>` : ''}
      </div>
      <button class="wishlist-btn ${isWished ? 'active' : ''}" data-wish="${p.id}"
              aria-label="${isWished ? 'Remove from wishlist' : 'Add to wishlist'}"
              title="Wishlist">
        ${isWished ? '♥' : '♡'}
      </button>
    </div>
    <div class="card-body">
      <div class="card-type">${p.type}</div>
      <div class="card-name">${p.name}</div>
      <div class="card-meta">
        <span class="card-color-dot" ${dotStyle}></span>${p.color}
        &nbsp;·&nbsp;${p.height}
        ${p.fragrance && p.fragrance !== 'None'
          ? `&nbsp;·&nbsp;<span title="Fragrance: ${p.fragrance}">🌸 ${p.fragrance}</span>` : ''}
      </div>
      <p class="card-desc">${p.description}</p>
      <div class="card-tags">
        <span class="tag">${p.bloomTime} Season</span>
        ${p.year ? `<span class="tag">'${String(p.year).slice(-2)}</span>` : ''}
        ${hasDykes ? `<span class="tag">Award Winner</span>` : ''}
      </div>
      <div class="card-footer">
        <div>
          <span class="card-price">${CONFIG.currencySymbol}${p.price.toFixed(2)}</span>
          <span class="card-price-each">/ rhizome</span>
        </div>
        <button class="btn-add"
                data-add="${p.id}"
                ${!inStock ? 'disabled' : ''}
                aria-label="Add ${p.name} to cart">
          ${inStock
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add`
            : 'Sold Out'}
        </button>
      </div>
    </div>
  </article>`;
}

function placeholderSVG(name) {
  return `<svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 8 C32 8 22 18 22 28 C22 34 26 38 32 40 C38 38 42 34 42 28 C42 18 32 8 32 8Z" fill="currentColor" opacity="0.35"/>
    <path d="M32 40 C32 40 18 34 14 24 C12 18 16 12 22 14 C26 15 30 20 32 28" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.35"/>
    <path d="M32 40 C32 40 46 34 50 24 C52 18 48 12 42 14 C38 15 34 20 32 28" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.35"/>
    <line x1="32" y1="40" x2="32" y2="58" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  </svg>
  <span>${name || 'Image coming soon'}</span>`;
}

function showSkeletons(n) {
  dom.grid.innerHTML = Array(n).fill('').map(() => `
    <div class="skeleton-card">
      <div class="skeleton" style="height:170px;border-radius:0"></div>
      <div style="padding:1rem;display:flex;flex-direction:column;gap:0.5rem">
        <div class="skeleton" style="height:12px;width:50%"></div>
        <div class="skeleton" style="height:18px;width:80%"></div>
        <div class="skeleton" style="height:12px;width:65%"></div>
        <div class="skeleton" style="height:36px;margin-top:0.5rem"></div>
      </div>
    </div>`).join('');
}

/* ─────────────────────────────────────────────
   FEATURED STRIP
───────────────────────────────────────────── */
function buildFeaturedStrip() {
  const featured = state.products.filter(p => p.featured);
  if (featured.length === 0) {
    dom.featuredStrip.style.display = 'none';
    return;
  }
  dom.featuredChips.innerHTML = featured.map(p => `
    <button class="featured-chip" data-feat="${p.id}">${p.name}</button>
  `).join('');

  dom.featuredChips.querySelectorAll('[data-feat]').forEach(btn => {
    btn.addEventListener('click', () => openModal(parseInt(btn.dataset.feat)));
  });
}

/* ─────────────────────────────────────────────
   ACTIVE FILTER PILLS
───────────────────────────────────────────── */
function renderActivePills() {
  const f   = state.filters;
  const pills = [];

  if (f.query)    pills.push({ label: `"${f.query}"`,   key: 'query' });
  if (f.color !== 'all')   pills.push({ label: capitalise(f.color), key: 'color' });
  if (f.type  !== 'All')   pills.push({ label: f.type,  key: 'type' });
  if (f.bloom !== 'All')   pills.push({ label: f.bloom + ' Bloom', key: 'bloom' });
  if (f.maxPrice < parseInt(dom.priceRange.max))
                            pills.push({ label: `≤ ${fmtPrice(f.maxPrice)}`, key: 'maxPrice' });
  if (f.featured)  pills.push({ label: 'Featured',      key: 'featured' });
  if (f.fragrant)  pills.push({ label: 'Fragrant',      key: 'fragrant' });
  if (f.inStock)   pills.push({ label: 'In Stock',      key: 'inStock' });
  if (f.awardOnly) pills.push({ label: 'Award Winners', key: 'awardOnly' });

  dom.activePills.innerHTML = pills.map(p => `
    <span class="active-filter-pill">
      ${p.label}
      <button onclick="clearFilter('${p.key}')" aria-label="Remove filter: ${p.label}">✕</button>
    </span>`).join('');
}

window.clearFilter = function(key) {
  const defaults = { query:'', color:'all', type:'All', bloom:'All',
                     featured:false, fragrant:false, inStock:false, awardOnly:false };
  if (key === 'maxPrice') {
    state.filters.maxPrice = parseInt(dom.priceRange.max);
    dom.priceRange.value   = dom.priceRange.max;
    dom.priceVal.textContent = fmtPrice(state.filters.maxPrice);
  } else {
    state.filters[key] = defaults[key];
    syncFilterUI(key);
  }
  applyFilters();
};

function syncFilterUI(key) {
  switch (key) {
    case 'query':
      dom.searchInput.value = '';
      break;
    case 'color':
      dom.swatches.forEach(s => s.classList.toggle('active', s.dataset.color === 'all'));
      break;
    case 'type':
      dom.typeChips.forEach(c => c.classList.toggle('active', c.dataset.type === 'All'));
      break;
    case 'bloom':
      dom.bloomChips.forEach(c => c.classList.toggle('active', c.dataset.bloom === 'All'));
      break;
    case 'featured':  dom.chkFeatured.checked  = false; break;
    case 'fragrant':  dom.chkFragrant.checked   = false; break;
    case 'inStock':   dom.chkInStock.checked    = false; break;
    case 'awardOnly': dom.chkAward.checked      = false; break;
  }
}

window.resetFilters = function() {
  state.filters = {
    query: '', color: 'all', type: 'All', bloom: 'All',
    maxPrice: parseInt(dom.priceRange.max),
    featured: false, fragrant: false, inStock: false, awardOnly: false,
  };
  dom.searchInput.value            = '';
  dom.priceRange.value             = dom.priceRange.max;
  dom.priceVal.textContent         = fmtPrice(state.filters.maxPrice);
  dom.swatches.forEach(s => s.classList.toggle('active', s.dataset.color === 'all'));
  dom.typeChips.forEach(c => c.classList.toggle('active', c.dataset.type  === 'All'));
  dom.bloomChips.forEach(c=> c.classList.toggle('active', c.dataset.bloom === 'All'));
  [dom.chkFeatured, dom.chkFragrant, dom.chkInStock, dom.chkAward]
    .forEach(c => { if (c) c.checked = false; });
  applyFilters();
};

/* ─────────────────────────────────────────────
   WISHLIST
───────────────────────────────────────────── */
function toggleWishlist(id, btn) {
  if (state.wishlist.has(id)) {
    state.wishlist.delete(id);
    btn.classList.remove('active');
    btn.textContent = '♡';
    showToast('Removed from wishlist');
  } else {
    state.wishlist.add(id);
    btn.classList.add('active');
    btn.textContent = '♥';
    const p = state.products.find(x => x.id === id);
    showToast(`♥ ${p?.name} added to wishlist`);
  }
}

/* ─────────────────────────────────────────────
   CART
───────────────────────────────────────────── */
function loadCart() {
  try {
    const saved = localStorage.getItem(CONFIG.cartKey);
    if (saved) state.cart = JSON.parse(saved);
  } catch { state.cart = []; }
  updateCartUI();
}

function saveCart() {
  localStorage.setItem(CONFIG.cartKey, JSON.stringify(state.cart));
}

function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;

  const existing = state.cart.find(i => i.id === id);
  const maxQty   = product.stock;

  if (existing) {
    if (existing.qty >= maxQty) {
      showToast(`⚠ Only ${maxQty} available`);
      return;
    }
    existing.qty++;
  } else {
    state.cart.push({ id, qty: 1 });
  }

  saveCart();
  updateCartUI();
  showToast(`🌸 ${product.name} added to cart`);

  // Bounce the count badge
  dom.cartCount.classList.remove('bump');
  void dom.cartCount.offsetWidth;
  dom.cartCount.classList.add('bump');
  setTimeout(() => dom.cartCount.classList.remove('bump'), 300);
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i.id !== id);
  saveCart();
  updateCartUI();
  renderCartDrawer();
  refreshPayPalIfOpen(); // keep PayPal order in sync with cart
}

function changeQty(id, delta) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) { removeFromCart(id); return; }

  // enforce stock limit
  const product = state.products.find(p => p.id === id);
  if (product && item.qty > product.stock) {
    item.qty = product.stock;
    showToast(`⚠ Only ${product.stock} available`);
  }

  saveCart();
  updateCartUI();
  renderCartDrawer();
  refreshPayPalIfOpen(); // keep PayPal order in sync with cart
}

function updateCartUI() {
  const totalQty = state.cart.reduce((s, i) => s + i.qty, 0);
  dom.cartCount.textContent = totalQty;
  dom.cartCount.style.display = totalQty > 0 ? 'flex' : 'none';
}

function openCartDrawer() {
  // Reset any previous success screen before showing the drawer
  resetCartSuccessState();
  renderCartDrawer();
  initPayPalButtons();
  dom.cartDrawer.classList.add('open');
  dom.cartOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  dom.cartDrawer.classList.remove('open');
  dom.cartOverlay.classList.remove('open');
  document.body.style.overflow = '';
  // Tear down PayPal buttons cleanly to avoid duplicate renders
  destroyPayPalButtons();
}

function resetCartSuccessState() {
  if (!dom.cartItems || !dom.cartSuccess) return;
  dom.cartItems.style.display        = '';
  dom.cartSuccess.style.display      = 'none';
  dom.cartSuccess.innerHTML          = '';
  if (dom.cartShippingNote) dom.cartShippingNote.style.display = '';
}

function renderCartDrawer() {
  if (state.cart.length === 0) {
    dom.cartItems.innerHTML = `
      <div class="cart-empty-msg">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <p>Your cart is empty.<br>Add some beautiful irises!</p>
      </div>`;
    dom.cartSubtotal.textContent = fmtPrice(0);
    dom.cartTotal.textContent    = fmtPrice(0);
    dom.cartItemCount.textContent = '0 items';
    return;
  }

  let subtotal = 0;
  dom.cartItems.innerHTML = state.cart.map(item => {
    const p   = state.products.find(x => x.id === item.id);
    if (!p) return '';
    const lineTotal = p.price * item.qty;
    subtotal += lineTotal;
    return `
    <div class="cart-item" data-cart-id="${item.id}">
      <div class="cart-item-thumb">
        <img src="${p.image}" alt="${p.name}"
             onerror="this.parentElement.innerHTML='<svg width=\\'28\\' height=\\'28\\' viewBox=\\'0 0 64 64\\' fill=\\'none\\'><path d=\\'M32 8 C32 8 22 18 22 28 C22 34 26 38 32 40 C38 38 42 34 42 28 C42 18 32 8 32 8Z\\' fill=\\'%237c4dff\\' opacity=\\'0.4\\'/></svg>'">
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-type">${p.type}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${item.id},-1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">
        <span class="cart-item-price">${fmtPrice(lineTotal)}</span>
        <button class="cart-remove" onclick="removeFromCart(${item.id})" aria-label="Remove ${p.name}">✕</button>
      </div>
    </div>`;
  }).join('');

  dom.cartSubtotal.textContent  = fmtPrice(subtotal);
  dom.cartTotal.textContent     = fmtPrice(subtotal);
  dom.cartItemCount.textContent = `${state.cart.reduce((s,i)=>s+i.qty,0)} item(s)`;
}

// Expose cart functions globally so onclick attributes work
window.changeQty       = changeQty;
window.removeFromCart  = removeFromCart;
window.closeCartDrawer = closeCartDrawer;

/* ─────────────────────────────────────────────
   PAYPAL SMART BUTTONS
───────────────────────────────────────────── */

/**
 * Destroy the current PayPal Buttons instance if one exists.
 * Must be called before re-rendering to avoid duplicate button sets.
 */
function destroyPayPalButtons() {
  if (paypalButtonsInstance) {
    try { paypalButtonsInstance.close(); } catch (e) { /* ignore */ }
    paypalButtonsInstance = null;
  }
  if (dom.paypalContainer) dom.paypalContainer.innerHTML = '';
}

/**
 * Build a PayPal Orders API v2 order object from the current cart.
 * Maps each cart item to a PayPal line item and computes the exact total.
 */
function buildPayPalOrder() {
  const items = state.cart.map(item => {
    const p = state.products.find(x => x.id === item.id);
    return {
      name:        p.name.substring(0, 127),
      description: `${p.type} · ${p.color} · ${p.height}`.substring(0, 127),
      sku:         String(p.id),
      category:    'PHYSICAL_GOODS',
      quantity:    String(item.qty),
      unit_amount: {
        currency_code: CONFIG.currency,
        value:         p.price.toFixed(2),
      },
    };
  });

  // Compute total in integer cents to avoid floating-point drift
  const itemTotalCents = state.cart.reduce((sum, item) => {
    const p = state.products.find(x => x.id === item.id);
    return sum + Math.round(p.price * item.qty * 100);
  }, 0);
  const itemTotalStr = (itemTotalCents / 100).toFixed(2);

  return {
    intent: 'CAPTURE',
    purchase_units: [{
      description:     `${CONFIG.shopName} — Iris Rhizome Order`,
      soft_descriptor: 'IRIS GARDEN',   // appears on buyer's card statement
      items,
      amount: {
        currency_code: CONFIG.currency,
        value:         itemTotalStr,
        breakdown: {
          item_total: { currency_code: CONFIG.currency, value: itemTotalStr },
          // Uncomment and set values to add shipping/tax:
          // shipping: { currency_code: 'USD', value: '0.00' },
          // tax_total: { currency_code: 'USD', value: '0.00' },
        },
      },
    }],
    application_context: {
      brand_name:          CONFIG.shopName,
      shipping_preference: 'GET_FROM_FILE', // buyer enters shipping address in PayPal popup
      user_action:         'PAY_NOW',
    },
  };
}

/**
 * Show a thank-you screen inside the cart drawer after a successful capture.
 * Replaces the items list and PayPal buttons with order confirmation details.
 */
function showCartSuccess(details) {
  const name    = details.payer?.name?.given_name || 'there';
  const email   = details.payer?.email_address    || CONFIG.contactEmail;
  const orderId = details.id;
  const captured = details.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value
                || details.purchase_units?.[0]?.amount?.value
                || '0.00';

  // Hide items list, PayPal buttons, and shipping note
  dom.cartItems.style.display        = 'none';
  dom.paypalContainer.style.display  = 'none';
  dom.paypalEmptyMsg.style.display   = 'none';
  if (dom.cartShippingNote) dom.cartShippingNote.style.display = 'none';

  // Update summary row to show captured amount
  dom.cartItemCount.textContent = 'Order placed ✓';
  dom.cartTotal.textContent     = fmtPrice(parseFloat(captured));

  dom.cartSuccess.style.display = 'block';
  dom.cartSuccess.innerHTML = `
    <div style="text-align:center;padding:0.75rem 0.25rem">
      <div style="font-size:3rem;margin-bottom:0.6rem">🌸</div>
      <h3 style="font-family:var(--font-display);font-size:1.25rem;
                 margin-bottom:0.5rem;color:var(--clr-text)">
        Thank you, ${name}!
      </h3>
      <p style="font-size:0.85rem;color:var(--clr-text-muted);
                line-height:1.65;margin-bottom:1rem">
        Your order
        <strong style="color:var(--clr-text);font-family:monospace;font-size:0.8rem">
          ${orderId}
        </strong>
        has been confirmed.<br>
        A receipt will be sent to
        <strong style="color:var(--clr-text)">${email}</strong>.
      </p>
      <div style="font-size:0.8rem;color:var(--clr-text-muted);
                  background:var(--clr-bg);border-radius:10px;
                  padding:0.85rem 1rem;text-align:left;margin-bottom:1.25rem;line-height:1.6">
        <p>🚚 <strong>Shipping:</strong> Rhizomes ship bare-root, July – September.</p>
        <p>📧 Tracking information will be emailed when your order ships.</p>
        <p>❓ Questions? Contact us at
           <a href="mailto:${CONFIG.contactEmail}"
              style="color:var(--clr-accent)">${CONFIG.contactEmail}</a>.
        </p>
      </div>
      <button onclick="closeCartDrawer()"
        style="display:block;width:100%;background:var(--clr-accent);color:#fff;
               border:none;border-radius:var(--radius-md);padding:0.7rem 1.5rem;
               font-size:0.9rem;font-weight:700;cursor:pointer">
        Continue Shopping
      </button>
    </div>`;
}

/**
 * Initialise (or re-initialise) the PayPal Smart Buttons.
 * Safe to call multiple times — destroys any previous instance first.
 * Shows an empty-cart message if there is nothing to pay for.
 */
function initPayPalButtons() {
  destroyPayPalButtons();

  const container = dom.paypalContainer;
  const emptyMsg  = dom.paypalEmptyMsg;
  if (!container || !emptyMsg) return;

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (state.cart.length === 0) {
    container.style.display = 'none';
    emptyMsg.style.display  = 'block';
    return;
  }
  emptyMsg.style.display  = 'none';
  container.style.display = 'block';

  // ── SDK not loaded (client ID is still the placeholder) ───────────────────
  if (!window.paypal) {
    container.innerHTML = `
      <div style="text-align:center;padding:0.85rem;
                  background:#fff3cd;border:1px solid #ffe69c;
                  border-radius:8px;font-size:0.8rem;color:#856404">
        ⚠️ <strong>PayPal not configured.</strong><br>
        Replace <code>YOUR_CLIENT_ID</code> in <code>shop.html</code>
        with your Client ID from
        <a href="https://developer.paypal.com/dashboard/" target="_blank"
           rel="noopener" style="color:#856404">developer.paypal.com</a>.
      </div>`;
    return;
  }

  // ── Render Smart Buttons ──────────────────────────────────────────────────
  paypalButtonsInstance = window.paypal.Buttons({

    style: {
      layout: 'vertical',  // PayPal button stacked above card fields
      color:  'gold',       // signature PayPal yellow
      shape:  'rect',
      label:  'pay',        // "Pay with PayPal"
      height: 44,
    },

    // Called when buyer clicks — build and send order to PayPal
    createOrder: (_data, actions) => {
      return actions.order.create(buildPayPalOrder());
    },

    // Called after buyer approves in the PayPal popup
    onApprove: async (_data, actions) => {
      showToast('⏳ Capturing payment…');
      try {
        const details = await actions.order.capture();
        // Clear the cart
        state.cart = [];
        saveCart();
        updateCartUI();
        // Show confirmation screen
        showCartSuccess(details);
        showToast('🌸 Order confirmed! Check your email.');
      } catch (err) {
        console.error('PayPal capture error:', err);
        showToast('❌ Payment capture failed — please try again.');
        initPayPalButtons(); // re-render so buyer can retry
      }
    },

    // Buyer closed the PayPal popup without completing payment
    onCancel: () => {
      showToast('Payment cancelled — your cart is saved.');
    },

    // SDK-level error (network issue, bad client ID, etc.)
    onError: (err) => {
      console.error('PayPal SDK error:', err);
      showToast('❌ PayPal encountered an error — please refresh.');
      container.innerHTML = `
        <div style="text-align:center;padding:0.85rem;
                    background:#fce4ec;border:1px solid #ef9a9a;
                    border-radius:8px;font-size:0.8rem;color:#c62828">
          PayPal failed to load. Please refresh the page and try again.
        </div>`;
    },

  });

  // isEligible() is false for unsupported browsers / restricted regions
  if (paypalButtonsInstance.isEligible()) {
    paypalButtonsInstance.render('#paypal-button-container').catch(err => {
      // Suppress "Window closed" errors that fire when the drawer is closed
      // mid-render — they are harmless
      if (!err?.message?.includes('Window closed')) {
        console.error('PayPal render error:', err);
      }
    });
  } else {
    container.innerHTML = `
      <div style="text-align:center;padding:0.85rem;
                  background:#fff3cd;border:1px solid #ffe69c;
                  border-radius:8px;font-size:0.8rem;color:#856404">
        PayPal Buttons are not available in your region or browser.<br>
        Please contact us at
        <a href="mailto:${CONFIG.contactEmail}"
           style="color:#856404">${CONFIG.contactEmail}</a>
        to arrange payment.
      </div>`;
  }
}

/**
 * Also re-initialise buttons whenever qty changes or items are removed
 * so the PayPal order always reflects the live cart.
 */
function refreshPayPalIfOpen() {
  if (dom.cartDrawer?.classList.contains('open')) {
    initPayPalButtons();
  }
}

/* ─────────────────────────────────────────────
   MODAL / QUICK VIEW
───────────────────────────────────────────── */
function openModal(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;

  const hasDykes = p.awards && p.awards.includes('Dykes Medal');
  const dotStyle = COLOR_MAP[p.colorFamily]
    ? (COLOR_MAP[p.colorFamily].startsWith('linear')
        ? `background:${COLOR_MAP[p.colorFamily]};border:1px solid rgba(0,0,0,0.1)`
        : `background:${COLOR_MAP[p.colorFamily]}`)
    : '';

  dom.modalContent.innerHTML = `
    <button class="modal-close" id="modal-close-inner" aria-label="Close">✕</button>
    <div class="modal-inner">
      <div class="modal-img">
        <img src="${p.image}" alt="${p.name}"
             onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--clr-accent);opacity:0.4\\'>${placeholderSVG(p.name).replace(/"/g,"'")}</div>'">
      </div>
      <div class="modal-body">
        <div class="modal-type">${p.type}</div>
        <div class="modal-name">${p.name}</div>
        ${hasDykes ? `<div style="margin-bottom:0.75rem"><span class="badge badge-dykes">🏅 Dykes Medal Winner</span></div>` : ''}
        <div class="modal-stats">
          <div class="stat-item">
            <span class="stat-label">Color</span>
            <span class="stat-val">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;${dotStyle};vertical-align:middle;margin-right:4px"></span>
              ${p.color}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Height</span>
            <span class="stat-val">${p.height}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Bloom Time</span>
            <span class="stat-val">${p.bloomTime}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Hybridizer</span>
            <span class="stat-val">${p.hybridizer} (${p.year})</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Fragrance</span>
            <span class="stat-val">${p.fragrance}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Availability</span>
            <span class="stat-val" style="color:${p.stock>0?'#2e7d32':'#c62828'}">
              ${p.stock > 0 ? `${p.stock} in stock` : 'Sold Out'}
            </span>
          </div>
        </div>
        <p class="modal-desc">${p.description}</p>
        <div class="modal-footer">
          <div class="modal-price">${CONFIG.currencySymbol}${p.price.toFixed(2)} <small style="font-size:0.6em;font-weight:500;color:var(--clr-text-muted)">/ rhizome</small></div>
          <button class="btn-add" onclick="addToCart(${p.id})"
                  ${p.stock < 1 ? 'disabled' : ''}>
            ${p.stock > 0
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Cart`
              : 'Sold Out'}
          </button>
        </div>
      </div>
    </div>`;

  document.getElementById('modal-close-inner')
    ?.addEventListener('click', closeModal);

  dom.modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

/* ─────────────────────────────────────────────
   EVENT BINDING
───────────────────────────────────────────── */
function bindEvents() {

  // Search — debounced
  let searchTimer;
  dom.searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.query = dom.searchInput.value.trim();
      applyFilters();
    }, 280);
  });

  // Price range
  dom.priceRange?.addEventListener('input', () => {
    state.filters.maxPrice = parseInt(dom.priceRange.value);
    dom.priceVal.textContent = fmtPrice(state.filters.maxPrice);
    applyFilters();
  });

  // Color swatches
  dom.swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      dom.swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      state.filters.color = swatch.dataset.color;
      applyFilters();
    });
  });

  // Type chips
  dom.typeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dom.typeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.type = chip.dataset.type;
      applyFilters();
    });
  });

  // Bloom chips
  dom.bloomChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dom.bloomChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.bloom = chip.dataset.bloom;
      applyFilters();
    });
  });

  // Checkboxes
  dom.chkFeatured?.addEventListener('change', () => {
    state.filters.featured = dom.chkFeatured.checked; applyFilters();
  });
  dom.chkFragrant?.addEventListener('change', () => {
    state.filters.fragrant = dom.chkFragrant.checked; applyFilters();
  });
  dom.chkInStock?.addEventListener('change', () => {
    state.filters.inStock  = dom.chkInStock.checked; applyFilters();
  });
  dom.chkAward?.addEventListener('change', () => {
    state.filters.awardOnly = dom.chkAward.checked; applyFilters();
  });

  // Reset
  dom.btnReset?.addEventListener('click', window.resetFilters);

  // Sort
  dom.sortSelect?.addEventListener('change', () => {
    state.sort = dom.sortSelect.value;
    state.filtered = sortProducts(state.filtered, state.sort);
    render();
  });

  // View toggle
  dom.viewGrid?.addEventListener('click', () => {
    state.view = 'grid';
    dom.viewGrid.classList.add('active');
    dom.viewList.classList.remove('active');
    render();
  });

  dom.viewList?.addEventListener('click', () => {
    state.view = 'list';
    dom.viewList.classList.add('active');
    dom.viewGrid.classList.remove('active');
    render();
  });

  // Cart
  dom.cartBtn?.addEventListener('click', openCartDrawer);
  dom.cartClose?.addEventListener('click', closeCartDrawer);
  dom.cartOverlay?.addEventListener('click', closeCartDrawer);

  // Modal
  dom.modalOverlay?.addEventListener('click', e => {
    if (e.target === dom.modalOverlay) closeModal();
  });
  dom.modalClose?.addEventListener('click', closeModal);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeCartDrawer();
    }
  });

  // Hero CTA scroll
  document.getElementById('hero-cta')?.addEventListener('click', () => {
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
function fmtPrice(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CONFIG.currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
