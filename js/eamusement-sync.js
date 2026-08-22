(() => {
  'use strict';

  const host = location.hostname;
  const slug = location.pathname.match(/\/game\/gfdm\/([^/]+)\//)?.[1] || '';

  if (host !== 'p.eagate.573.jp') {
    alert('e-amusementのページで実行してください。');
    return;
  }

  if (!/^[a-z0-9_-]+$/i.test(slug)) {
    alert('GITADORAのバージョンを判定できませんでした。');
    return;
  }

  const loaderId = 'gitadora-skill-simulator-version-loader';
  if (document.getElementById(loaderId)) return;

  const script = document.createElement('script');
  script.id = loaderId;
  script.src = `https://gitadorafc.github.io/skillsimulator/js/eamusement-sync/${slug}.js?t=${Date.now()}`;
  script.onload = () => script.remove();
  script.onerror = () => {
    script.remove();
    alert('このGITADORAバージョンの同期にはまだ対応していません。');
  };
  document.head.appendChild(script);
})();
