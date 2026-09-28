/* Checkout DPA: prezzi e disponibilità vengono verificati dal Worker condiviso. */
(function () {
    'use strict';

    const config = {
        worker: 'https://dpa-checkout.ramacciatoluca.workers.dev',
        clientId: 'AVi_0k_3cMqXNb36NhKDYRXLsk3WGsG7-Va01H8nSXra1OutsLpJc0svDtMD5PhpAUPdStRfuCFdTn8t'
    };
    const form = document.getElementById('checkout-form');
    const status = document.getElementById('checkout-status');
    const message = document.getElementById('checkout-payment-message');
    const cartKey = 'dpa_cart_v1';
    let cart = [];
    let initStarted = false;

    function t(key) {
        return window.DPA_I18N ? window.DPA_I18N.t(key) : key;
    }
    function money(value) {
        return `€ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
    }
    function readCart() {
        try {
            const value = JSON.parse(localStorage.getItem(cartKey) || '[]');
            return Array.isArray(value) ? value.filter(item => item && item.id != null) : [];
        } catch (_) { return []; }
    }
    function zone() {
        return form.elements.country.value === 'IT' ? 'italia' : 'europa';
    }
    function shipping() {
        const data = new FormData(form);
        return Object.fromEntries(['name', 'email', 'address', 'city', 'postal', 'region', 'country']
            .map(key => [key, String(data.get(key) || '').trim()]));
    }
    async function request(path, options) {
        const response = await fetch(config.worker + path, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }
    function post(path, data) {
        return request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
    function itemsForWorker() {
        return cart.map(item => ({ id: item.id, qty: item.qty }));
    }
    function renderCart() {
        const list = document.getElementById('checkout-items');
        list.replaceChildren();
        let subtotal = 0;
        cart.forEach(item => {
            const row = document.createElement('div');
            row.className = 'store-checkout-item';
            const name = document.createElement('span');
            name.textContent = `${item.name} × ${item.qty}`;
            const price = document.createElement('strong');
            price.textContent = money(item.price * item.qty);
            row.append(name, price);
            list.append(row);
            subtotal += item.price * item.qty;
        });
        document.getElementById('checkout-subtotal').textContent = money(subtotal);
    }
    async function updateQuote() {
        if (!cart.length) return;
        const quote = await post('/quote', {
            source: 'dpa', items: itemsForWorker(), zona: zone()
        });
        document.getElementById('checkout-shipping').textContent = money(quote.shipping);
        document.getElementById('checkout-total').textContent = money(quote.total);
    }
    async function verifyInventory() {
        const result = await request('/products?channel=dpa&category=musica');
        const products = Array.isArray(result.products) ? result.products : [];
        cart = readCart().map(item => {
            const product = products.find(p => String(p.id) === String(item.id));
            if (!product || product.sold || Number(product.copie) < Number(item.qty))
                throw new Error(t('store.cart_stock_error'));
            return { id: product.id, qty: Number(item.qty), name: product.name,
                price: Number(product.price) };
        });
        if (!cart.length) throw new Error(t('store.cart_empty'));
        renderCart();
    }
    function loadPayPal() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://www.paypal.com/sdk/js?client-id=' +
                encodeURIComponent(config.clientId) + '&currency=EUR&intent=capture&components=buttons';
            script.onload = resolve;
            script.onerror = () => reject(new Error(t('store.paypal_unavailable')));
            document.head.append(script);
        });
    }
    function renderPayPal() {
        if (!window.paypal || !window.paypal.Buttons) throw new Error(t('store.paypal_unavailable'));
        window.paypal.Buttons({
            onClick: (_data, actions) => {
                message.textContent = '';
                return form.reportValidity() ? actions.resolve() : actions.reject();
            },
            createOrder: async () => {
                await verifyInventory();
                await updateQuote();
                const result = await post('/create-order', {
                    source: 'dpa', items: itemsForWorker(), zona: zone(), shipping: shipping()
                });
                document.getElementById('checkout-total').textContent = money(result.total);
                return result.id;
            },
            onApprove: async data => {
                try {
                    const result = await post('/capture-order', {
                        source: 'dpa', orderID: data.orderID
                    });
                    const captures = result.purchase_units && result.purchase_units[0] &&
                        result.purchase_units[0].payments && result.purchase_units[0].payments.captures || [];
                    if (result.status !== 'COMPLETED' || !captures.some(capture => capture.status === 'COMPLETED'))
                        throw new Error(t('store.payment_not_confirmed'));
                    localStorage.removeItem(cartKey);
                    document.getElementById('checkout-paypal').replaceChildren();
                    status.textContent = t('store.payment_success') + ' ' + result.id;
                    status.classList.add('is-success');
                    message.textContent = '';
                } catch (error) {
                    message.textContent = t('store.payment_check_error') + ' ' + error.message;
                }
            },
            onCancel: () => { message.textContent = t('store.payment_cancelled'); },
            onError: error => { message.textContent = t('store.payment_error') + ' ' + error.message; }
        }).render('#checkout-paypal');
    }
    async function init() {
        if (t('store.checkout_checking') === 'store.checkout_checking') {
            status.textContent = 'Verifica disponibilità e collegamento PayPal…';
            document.addEventListener('dpa:languagechange', init, { once: true });
            return;
        }
        if (initStarted) return;
        initStarted = true;
        status.textContent = t('store.checkout_checking');
        try {
            const capabilities = await request('/checkout-capabilities?channel=dpa');
            if (!capabilities.ready) throw new Error(t('store.checkout_not_ready'));
            await verifyInventory();
            await updateQuote();
            await loadPayPal();
            renderPayPal();
            status.textContent = '';
        } catch (error) {
            const knownMessages = [t('store.cart_empty'), t('store.cart_stock_error')];
            status.textContent = knownMessages.includes(error.message)
                ? error.message
                : t('store.checkout_not_ready');
            status.classList.add('is-error');
        }
    }
    form.elements.country.addEventListener('change', () => {
        updateQuote().catch(error => { message.textContent = error.message; });
    });
    init();
}());
