/* Dead People Activity - vetrina musicale condivisa con Ramacciato Vintage */
(function () {
    'use strict';

    const WORKER = 'https://ramacciato-sconti.ramacciatoluca.workers.dev';
    const RV = 'https://ramacciatovintage.it';
    const LOCAL_CATALOG = 'assets/data/store/catalogo-musica.json';
    const productsNode = document.getElementById('store-products');
    const feedbackNode = document.getElementById('store-feedback');
    const searchNode = document.getElementById('store-search');
    let products = [];

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
        return `${RV}/${String(path).replace(/^\/+/, '')}`;
    }

    function imageFor(product) {
        if (product.cover) return absoluteAsset(product.cover);
        if (Array.isArray(product.photos) && product.photos[0]) return absoluteAsset(product.photos[0]);
        return '';
    }

    function productUrl(product) {
        const params = new URLSearchParams({ cat: 'musica', product: String(product.id), source: 'dpa' });
        return `${RV}/shop.html?${params.toString()}`;
    }

    function card(product) {
        const article = document.createElement('article');
        article.className = 'store-product-card';
        const available = Math.max(0, Number(product.copie == null ? 1 : product.copie));
        const image = escapeHtml(imageFor(product));
        const safeUrl = escapeHtml(productUrl(product));
        const safeName = escapeHtml(product.name || t('store.product'));
        const safeArtist = escapeHtml(product.artist || '');
        article.innerHTML = `
            <a class="store-product-image" href="${safeUrl}" target="_blank" rel="noopener">
                ${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">♫</span>'}
            </a>
            <div class="store-product-body">
                <p class="store-product-format">${escapeHtml(product.subcat || product.condition || t('store.music_title'))}</p>
                <h3>${safeArtist ? `${safeArtist} — ` : ''}${safeName}</h3>
                <div class="store-product-bottom">
                    <strong>€ ${Number(product.price || 0).toFixed(2).replace('.', ',')}</strong>
                    <span class="${available ? 'is-available' : 'is-sold'}">${available ? t('store.available') : t('store.sold_out')}</span>
                </div>
                <a class="btn store-product-button${available ? '' : ' disabled'}" href="${available ? safeUrl : '#'}"
                   target="${available ? '_blank' : '_self'}" rel="noopener">${available ? t('store.view_buy') : t('store.sold_out')}</a>
            </div>`;
        return article;
    }

    function render() {
        const query = String(searchNode && searchNode.value || '').trim().toLocaleLowerCase();
        const filtered = products.filter(product => [product.name, product.artist, product.label, product.subcat]
            .some(value => String(value || '').toLocaleLowerCase().includes(query)));
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
        render();
    }

    if (searchNode) searchNode.addEventListener('input', render);
    document.addEventListener('dpa:languagechange', render);
    load();
}());
