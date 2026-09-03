/* Dead People Activity - internationalization engine */
(function () {
    'use strict';

    const SUPPORTED = ['it', 'en', 'es', 'ca', 'de', 'fr'];
    const LABELS = { it: 'Italiano', en: 'English', es: 'Español', ca: 'Català', de: 'Deutsch', fr: 'Français' };
    const cache = {};
    const textBindings = new WeakMap();
    const attrBindings = new WeakMap();
    let current = 'it';
    let initialized = false;
    let observer = null;

    function storedLanguage() {
        try {
            const value = localStorage.getItem('dpa_lang');
            return SUPPORTED.includes(value) ? value : null;
        } catch (_) { return null; }
    }

    function browserLanguage() {
        const raw = String(navigator.language || 'it').toLowerCase();
        const short = raw.split('-')[0];
        return SUPPORTED.includes(short) ? short : 'en';
    }

    function locationLanguage() {
        // Il fuso orario del dispositivo consente una scelta geografica senza
        // inviare IP o posizione a servizi esterni. Il catalano viene distinto
        // tramite le preferenze del browser, perche' Catalogna e Spagna hanno
        // lo stesso fuso orario.
        const browserLanguages = Array.from(navigator.languages || [navigator.language || ''])
            .map(value => String(value).toLowerCase());
        if (browserLanguages.some(value => value === 'ca' || value.startsWith('ca-'))) return 'ca';

        let timezone = '';
        try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}

        const byTimezone = {
            'Europe/Rome': 'it',
            'Europe/Vatican': 'it',
            'Europe/San_Marino': 'it',
            'Europe/Madrid': 'es',
            'Europe/Ceuta': 'es',
            'Atlantic/Canary': 'es',
            'Europe/Paris': 'fr',
            'Europe/Monaco': 'fr',
            'Europe/Berlin': 'de',
            'Europe/Busingen': 'de',
            'Europe/London': 'en',
            'Europe/Dublin': 'en',
            'Europe/Guernsey': 'en',
            'Europe/Isle_of_Man': 'en',
            'Europe/Jersey': 'en'
        };
        return byTimezone[timezone] || browserLanguage();
    }

    function urlLanguage() {
        const value = new URLSearchParams(window.location.search).get('lang');
        return SUPPORTED.includes(value) ? value : null;
    }

    function pathLanguage() {
        const segment = window.location.pathname.split('/').filter(Boolean).find(value => SUPPORTED.includes(value));
        return segment || null;
    }

    function alternateDestination(alternate) {
        const target = new URL(alternate.href, window.location.href);
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
        if (!localHost) return target.href;

        // In anteprima Live Server conserva la cartella del progetto davanti
        // alla route localizzata, invece di saltare al dominio di produzione.
        const currentParts = window.location.pathname.split('/').filter(Boolean);
        const languageIndex = currentParts.findIndex(value => SUPPORTED.includes(value));
        const prefix = languageIndex >= 0 ? currentParts.slice(0, languageIndex) : [];
        const targetPath = target.pathname.split('/').filter(Boolean);
        return '/' + prefix.concat(targetPath).join('/') + '/' + target.search + target.hash;
    }

    function updateLanguageUrl(language) {
        const url = new URL(window.location.href);
        if (language === 'it') url.searchParams.delete('lang');
        else url.searchParams.set('lang', language);
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    async function load(language) {
        if (cache[language]) return cache[language];
        const response = await fetch(`assets/i18n/${language}.json?v=1`);
        if (!response.ok) throw new Error(`Dizionario ${language} non disponibile`);
        cache[language] = await response.json();
        return cache[language];
    }

    function reverseItalian() {
        const reverse = new Map();
        Object.entries(cache.it || {}).forEach(([key, value]) => reverse.set(value, key));
        return reverse;
    }

    function bindTextNodes(root) {
        const reverse = reverseItalian();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.language-switcher, #lang-chooser')) return NodeFilter.FILTER_REJECT;
                return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (textBindings.has(node)) continue;
            const raw = node.nodeValue;
            const text = raw.trim();
            const explicit = node.parentElement && node.parentElement.dataset.i18n;
            const key = explicit || reverse.get(text);
            if (!key) continue;
            textBindings.set(node, {
                key,
                lead: raw.match(/^\s*/)[0],
                trail: raw.match(/\s*$/)[0]
            });
        }
    }

    function bindAttributes(root) {
        const reverse = reverseItalian();
        const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')];
        elements.forEach(element => {
            if (attrBindings.has(element)) return;
            const bindings = [];
            ['placeholder', 'title', 'aria-label', 'content'].forEach(attribute => {
                if (!element.hasAttribute(attribute)) return;
                const explicit = element.dataset[`i18n${attribute.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}`];
                const key = explicit || reverse.get(element.getAttribute(attribute));
                if (key) bindings.push({ attribute, key });
            });
            if (bindings.length) attrBindings.set(element, bindings);
        });
    }

    function translate(root) {
        bindTextNodes(root || document.body);
        bindAttributes(root || document.body);
        const dictionary = cache[current] || cache.it || {};
        document.documentElement.lang = current;

        const visit = document.createTreeWalker(root || document.body, NodeFilter.SHOW_ALL);
        let node = visit.currentNode;
        while (node) {
            if (node.nodeType === Node.TEXT_NODE && textBindings.has(node)) {
                const binding = textBindings.get(node);
                node.nodeValue = binding.lead + (dictionary[binding.key] || cache.it[binding.key]) + binding.trail;
            } else if (node.nodeType === Node.ELEMENT_NODE && attrBindings.has(node)) {
                attrBindings.get(node).forEach(binding => {
                    node.setAttribute(binding.attribute, dictionary[binding.key] || cache.it[binding.key]);
                });
            }
            node = visit.nextNode();
        }
    }

    async function setLanguage(language, persist = true) {
        const next = SUPPORTED.includes(language) ? language : 'it';
        await load('it');
        await load(next);
        current = next;
        if (persist) {
            try { localStorage.setItem('dpa_lang', next); } catch (_) {}
            updateLanguageUrl(next);
        }
        translate(document.documentElement);
        updateSwitcher(next);
        document.dispatchEvent(new CustomEvent('dpa:languagechange', { detail: { language: next } }));
    }

    function t(key, variables) {
        const dictionary = cache[current] || cache.it || {};
        let value = dictionary[key] || (cache.it && cache.it[key]) || key;
        Object.entries(variables || {}).forEach(([name, replacement]) => {
            value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
        });
        return value;
    }

    function injectSwitcher() {
        const nav = document.querySelector('.nav-container');
        if (!nav || nav.querySelector('.language-switcher')) return;
        const switcher = document.createElement('div');
        switcher.className = 'language-switcher';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'language-switcher-toggle';
        toggle.setAttribute('aria-label', 'Lingua del sito');
        toggle.setAttribute('aria-haspopup', 'true');
        toggle.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('div');
        menu.className = 'language-switcher-menu';
        menu.setAttribute('role', 'menu');
        SUPPORTED.forEach(language => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'language-option';
            option.dataset.language = language;
            option.setAttribute('role', 'menuitem');
            option.innerHTML = `<img src="assets/img/flags/${language}.svg" alt=""><span>${LABELS[language]}</span><b>${language.toUpperCase()}</b>`;
            option.addEventListener('click', async () => {
                const alternate = document.querySelector(`link[rel="alternate"][hreflang="${language}"]`);
                if (alternate && pathLanguage()) {
                    try { localStorage.setItem('dpa_lang', language); } catch (_) {}
                    window.location.href = alternateDestination(alternate);
                    return;
                }
                await setLanguage(language);
                switcher.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            });
            menu.appendChild(option);
        });
        toggle.addEventListener('click', () => {
            const open = switcher.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        switcher.appendChild(toggle);
        switcher.appendChild(menu);
        const hamburger = nav.querySelector('.hamburger');
        if (hamburger) nav.insertBefore(switcher, hamburger);
        else nav.appendChild(switcher);
        updateSwitcher(current);
        document.addEventListener('click', event => {
            if (!switcher.contains(event.target)) {
                switcher.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                switcher.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function updateSwitcher(language) {
        const switcher = document.querySelector('.language-switcher');
        if (!switcher) return;
        const toggle = switcher.querySelector('.language-switcher-toggle');
        if (toggle) toggle.innerHTML = `<img src="assets/img/flags/${language}.svg" alt=""><span>${language.toUpperCase()}</span><i aria-hidden="true">⌄</i>`;
        switcher.querySelectorAll('.language-option').forEach(option => {
            const active = option.dataset.language === language;
            option.classList.toggle('active', active);
            option.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    function showChooser(suggested) {
        if (document.getElementById('lang-chooser')) return;
        const overlay = document.createElement('div');
        overlay.id = 'lang-chooser';
        overlay.innerHTML = '<div class="lang-chooser-box"><h3>Lingua / Language</h3><p>Scegli la lingua del sito</p><div class="lang-chooser-grid"></div></div>';
        const grid = overlay.querySelector('.lang-chooser-grid');
        SUPPORTED.forEach(language => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn' + (language === suggested ? ' is-suggested' : '');
            button.innerHTML = `<img src="assets/img/flags/${language}.svg" alt=""><span>${LABELS[language]}</span>`;
            button.addEventListener('click', async () => {
                await setLanguage(language);
                overlay.remove();
            });
            grid.appendChild(button);
        });
        document.body.appendChild(overlay);
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        const requested = urlLanguage();
        const localizedPath = pathLanguage();
        const saved = storedLanguage();
        const selected = requested || localizedPath || saved || locationLanguage();
        try {
            await load('it');
            await setLanguage(selected, false);
            injectSwitcher();
            observer = new MutationObserver(records => {
                records.forEach(record => record.addedNodes.forEach(node => {
                    if (node.nodeType === 1 || node.nodeType === 3) translate(node.nodeType === 3 ? node.parentNode : node);
                }));
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (error) {
            console.error('[DPA i18n]', error);
        }
    }

    window.DPA_I18N = { init, setLanguage, translate, t, getLanguage: () => current, supported: SUPPORTED.slice() };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
