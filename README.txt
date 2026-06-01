# 🌸 Melnikov Iris Garden — GitHub Pages Shop Template

A complete, static, data-driven iris catalog and shop built for GitHub Pages.  
Pure HTML + CSS + vanilla JavaScript. Zero dependencies. No build step required.

---

## 📁 File Structure

```
iris-shop/
├── shop.html          ← Main storefront page
├── shop.css           ← All styles (responsive, custom properties)
├── shop.js            ← Catalog engine, cart, filters, modal
├── products.json      ← Your product data (edit this!)
├── images/
│   ├── README.txt     ← Image naming guide
│   └── *.jpg          ← Your iris photos go here
└── README.md          ← This file
```

---

## 🚀 Quick Start (GitHub Pages)

1. **Fork or upload** this folder into any GitHub repository.
2. Go to **Settings → Pages** → set source to `main` branch, `/ (root)` or `/docs` folder.
3. Your shop is live at `https://yourusername.github.io/your-repo/shop.html`

That's it — no npm, no build, no server.

---

## ✏️ Customising Your Shop

### 1. Change the shop name & contact info

Open `shop.js` and edit the `CONFIG` block near the top:

```js
const CONFIG = {
  shopName:       'Melnikov Iris Garden',   // ← your name
  dataUrl:        'products.json',          // ← keep as-is
  currency:       'USD',
  currencySymbol: '$',
  contactEmail:   'sergey@example.com',     // ← your email
  cartKey:        'iris_shop_cart',
};
```

Also update the name, location, and email in **`shop.html`** (in the `<footer>` and `<head>` `<meta>` tags).

---

### 2. Add / edit products

Edit **`products.json`**. Each product object supports:

| Field         | Type      | Description |
|---------------|-----------|-------------|
| `id`          | number    | Unique integer ID |
| `name`        | string    | Cultivar name |
| `type`        | string    | e.g. "Tall Bearded", "Border Bearded" |
| `color`       | string    | Descriptive color label |
| `colorFamily` | string    | One of: `purple` `blue` `white` `pink` `yellow` `bicolor` |
| `height`      | string    | e.g. "36 in" |
| `bloomTime`   | string    | e.g. "Early", "Mid", "Mid-Late", "Late" |
| `year`        | number    | Year introduced |
| `hybridizer`  | string    | Hybridizer's last name |
| `price`       | number    | Price per rhizome (USD) |
| `stock`       | number    | Units in stock (0 = sold out) |
| `description` | string    | 1–3 sentence product description |
| `awards`      | string[]  | e.g. `["Dykes Medal"]` or `[]` |
| `fragrance`   | string    | "None", "Mild", "Sweet", or "Strong" |
| `image`       | string    | Relative path, e.g. `"images/my-iris.jpg"` |
| `featured`    | boolean   | Shows in "Staff Picks" strip and badge |

**Minimal valid product example:**
```json
{
  "id": 21,
  "name": "My Iris",
  "type": "Tall Bearded",
  "color": "Blue",
  "colorFamily": "blue",
  "height": "36 in",
  "bloomTime": "Mid",
  "year": 2020,
  "hybridizer": "Smith",
  "price": 10.00,
  "stock": 5,
  "description": "A gorgeous blue iris.",
  "awards": [],
  "fragrance": "Mild",
  "image": "images/my-iris.jpg",
  "featured": false
}
```

---

### 3. Add your photos

Drop JPEG or WebP files into the `images/` folder.  
Filenames must match the `"image"` field in `products.json`.  
See `images/README.txt` for full specs and tips.

> **No photos yet?** The shop shows a beautiful SVG iris silhouette placeholder automatically.

---

### 4. Customise colours & fonts

All visual tokens live at the top of **`shop.css`** as CSS custom properties:

```css
:root {
  --clr-accent:       #7c4dff;   /* primary purple accent */
  --clr-accent-dark:  #5e35b1;
  --clr-header-bg:    #3d1f8a;   /* header & footer background */
  --clr-price:        #4a148c;   /* price text colour */
  --font-display:     'Playfair Display', Georgia, serif;
  --font-sans:        'Inter', 'Segoe UI', system-ui, sans-serif;
  /* ... */
}
```

Change `--clr-accent` to any hex value to instantly re-theme the whole shop.

---

### 5. Add new filter types

**New iris type** (e.g. "Louisiana"):
1. Add `"type": "Louisiana"` in `products.json` for the relevant products.
2. Add a chip button in `shop.html` inside `.chip-list` for type chips:
   ```html
   <button class="chip-btn type-chip" data-type="Louisiana">Louisiana</button>
   ```

**New color family**:
1. Add `"colorFamily": "red"` in your products.
2. Add a swatch in `shop.html` and the CSS dot colour in `shop.css` (`.color-swatches`).
3. Add the hex value to `COLOR_MAP` in `shop.js`.

---

## 🛒 Connecting a Checkout

The cart is fully functional client-side. The checkout button calls an `alert()` as a placeholder.  
Replace it with one of these approaches:

### Option A — PayPal Buy Now Buttons
Generate buttons at paypal.com/buttons and replace the `btn-checkout` `onclick`.

### Option B — Stripe Payment Links
Create a Payment Link in Stripe Dashboard → embed the URL in the checkout button.

### Option C — Ecwid (free tier)
Add one script tag from Ecwid and embed their storefront widget alongside this catalog.

### Option D — Email order form
Replace the checkout button to open `mailto:sergey@example.com?subject=Iris%20Order` with the cart contents stringified in the body (build the string in `shop.js`).

### Option E — Formspree / Netlify Forms
Build an order form that posts to a serverless form handler, passing the cart JSON as a hidden field.

---

## 🧩 Advanced Tips

- **Pagination**: Set `CONFIG.perPage` in `shop.js` to e.g. `12` and implement a page counter in `applyFilters()` — the filtered array is already in `state.filtered`.
- **Multiple pages**: Create `shop-tb.html`, `shop-bb.html` etc., each loading a filtered subset via URL params: `shop.html?type=Tall+Bearded`. Parse `URLSearchParams` at startup to pre-set `state.filters`.
- **Offline / PWA**: Add a `manifest.json` and a minimal service worker to cache `products.json` and assets for offline browsing.
- **Analytics**: Drop in a `<script>` for Plausible or Google Analytics — it works with static sites.

---

## 📋 Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge).  
IE is not supported (uses CSS Grid, custom properties, `fetch`, and `async/await`).

---

## 📄 License

Free to use and modify for personal and commercial purposes.  
No attribution required, but appreciated!

---

*Built for Sergey Melnikov · Melnikov Iris Garden · Fairview, CA*
