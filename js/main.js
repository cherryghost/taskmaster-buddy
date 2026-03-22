// ======= State =======
const DEFAULT_PROJECT = {
  version: 1,
  taskmaster: {
    title: 'Untitled Project',
    updatedAt: new Date().toISOString(),
    playlist: [], 
    scoreboard: { contestants: [] }, 
    notes: '',
    settings: { defaultOutputDisplay: 1 }
  }
};
let project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));

// ======= Utils =======
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const nowISO = () => new Date().toISOString();

const fileURLFromPath = (p) => {
  if (!p) return ''; 
  return 'file:///' + p.replace(/\\/g,'/').replace(/^([A-Za-z]):\//,'$1:/');
};

function html(strings, ...vals){ return strings.reduce((a,s,i)=> a + s + (vals[i] ?? ''), ''); }
function setActive(tab){ $$('nav button').forEach(b=>b.classList.remove('active')); $('#nav-'+tab).classList.add('active'); }
function ensureCategories(){
  const pl = project.taskmaster.playlist;
  if (!pl.every(x=>x.type==='category')){
    project.taskmaster.playlist = [{ type:'category', title:'Playlist', expanded:true, items: pl.map(x=> ({type:'video',mode:'url',title:x.title||'Video',urlSrc:x.src||'',localSrc:''})) }];
  }
}

// ======= Rendering =======
function render(){
  const content = $('#content');
  const tab = ($('nav button.active')?.id || 'nav-playlist').replace('nav-','');
  if (tab==='playlist') renderPlaylist(content);
  if (tab==='scores') renderScores(content);
  if (tab==='notes') renderNotes(content);
}

function renderPlaylist(container){
  ensureCategories();
  const cats = project.taskmaster.playlist;

  container.innerHTML = html`
    <div class="panel">
      <div class="row" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:8px;">
          <input id="new-cat-name" type="text" placeholder="Category name…" />
          <button class="btn" id="btn-add-category">Add Category</button>
        </div>
        <button class="btn close-session" style="background:#900; color:white; font-size:1em; padding: 6px 16px;">🛑 Close Screen</button>
      </div>
    </div>
    ${cats.map((cat,cidx)=> html`
      <div class="accordion" data-cidx="${cidx}">
        <div class="accordion-header">
          <div class="accordion-title">${cat.title}</div>
          <div><span class="badge">${cat.expanded ? '▼' : '▶'}</span></div>
        </div>
        ${cat.expanded ? html`
        <div class="accordion-body">
          <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <input type="text" id="url-title-${cidx}" placeholder="Video title…" style="min-width:180px;" />
            <input type="text" id="url-src-${cidx}" placeholder="Embed URL (iframe src)…" style="min-width:380px; flex:1;" />
            
            <button class="btn add-url" data-cidx="${cidx}">Add URL</button>
            <button class="btn add-local" data-cidx="${cidx}">Add Local</button>

            <button class="btn remove-cat" data-cidx="${cidx}">Remove Category</button>
          </div>
          <div class="grid">
            ${cat.items.map((it,iidx)=> itemCard(it,cidx,iidx)).join('')}
          </div>
        </div>
        `:''}
      </div>
    `).join('')}
  `;

  const addCat = document.getElementById('btn-add-category');
  if (addCat) addCat.addEventListener('click', ()=>{
    const name = (document.getElementById('new-cat-name')?.value || '').trim() || `Category ${cats.length+1}`;
    cats.push({ type:'category', title:name, expanded:true, items:[] });
    const inp = document.getElementById('new-cat-name'); if (inp) inp.value='';
    project.taskmaster.updatedAt = nowISO();
    render();
  });

  $$('.accordion',container).forEach(acc=>{
    const cidx = Number(acc.getAttribute('data-cidx'));
    const cat = cats[cidx];

    acc.querySelector('.accordion-header').addEventListener('click', (e)=>{
      if (e.target.closest('.accordion-body')) return;
      cat.expanded = !cat.expanded; render();
    });

    if (!cat.expanded) return;
    const body = acc.querySelector('.accordion-body');

    const addBtn = body.querySelector('.add-url');
    const tInp = body.querySelector(`#url-title-${cidx}`);
    const uInp = body.querySelector(`#url-src-${cidx}`);
    
    if (addBtn){
      addBtn.addEventListener('click', ()=>{
        const title = (tInp && tInp.value.trim()) ? tInp.value.trim() : 'Video';
        const url = (uInp && uInp.value.trim()) ? uInp.value.trim() : '';
        if (!url) { alert('Please enter an embed URL'); return; }
        cat.items.push({ type:'video', mode:'url', title, urlSrc:url, localSrc:'' });
        if (tInp) tInp.value=''; if (uInp) uInp.value='';
        project.taskmaster.updatedAt = nowISO();
        render();
      });
    }

    const localBtn = body.querySelector('.add-local');
    if (localBtn) {
      localBtn.addEventListener('click', async () => {
        const localPath = await window.taskmasterAPI.selectLocalVideo();
        if (!localPath) return; 
        
        const fileName = localPath.split(/[/\\]/).pop();
        const title = (tInp && tInp.value.trim()) ? tInp.value.trim() : fileName;
        
        cat.items.push({ type:'video', mode:'local', title, urlSrc:'', localSrc: localPath });
        
        if (tInp) tInp.value='';
        project.taskmaster.updatedAt = nowISO();
        render();
      });
    }

    const rm = body.querySelector('.remove-cat');
    if (rm){
      rm.addEventListener('click', ()=>{
        if (!confirm('Remove this category?')) return;
        cats.splice(cidx,1);
        project.taskmaster.updatedAt = nowISO();
        render();
      });
    }

    $$('.preview', body).forEach(async img => {
      const url = img.getAttribute('data-url');
      if (!url) return;
      try {
        const data = await window.taskmasterAPI.requestPreview(url);
        if (data) img.src = data;
      } catch (e) { console.error('preview fetch failed', e); }
    });
  });
}

function itemCard(it,cidx,iidx){
  const isLocal = it.mode === 'local';
  const badgeText = isLocal ? 'Local' : 'Online';
  const srcUrl = isLocal ? fileURLFromPath(it.localSrc) : (it.urlSrc || '');

  return html`
    <div class="card" data-cidx="${cidx}" data-iidx="${iidx}" data-url="${srcUrl}" data-mode="${it.mode}">
      <h4>${it.title || 'Video'} <span class="badge">${badgeText}</span></h4>
      <div class="controls">
        <button class="btn edit-item">Edit</button>
        <button class="btn send-output" style="background: #2a2;">Send To Screen</button>
        <button class="btn remove">Remove</button>
      </div>
    </div>`;
}

// ======= Scores / Notes =======
function renderScores(container){
  container.innerHTML = html`
    <div class="panel" style="padding: 10px 0 0 0; display:flex; flex-direction:column; height: calc(100vh - 160px);">
      <div style="padding: 0 10px 10px 10px; text-align: right; border-bottom: 1px solid #333; display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn close-session" style="background: #900; color: white;">🛑 Close Screen</button>
        <button class="btn" id="cast-scoreboard-btn" style="background: #0066cc; color: white;">📺 Send Scoreboard To Screen</button>
      </div>
      <iframe id="scoreboard-iframe" src="./scoreboard/_vendor/tm-scoreboard-master/index.html" style="width:100%;flex:1;border:0;"></iframe>
    </div>`;
  
  const iframe = $('#scoreboard-iframe');
  if (iframe) {
    iframe.onload = () => {
      const contestantsData = (project.taskmaster.scoreboard && project.taskmaster.scoreboard.contestants) || [];
      iframe.contentWindow.postMessage({
        type: 'scoreboard:load',
        payload: contestantsData
      }, '*');
    };
  }

  const castBtn = $('#cast-scoreboard-btn');
  if (castBtn) {
    castBtn.addEventListener('click', async () => {
      const displayId = await window.taskmasterAPI.chooseDisplay();
      if (!displayId) return;

      const a = document.createElement('a');
      a.href = "./scoreboard/_vendor/tm-scoreboard-master/index.html";
      const absoluteUrl = a.href;

      // FIX: Grab the current state and send it along with the play request!
      const contestantsData = (project.taskmaster.scoreboard && project.taskmaster.scoreboard.contestants) || [];

      await window.taskmasterAPI.playUrl({ 
        src: absoluteUrl, 
        displayId, 
        delayMs: 0, 
        type: 'iframe',
        scoreboardData: contestantsData // <--- Data is now bundled here
      });
    });
  }
}

function renderNotes(container){
  if (!project.taskmaster.notes) project.taskmaster.notes='';
  container.innerHTML = html`<div class="panel"><textarea id="notes">${project.taskmaster.notes}</textarea></div>`;
  $('#notes').addEventListener('input',(e)=>{ project.taskmaster.notes=e.target.value; project.taskmaster.updatedAt=nowISO(); });
}

// ======= IO =======
function collectCurrentState(){ return project; }
function loadProjectData(data){ if (!data || !data.taskmaster) return; project=data; render(); }

// ======= Boot =======
document.addEventListener('DOMContentLoaded', ()=>{
  $('#nav-playlist').addEventListener('click', ()=>{ setActive('playlist'); render(); });
  $('#nav-scores').addEventListener('click', ()=>{ setActive('scores'); render(); });
  $('#nav-notes').addEventListener('click', ()=>{ setActive('notes'); render(); });

  $('#btn-open').addEventListener('click', async ()=>{ 
    const result = await window.taskmasterAPI.loadProject(); 
    if(result && result.data) loadProjectData(result.data);
  });
  
  $('#btn-save').addEventListener('click', async ()=>{ 
    await window.taskmasterAPI.saveProject({ data: collectCurrentState() });
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'scoreboard:update') {
      if (!project.taskmaster.scoreboard) {
        project.taskmaster.scoreboard = {};
      }
      project.taskmaster.scoreboard.contestants = event.data.payload;
      project.taskmaster.updatedAt = nowISO();
    }
  });

  setActive('playlist'); render();
});

