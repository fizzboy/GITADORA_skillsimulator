(() => {
  'use strict';

  const SCRIPT_ID = 'gitadora-skill-simulator-sync';

  try {
    if (window.__GITADORA_SKILL_SIMULATOR_SYNC_RUNNING__) {
      alert('同期処理はすでに実行中です。');
      return;
    }
    window.__GITADORA_SKILL_SIMULATOR_SYNC_RUNNING__ = true;

    const returnUrl = 'https://gitadorafc.github.io/skillsimulator/';
    const slug =
      location.pathname.match(/\/game\/gfdm\/([^/]+)\//)?.[1] ||
      'gitadora_galaxywave_delta';

    if (location.hostname !== 'p.eagate.573.jp') {
      throw new Error('e-amusementのページで実行してください。');
    }

    const PART_MAP = { GUITAR:'G', BASS:'B', DRUM:'D', DRUMS:'D' };
    const DIFF_MAP = { BASIC:'BSC', ADVANCED:'ADV', EXTREME:'EXT', MASTER:'MAS' };
    const targets = [
      ['GF','HOT','gf',1],
      ['GF','OTHER','gf',0],
      ['DM','HOT','dm',1],
      ['DM','OTHER','dm',0]
    ];

    const records = [];
    const counts = {};

    let box = document.getElementById(SCRIPT_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = SCRIPT_ID;
      Object.assign(box.style, {
        position:'fixed', left:'12px', right:'12px', top:'12px',
        zIndex:'2147483647', padding:'12px 14px', borderRadius:'10px',
        background:'rgba(2,6,23,.96)', color:'#fff',
        fontSize:'14px', fontWeight:'700', lineHeight:'1.5',
        boxShadow:'0 6px 30px rgba(0,0,0,.35)'
      });
      document.documentElement.appendChild(box);
    }
    const showProgress = message => { box.textContent = message; };

    const run = async () => {
      showProgress('GITADORA スキル同期を開始します…');

      for (let i = 0; i < targets.length; i++) {
        const [instrument, category, gtype, stype] = targets[i];
        showProgress(`取得中… ${instrument} ${category} (${i + 1}/4)`);

        const url = `/game/gfdm/${slug}/p/playdata/skill.html?gtype=${gtype}&stype=${stype}`;
        const response = await fetch(url, { credentials:'include', cache:'no-store' });
        if (!response.ok) throw new Error(`${instrument} ${category} の取得に失敗しました。`);

        const html = await response.text();
        if (html.includes('e-amusementへのログインが必要') || html.includes('ログインした状態で')) {
          throw new Error('e-amusementへのログインが必要です。');
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [...doc.querySelectorAll('tr')]
          .filter(row => row.querySelector('.achive_cell') && row.querySelector('.music_seq_box'))
          .slice(0,25);

        counts[`${instrument}_${category}`] = rows.length;

        for (const row of rows) {
          const title = (
            row.querySelector('.title img[alt]')?.getAttribute('alt') ||
            row.querySelector('.title .text_link')?.textContent || ''
          ).trim();

          const seqBox = row.querySelector('.music_seq_box');
          const partEl = seqBox?.querySelector('[class*="part_"]');
          const diffEl = seqBox?.querySelector('[class*="diff_"]');

          const partName = [...(partEl?.classList || [])].find(c => c.startsWith('part_'))?.slice(5);
          const diffName = [...(diffEl?.classList || [])].find(c => c.startsWith('diff_'))?.slice(5);

          const part = PART_MAP[partName];
          const diff = DIFF_MAP[diffName];
          const rate = parseFloat((row.querySelector('.achive_cell')?.textContent || '').replace('%','').trim());
          const level = parseFloat((row.querySelector('.diff_cell')?.textContent || '').trim());

          if (title && part && diff && Number.isFinite(rate) && Number.isFinite(level)) {
            records.push({
              title,
              part:`${diff}-${part}`,
              rate,
              level,
              instrument,
              category
            });
          }
        }
      }

      showProgress(`取得完了：${records.length}件。Skill Simulatorへ戻ります…`);

      const payload = {
        type:'GITADORA_SKILL_SYNC',
        version:1,
        records,
        counts
      };

      location.href = returnUrl + '#skill-sync=' + encodeURIComponent(JSON.stringify(payload));
    };

    run().catch(error => {
      window.__GITADORA_SKILL_SIMULATOR_SYNC_RUNNING__ = false;
      showProgress(`同期失敗：${error?.message || error}`);
      alert(`同期に失敗しました: ${error?.message || error}`);
    });

  } catch (error) {
    window.__GITADORA_SKILL_SIMULATOR_SYNC_RUNNING__ = false;
    alert(`同期に失敗しました: ${error?.message || error}`);
  }
})();
