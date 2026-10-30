(function () {
  'use strict';

  const script = document.currentScript;
  const root = script ? new URL('../../', script.src) : new URL('/', location.href);
  const url = relative => new URL(relative, root).href;
  const metricsEndpoint = 'https://dpa-checkout.ramacciatoluca.workers.dev/pwa-metric';
  const platform = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' :
    (/android/i.test(navigator.userAgent) ? 'android' : 'desktop');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const COPY = {
    it: { install:'INSTALLA DPA', title:'INSTALLA DPA SU IPHONE', steps:['Apri questa pagina in <strong>Safari</strong>.','Tocca il pulsante <strong>Condividi</strong>.','Scegli <strong>Aggiungi alla schermata Home</strong>.','Conferma con <strong>Aggiungi</strong>.'], close:'HO CAPITO' },
    en: { install:'INSTALL DPA', title:'INSTALL DPA ON IPHONE', steps:['Open this page in <strong>Safari</strong>.','Tap the <strong>Share</strong> button.','Choose <strong>Add to Home Screen</strong>.','Confirm with <strong>Add</strong>.'], close:'GOT IT' },
    es: { install:'INSTALA DPA', title:'INSTALA DPA EN IPHONE', steps:['Abre esta página en <strong>Safari</strong>.','Pulsa el botón <strong>Compartir</strong>.','Elige <strong>Añadir a pantalla de inicio</strong>.','Confirma con <strong>Añadir</strong>.'], close:'ENTENDIDO' },
    ca: { install:'INSTAL·LA DPA', title:'INSTAL·LA DPA A L’IPHONE', steps:['Obre aquesta pàgina amb <strong>Safari</strong>.','Toca el botó <strong>Compartir</strong>.','Tria <strong>Afegir a la pantalla d’inici</strong>.','Confirma amb <strong>Afegir</strong>.'], close:'ENTÈS' },
    de: { install:'DPA INSTALLIEREN', title:'DPA AUF DEM IPHONE INSTALLIEREN', steps:['Öffne diese Seite in <strong>Safari</strong>.','Tippe auf <strong>Teilen</strong>.','Wähle <strong>Zum Home-Bildschirm</strong>.','Bestätige mit <strong>Hinzufügen</strong>.'], close:'VERSTANDEN' },
    fr: { install:'INSTALLER DPA', title:'INSTALLER DPA SUR IPHONE', steps:['Ouvre cette page dans <strong>Safari</strong>.','Touche le bouton <strong>Partager</strong>.','Choisis <strong>Sur l’écran d’accueil</strong>.','Confirme avec <strong>Ajouter</strong>.'], close:'COMPRIS' }
  };
  let installPrompt = null;
  let installButton = null;

  function language() {
    const query = new URLSearchParams(location.search).get('lang');
    if (COPY[query]) return query;
    try { const saved = localStorage.getItem('dpa_lang'); if (COPY[saved]) return saved; } catch (_) {}
    const html = String(document.documentElement.lang || '').slice(0, 2).toLowerCase();
    return COPY[html] ? html : 'it';
  }

  function track(eventName) {
    const body = JSON.stringify({ event: eventName, platform });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(metricsEndpoint, new Blob([body], { type: 'text/plain' }))) return;
      fetch(metricsEndpoint, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
    } catch (_) {}
  }

  function addHeadMetadata() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = url('manifest.webmanifest');
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const icon = document.createElement('link');
      icon.rel = 'apple-touch-icon';
      icon.href = url('assets/img/pwa/apple-touch-icon.png');
      document.head.appendChild(icon);
    }
    const metas = [
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'black'],
      ['apple-mobile-web-app-title', 'DPA']
    ];
    metas.forEach(([name, content]) => {
      if (document.querySelector('meta[name="' + name + '"]')) return;
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    });
  }

  function isIosBrowser() {
    return platform === 'ios' && !standalone;
  }

  function injectStyles() {
    if (document.getElementById('pwa-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-ui-styles';
    style.textContent = '.pwa-install-button{display:none;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 15px;border:2px solid #fff;background:#d7ff00;color:#000;font:700 .84rem var(--font-punk-body,Courier New,monospace);text-transform:uppercase;cursor:pointer;box-shadow:4px 4px 0 #ff2a2a}.pwa-install-button.is-visible{display:inline-flex}.pwa-install-float{position:fixed;left:16px;bottom:92px;z-index:939}.pwa-ios-overlay{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.88)}.pwa-ios-box{width:min(430px,100%);padding:24px;border:3px dashed #d7ff00;background:#050505;color:#fff;box-shadow:8px 8px 0 #ff2a2a;font-family:var(--font-punk-body,Courier New,monospace)}.pwa-ios-box h2{margin:0 0 14px;font-family:var(--font-punk-headers,Impact,sans-serif);font-size:1.7rem}.pwa-ios-box ol{padding-left:22px;line-height:1.6}.pwa-ios-box button{width:100%;margin-top:12px;padding:12px;border:2px solid #fff;background:#d7ff00;color:#000;font-weight:900;cursor:pointer}@media(max-width:700px){.pwa-install-float{left:8px;bottom:82px}}';
    document.head.appendChild(style);
  }

  function iosInstructions() {
    track('ios_instructions');
    const text = COPY[language()];
    const overlay = document.createElement('div');
    overlay.className = 'pwa-ios-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="pwa-ios-box"><h2>' + text.title + '</h2><ol>' + text.steps.map(step => '<li>' + step + '</li>').join('') + '</ol><button type="button">' + text.close + '</button></div>';
    overlay.querySelector('button').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  async function requestInstall() {
    track('install_button_clicked');
    if (isIosBrowser()) { iosInstructions(); return; }
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    const choice = await prompt.prompt();
    track(choice && choice.outcome === 'accepted' ? 'install_accepted' : 'install_dismissed');
    if (installButton) installButton.classList.remove('is-visible');
  }

  function ensureInstallButton() {
    if (standalone) return null;
    if (installButton) return installButton;
    installButton = document.getElementById('pwaInstallButton');
    if (!installButton && /(^|\/)index\.html$|\/$/.test(location.pathname)) {
      installButton = document.createElement('button');
      installButton.id = 'pwaInstallButton';
      installButton.type = 'button';
      installButton.className = 'pwa-install-button pwa-install-float';
      installButton.textContent = 'INSTALLA DPA';
      document.body.appendChild(installButton);
    }
    if (installButton) installButton.addEventListener('click', requestInstall);
    if (installButton) installButton.textContent = COPY[language()].install;
    return installButton;
  }

  addHeadMetadata();
  injectStyles();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    navigator.serviceWorker.register(url('service-worker.js'), { scope: root.pathname }).catch(() => {});
  }

  if (standalone) {
    track('pwa_launch');
    try {
      if (!localStorage.getItem('dpa_pwa_first_launch')) {
        localStorage.setItem('dpa_pwa_first_launch', new Date().toISOString());
        track(platform === 'ios' ? 'ios_first_standalone_launch' : 'first_standalone_launch');
      }
    } catch (_) {}
  } else if (isIosBrowser()) {
    const button = ensureInstallButton();
    if (button) button.classList.add('is-visible');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    track('install_prompt_available');
    const button = ensureInstallButton();
    if (button) button.classList.add('is-visible');
  });

  window.addEventListener('appinstalled', () => {
    track('appinstalled');
    installPrompt = null;
    if (installButton) installButton.classList.remove('is-visible');
  });

  document.addEventListener('dpa:languagechange', () => {
    if (installButton) installButton.textContent = COPY[language()].install;
  });

  window.DPA_PWA = { track, isStandalone: () => standalone };
})();
