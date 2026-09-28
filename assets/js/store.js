/* Dead People Activity - store musicale alimentato dall'inventario condiviso */
(function () {
    'use strict';

    const WORKER = 'https://dpa-checkout.ramacciatoluca.workers.dev';
    const SHARED_ASSET_HOST = 'https://ramacciatovintage.it';
    const LOCAL_CATALOG = 'assets/data/store/catalogo-musica.json';
    const productsNode = document.getElementById('store-products');
    const feedbackNode = document.getElementById('store-feedback');
    const searchNode = document.getElementById('store-search');
    const genreNode = document.getElementById('store-genre');
    const formatNode = document.getElementById('store-format');
    const conditionNode = document.getElementById('store-condition');
    const productOverlay = document.getElementById('store-product-modal');
    const cartOverlay = document.getElementById('store-cart-modal');
    const cartKey = 'dpa_cart_v1';
    let products = [];
    let activeProduct = null;
    let lastFocus = null;

    function t(key) {
        return window.DPA_I18N ? window.DPA_I18N.t(key) : key;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    }

    function absoluteAsset(path) {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        if (/^\/?assets\//i.test(path)) return String(path).replace(/^\/+/, '');
        return `${SHARED_ASSET_HOST}/${String(path).replace(/^\/+/, '')}`;
    }

    function imageFor(product) {
        if (product.cover) return absoluteAsset(product.cover);
        if (Array.isArray(product.photos) && product.photos[0]) return absoluteAsset(product.photos[0]);
        return '';
    }

    function productUrl(product) {
        const params = new URLSearchParams({ product: String(product.id) });
        return `store.html?${params.toString()}`;
    }

    function money(value) {
        return `€ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
    }

    function stock(product) {
        return Math.max(0, Math.floor(Number(product.copie == null ? 1 : product.copie) || 0));
    }

    function readCart() {
        try {
            const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
            return Array.isArray(cart) ? cart.filter(item => item && item.id != null) : [];
        } catch (_) { return []; }
    }

    function saveCart(cart) {
        localStorage.setItem(cartKey, JSON.stringify(cart));
        document.getElementById('store-cart-count').textContent = String(
            cart.reduce((sum, item) => sum + Number(item.qty || 0), 0));
    }

    function openOverlay(overlay) {
        lastFocus = document.activeElement;
        overlay.hidden = false;
        document.body.classList.add('store-dialog-open');
        overlay.querySelector('.store-dialog').focus();
    }

    function closeOverlay(overlay) {
        overlay.hidden = true;
        if (productOverlay.hidden && cartOverlay.hidden) document.body.classList.remove('store-dialog-open');
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    function addFact(container, label, value) {
        if (value == null || value === '') return;
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = String(value);
        container.append(dt, dd);
    }

    function openProduct(product, updateUrl = true) {
        activeProduct = product;
        const img = document.getElementById('store-modal-image');
        const image = imageFor(product);
        img.hidden = !image;
        if (image) img.src = image;
        else img.removeAttribute('src');
        img.alt = product.name || t('store.product');
        document.getElementById('store-modal-title').textContent = product.name || t('store.product');
        document.getElementById('store-modal-format').textContent = product.subcat || '';
        document.getElementById('store-modal-artist').textContent = product.artist || '';
        document.getElementById('store-modal-description').textContent = product.desc || '';
        document.getElementById('store-modal-price').textContent = money(product.price);
        document.getElementById('store-modal-availability').textContent =
            stock(product) ? `${stock(product)} ${t('store.available').toLocaleLowerCase()}` : t('store.sold_out');
        const facts = document.getElementById('store-modal-facts');
        facts.replaceChildren();
        addFact(facts, t('store.condition'), product.condition);
        addFact(facts, t('store.format'), product.subcat);
        addFact(facts, t('store.genre'), genresFor(product).join(' · '));
        addFact(facts, t('store.label'), product.label);
        addFact(facts, t('store.year'), product.year);
        const qty = document.getElementById('store-modal-quantity');
        const inCart = readCart().find(item => String(item.id) === String(product.id));
        const remaining = Math.max(0, stock(product) - Number(inCart && inCart.qty || 0));
        qty.value = '1';
        qty.max = String(Math.max(1, remaining));
        qty.disabled = !remaining;
        document.getElementById('store-modal-add').disabled = !remaining;
        openOverlay(productOverlay);
        if (updateUrl) {
            const url = new URL(location.href);
            url.searchParams.set('product', String(product.id));
            history.replaceState(null, '', url);
        }
    }

    function renderCart() {
        const node = document.getElementById('store-cart-items');
        const cart = readCart();
        node.replaceChildren();
        if (!cart.length) {
            const empty = document.createElement('p');
            empty.textContent = t('store.cart_empty');
            node.append(empty);
        }
        let total = 0;
        cart.forEach(item => {
            const row = document.createElement('div');
            row.className = 'store-cart-row';
            const label = document.createElement('span');
            label.textContent = `${item.name} × ${item.qty}`;
            const price = document.createElement('strong');
            price.textContent = money(Number(item.price) * Number(item.qty));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `${t('store.remove')} ${item.name}`);
            remove.addEventListener('click', () => {
                saveCart(readCart().filter(other => String(other.id) !== String(item.id)));
                renderCart();
            });
            row.append(label, price, remove);
            node.append(row);
            total += Number(item.price) * Number(item.qty);
        });
        document.getElementById('store-cart-total').textContent = money(total);
        document.querySelector('.store-cart-checkout').classList.toggle('disabled', !cart.length);
    }

    function genresFor(product) {
        if (Array.isArray(product.genres)) return product.genres.filter(Boolean);
        return String(product.genres || '').split(',').map(value => value.trim()).filter(Boolean);
    }

    function fillSelect(node, values, emptyLabel) {
        if (!node) return;
        const current = node.value;
        const options = [new Option(emptyLabel, '')];
        [...new Set(values.filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .forEach(value => options.push(new Option(value, value)));
        node.replaceChildren(...options);
        node.value = options.some(option => option.value === current) ? current : '';
    }

    function buildFilters() {
        fillSelect(genreNode, products.flatMap(genresFor), t('flt.all_genres'));
        fillSelect(formatNode, products.map(product => product.subcat), t('store.all_formats'));
        fillSelect(conditionNode, products.map(product => product.condition), t('store.all_conditions'));
    }

    function card(product) {
        const article = document.createElement('article');
        article.className = 'store-product-card';
        const available = stock(product);
        const image = escapeHtml(imageFor(product));
        const safeUrl = escapeHtml(productUrl(product));
        const safeName = escapeHtml(product.name || t('store.product'));
        const safeArtist = escapeHtml(product.artist || '');
        const safeGenres = genresFor(product).map(escapeHtml);
        const safeCondition = escapeHtml(product.condition || '');
        article.innerHTML = `
            <a class="store-product-image" href="${safeUrl}" data-store-product="${escapeHtml(product.id)}">
                ${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">♫</span>'}
            </a>
            <div class="store-product-body">
                <h3>${safeName}</h3>
                ${safeArtist ? `<p class="store-product-artist">${safeArtist}</p>` : ''}
                ${safeGenres.length ? `<p class="store-product-genres">${safeGenres.join(' · ')}</p>` : ''}
                <p class="store-product-format">${escapeHtml(product.subcat || t('store.music_title'))}</p>
                ${safeCondition ? `<p class="store-product-condition"><span>${escapeHtml(t('store.condition'))}:</span> ${safeCondition}</p>` : ''}
                <div class="store-product-bottom">
                    <strong>€ ${Number(product.price || 0).toFixed(2).replace('.', ',')}</strong>
                    <span class="${available ? 'is-available' : 'is-sold'}">${available ? t('store.available') : t('store.sold_out')}</span>
                </div>
                <a class="btn store-product-button${available ? '' : ' disabled'}" href="${available ? safeUrl : '#'}"
                   data-store-product="${escapeHtml(product.id)}">${available ? t('store.view_buy') : t('store.sold_out')}</a>
            </div>`;
        return article;
    }

    function render() {
        const query = String(searchNode && searchNode.value || '').trim().toLocaleLowerCase();
        const genre = genreNode ? genreNode.value : '';
        const format = formatNode ? formatNode.value : '';
        const condition = conditionNode ? conditionNode.value : '';
        const filtered = products.filter(product => {
            const matchesText = [product.name, product.artist, product.label, product.subcat,
                product.condition, ...genresFor(product)]
                .some(value => String(value || '').toLocaleLowerCase().includes(query));
            return matchesText && (!genre || genresFor(product).includes(genre)) &&
                (!format || product.subcat === format) &&
                (!condition || product.condition === condition);
        });
        productsNode.replaceChildren(...filtered.map(card));
        feedbackNode.textContent = filtered.length
            ? t('store.results').replace('{count}', String(filtered.length))
            : t('store.empty');
        feedbackNode.classList.toggle('has-results', filtered.length > 0);
    }

    async function fetchJson(url, timeoutMs) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller && timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller ? controller.signal : undefined
        }).finally(() => { if (timer) clearTimeout(timer); });
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
    }

    async function load() {
        feedbackNode.textContent = t('store.loading');
        const localPreview = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
        if (localPreview) {
            try {
                const local = await fetchJson(LOCAL_CATALOG);
                products = Array.isArray(local) ? local : [];
                buildFilters();
                render();
                const requested = new URLSearchParams(location.search).get('product');
                const selected = products.find(product => String(product.id) === requested);
                if (selected) openProduct(selected, false);
                return;
            } catch (_) {
                // Se manca il catalogo locale, continua con la fonte centrale.
            }
        }
        try {
            const central = await fetchJson(`${WORKER}/products?channel=dpa&category=musica`, 2500);
            products = Array.isArray(central.products) ? central.products : [];
        } catch (_) {
            try {
                const local = await fetchJson(LOCAL_CATALOG);
                products = Array.isArray(local) ? local : [];
            } catch (error) {
                products = [];
                feedbackNode.textContent = t('store.unavailable');
                return;
            }
        }
        buildFilters();
        render();
        const requested = new URLSearchParams(location.search).get('product');
        const selected = products.find(product => String(product.id) === requested);
        if (selected) openProduct(selected, false);
    }

    productsNode.addEventListener('click', event => {
        const link = event.target.closest('[data-store-product]');
        if (!link) return;
        event.preventDefault();
        const selected = products.find(product => String(product.id) === link.dataset.storeProduct);
        if (selected) openProduct(selected);
    });
    document.getElementById('store-modal-add').addEventListener('click', () => {
        if (!activeProduct) return;
        const qty = Number(document.getElementById('store-modal-quantity').value);
        if (!Number.isInteger(qty) || qty < 1) return;
        const cart = readCart();
        const current = cart.find(item => String(item.id) === String(activeProduct.id));
        if (qty + Number(current && current.qty || 0) > stock(activeProduct)) return;
        if (current) current.qty += qty;
        else cart.push({ id: activeProduct.id, name: activeProduct.name,
            price: Number(activeProduct.price), qty });
        saveCart(cart);
        closeOverlay(productOverlay);
        renderCart();
        openOverlay(cartOverlay);
    });
    document.getElementById('store-cart-open').addEventListener('click', () => {
        renderCart();
        openOverlay(cartOverlay);
    });
    document.querySelectorAll('[data-store-close]').forEach(button => {
        button.addEventListener('click', () => closeOverlay(button.closest('.store-overlay')));
    });
    [productOverlay, cartOverlay].forEach(overlay => {
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeOverlay(overlay);
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') [productOverlay, cartOverlay].forEach(overlay => {
            if (!overlay.hidden) closeOverlay(overlay);
        });
    });
    saveCart(readCart());

    if (searchNode) searchNode.addEventListener('input', render);
    [genreNode, formatNode, conditionNode].forEach(node => {
        if (node) node.addEventListener('change', render);
    });
    document.addEventListener('dpa:languagechange', () => { buildFilters(); render(); });
    load();
}());
