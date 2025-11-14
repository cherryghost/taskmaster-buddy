(function(){
  const sections = [...document.querySelectorAll('.section')];
  const navLinks = [...document.querySelectorAll('.nav a')];
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('#toggleSidebar');
  const SCORES_IFRAME = document.getElementById('scores-iframe');
  const SCORES_URL = 'https://projects.alanbunnytest.xyz/taskmaster/command/scoreboard/_vendor/tm-scoreboard-master/index.html'; // unmodified scoreboard

  function show(hash){
    const target = (hash || '#home').split('?')[0];
    sections.forEach(s => s.classList.toggle('active', '#'+s.id === target));
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === target));
    if(target === '#scores' && SCORES_IFRAME){
      if(!SCORES_IFRAME.getAttribute('src')){
        SCORES_IFRAME.src = SCORES_URL;
        SCORES_IFRAME.dataset.loaded = '1';
      }
    }
    // Lazy load playlist iframes when opening playlist
    if(target === '#playlist'){
      document.querySelectorAll('.acc-item.open .acc-body [data-iframe-src]').forEach(mountIframe);
    }
  }

  function mountIframe(box){
    if(box.dataset.loaded === '1') return;
    const src = box.dataset.iframeSrc;
    const iframe = document.createElement('iframe');
    iframe.allowFullscreen = true;
    iframe.setAttribute('loading','lazy');
    iframe.src = src;
    box.innerHTML = '';
    box.appendChild(iframe);
    box.dataset.loaded = '1';
  }

  // Nav clicks
  navLinks.forEach(a => {
    a.addEventListener('click', (e) => {
      // allow normal hash change
    });
  });

  // Hash routing
  window.addEventListener('hashchange', ()=>show(location.hash));
  show(location.hash || '#home');

  // Sidebar expand/collapse
  if(toggle){
    toggle.addEventListener('click', ()=>{
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('taskmaster.sidebar.collapsed', sidebar.classList.contains('collapsed') ? '1':'0');
    });
    if(localStorage.getItem('taskmaster.sidebar.collapsed') === '1'){
      sidebar.classList.add('collapsed');
    }
  }

  // Playlist accordion
  document.querySelectorAll('.acc-item .acc-head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.closest('.acc-item');
      const body = item.querySelector('.acc-body');
      const opened = item.classList.toggle('open');
      if(opened){
        body.querySelectorAll('[data-iframe-src]').forEach(mountIframe);
      }
    });
  });
})();

  // Scores fullscreen toggle
  (function(){
    const container = document.querySelector('.scores-frame');
    const iframe = document.getElementById('scores-iframe');
    const btn = document.getElementById('btnScoresFull');
    const btnExit = document.getElementById('btnScoresExit');
    if(!container || !iframe || !btn || !btnExit) return;

    function enter(){
      container.classList.add('fullscreen');
      document.body.classList.add('no-scroll');
    }
    function exit(){
      container.classList.remove('fullscreen');
      document.body.classList.remove('no-scroll');
    }
    btn.addEventListener('click', enter);
    btnExit.addEventListener('click', exit);
    // ESC to exit
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') exit(); });
  })();

  // Scores fullscreen toggle + diagnostics
  (function(){
    const container = document.querySelector('.scores-frame');
    const iframe = document.getElementById('scores-iframe');
    const btn = document.getElementById('btnScoresFull');
    const btnExit = document.getElementById('btnScoresExit');
    const debugNote = document.getElementById('scores-debug');
    const openTab = document.getElementById('scores-open-tab');
    let loadTimer;

    if(!container || !iframe || !btn || !btnExit) return;

    function enter(){
      container.classList.add('fullscreen');
      document.body.classList.add('no-scroll', 'chrome-hidden');
    }
    function exit(){
      container.classList.remove('fullscreen');
      document.body.classList.remove('no-scroll', 'chrome-hidden');
    }
    btn.addEventListener('click', enter);
    btnExit.addEventListener('click', exit);
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') exit(); });

    // Diagnostics
    iframe.addEventListener('load', ()=>{
      clearTimeout(loadTimer);
      try{
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const ok = !!doc && !!doc.body && doc.body.innerHTML.trim().length > 0;
        if(ok){
          if(debugNote) debugNote.textContent = '';
        }else{
          if(debugNote) debugNote.textContent = 'Scores loaded but returned empty markup.';
        }
      }catch(e){
        if(debugNote) debugNote.textContent = '';
      }
    });
    iframe.addEventListener('error', ()=>{
      if(debugNote) debugNote.textContent = 'Scores failed to load (iframe error). Check Network tab.';
    });

    // Slow-load timer
    loadTimer = setTimeout(()=>{
      if(!iframe.dataset.loaded) return;
      if(debugNote && !iframe.contentWindow) debugNote.textContent = 'Scores taking a while… verify the iframe URL exists.';
    }, 4000);

    if(openTab){
      openTab.addEventListener('click', (e)=>{
        e.preventDefault();
        const url = iframe.getAttribute('src') || 'scoreboard/_vendor/tm-scoreboard-master/index.html';
        window.open(url, '_blank', 'noopener');
      });
    }
  })();

  (function(){
    const iframe = document.getElementById('scores-iframe');
    const urlEl = document.getElementById('scores-url');
    if(!iframe || !urlEl) return;
    iframe.addEventListener('load', ()=>{
      try{
        urlEl.textContent = 'URL: ' + (iframe.contentWindow?.location?.href || iframe.src);
      }catch(e){
        urlEl.textContent = '';
      }
    });
  })();

  // Robust scoreboard loader: if iframe remains blank, fetch HTML and use srcdoc with a <base>.
  (function(){
    const iframe = document.getElementById('scores-iframe');
    if(!iframe) return;
    const absUrl = iframe.getAttribute('data-url') || iframe.getAttribute('src');
    const vendorBase = absUrl.replace(/index\.html?$/,''); // end with slash

    function isBlank(){
      try{
        const d = iframe.contentDocument || iframe.contentWindow.document;
        return !d || !d.body || d.body.innerHTML.trim() === '';
      }catch(e){
        // cross-origin; assume not blank
        return false;
      }
    }

    function injectBase(html){
      // If there's already a <base>, leave it. Otherwise add one pointing to vendorBase.
      if(/<base\s/i.test(html)) return html;
      return html.replace(/<head([^>]*)>/i, (m, g1) => `<head$1><base href="${vendorBase}">`);
    }

    function tryFallback(){
      fetch(absUrl, {credentials:'include'}).then(r=>r.text()).then(txt=>{
        const withBase = injectBase(txt);
        iframe.removeAttribute('src'); // force srcdoc mode
        iframe.setAttribute('srcdoc', withBase);
      }).catch(err=>{
        const dbg = document.getElementById('scores-debug');
        if(dbg) dbg.textContent = 'Fetch fallback failed: ' + (err && err.message ? err.message : err);
      });
    }

    // After load, if still blank, fallback.
    iframe.addEventListener('load', ()=>{
      setTimeout(()=>{
        if(isBlank()) tryFallback();
      }, 500);
    });

    // Also kick a delayed check in case load event didn't fire
    setTimeout(()=>{
      if(isBlank()) tryFallback();
    }, 1500);
  })();