// GLOBAL_TM_DEBUG (Card click handler)
(function(){
  function log(){ try{ const box=document.getElementById('tm-debug'); if(box){ const d=document.createElement('div'); d.textContent='[TM] '+Array.from(arguments).join(' '); box.appendChild(d); box.scrollTop=box.scrollHeight; } console.log('[TM]', ...arguments);}catch{} }
  window.addEventListener('error', e=> log('renderer error', e && e.message || e));
  window.addEventListener('unhandledrejection', e=> log('renderer rej', e && (e.reason && e.reason.message) || e && e.reason || e));

  document.addEventListener('click', async (ev)=>{
    const t = ev.target;
    if (!t || !t.closest) return;

    const card = t.closest('.card');

    const editBtn = t.closest('.edit-item');
    if (editBtn && card) {
      try {
        const cidx = Number(card.getAttribute('data-cidx'));
        const iidx = Number(card.getAttribute('data-iidx'));
        const it = project.taskmaster.playlist[cidx].items[iidx];
        
        const isLocal = it.mode === 'local';
        const safeTitle = (it.title || '').replace(/"/g, '&quot;');
        const safeUrl = (it.urlSrc || '').replace(/"/g, '&quot;');

        card.innerHTML = `
          <div style="margin-bottom:10px;">
            <input type="text" class="edit-title" value="${safeTitle}" placeholder="Title" style="width:100%; margin-bottom:6px; padding:4px;" />
            ${!isLocal ? 
              `<input type="text" class="edit-url" value="${safeUrl}" placeholder="Embed URL" style="width:100%; padding:4px;" />` 
              : `<div style="font-size:0.85em; color:#888; word-break:break-all;">Path: ${it.localSrc}</div>`
            }
          </div>
          <div class="controls">
            <button class="btn save-edit" style="background:#060; color:white;">Save</button>
            <button class="btn cancel-edit">Cancel</button>
          </div>
        `;
      } catch (e) { log('edit error', e); render(); }
      return; 
    }

    const saveEditBtn = t.closest('.save-edit');
    if (saveEditBtn && card) {
      const cidx = Number(card.getAttribute('data-cidx'));
      const iidx = Number(card.getAttribute('data-iidx'));
      const it = project.taskmaster.playlist[cidx].items[iidx];
      
      const newTitle = card.querySelector('.edit-title').value;
      it.title = newTitle.trim();
      
      if (it.mode === 'url') {
        const newUrl = card.querySelector('.edit-url').value;
        it.urlSrc = newUrl.trim();
      }
      
      project.taskmaster.updatedAt = nowISO();
      render();
      return;
    }

    const cancelEditBtn = t.closest('.cancel-edit');
    if (cancelEditBtn) {
      render(); 
      return;
    }

    const removeBtn = t.closest('.remove');
    if (removeBtn && card) {
      try {
        if (!confirm('Remove this item?')) return;
        const cidx = Number(card.getAttribute('data-cidx'));
        const iidx = Number(card.getAttribute('data-iidx'));
        project.taskmaster.playlist[cidx].items.splice(iidx,1);
        project.taskmaster.updatedAt = nowISO();
        render();
      } catch (e) { log('remove error', e && e.message || e); }
      return; 
    }

    const sendBtn = t.closest('.send-output') || (t.tagName === 'BUTTON' && /Send To Screen/i.test((t.textContent||'')) ? t : null);
    if (sendBtn && (!sendBtn.id || !sendBtn.id.includes('cast-scoreboard-btn'))){
      try{
        log('send-output clicked');
        const displayId = await window.taskmasterAPI.chooseDisplay();
        if (!displayId) return;
        
        const btnCard = sendBtn.closest('.card'); 
        let url = btnCard ? (btnCard.getAttribute('data-url')||'') : '';
        let mode = btnCard ? (btnCard.getAttribute('data-mode')||'') : 'url';
        
        if (!url) url = prompt('Enter video URL to send:','') || '';
        if (!url) return;
        
        const isDirectVideo = mode === 'local' || /\.(mp4|webm|ogg|mkv|mov)(\?.*)?$/i.test(url);
        const mediaType = isDirectVideo ? 'video' : 'iframe';
        const delay = 5000; 
        
        await window.taskmasterAPI.playUrl({ src:url, displayId, delayMs: delay, type: mediaType });
        return;
      }catch(e){ log('send-output error', e && e.message || e); }
    }

    const closeBtn = t.closest('.close-session');
    if (closeBtn){
      try{ await window.taskmasterAPI.closeOutput(); log('close-output triggered'); }
      catch(e){ log('close-output error', e && e.message || e); }
      return;
    }
  });
})();