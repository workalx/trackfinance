// Language switch for the privacy and terms pages: ?lang=, then the language picked in the app, then the browser's.
(function () {
  const LANGS = ['uk', 'en', 'ru'];
  const STORE_KEY = 'trackfinance.visitorLanguage';

  function initialLang() {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (err) { /* storage blocked: fall through */ }
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    return LANGS.includes(browser) ? browser : 'en';
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang-section]').forEach((el) => { el.hidden = el.dataset.langSection !== lang; });
    document.querySelectorAll('.legal-lang [data-lang]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang)));
    document.querySelectorAll('[data-keep-lang]').forEach((a) => {
      const url = new URL(a.getAttribute('href'), location.href);
      url.searchParams.set('lang', lang);
      a.href = url.pathname.split('/').pop() + url.search;
      if (a.dataset[lang]) a.textContent = a.dataset[lang];
    });
    const heading = document.querySelector(`[data-lang-section="${lang}"] h1`);
    if (heading) document.title = `${heading.textContent} — TrackFinance`;
  }

  document.querySelectorAll('.legal-lang [data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      apply(btn.dataset.lang);
      history.replaceState(null, '', `?lang=${btn.dataset.lang}`);
    });
  });

  apply(initialLang());
}());
