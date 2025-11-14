// ======= State =======
const DEFAULT_PROJECT = {
  version: 1,
  taskmaster: {
    title: 'Untitled Project',
    updatedAt: new Date().toISOString(),
    playlist: [], // [{type:'category', title:'...', expanded:true, items:[{type:'video', mode:'url'|'local', title:'', urlSrc:'', localSrc:''}]}]
    // --- THIS IS NEW ---
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
const fileURLFromPath = (p) => 'file:///' + p.replace(/\\/g,'/').replace(/^([A-Za-z]):\//,'$1:/');

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
      <div class="row" style="gap:8px;flex-wrap:wrap;">
        <input id="new-cat-name" type="text" placeholder="Category name…" />
        <button class="btn" id="btn-add-category">Add Category</button>
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
            <button class="btn add-url" data-cidx="${cidx}">Add</button>
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

  // Header bindings
  const addCat = document.getElementById('btn-add-category');
  if (addCat) addCat.addEventListener('click', ()=>{
    const name = (document.getElementById('new-cat-name')?.value || '').trim() || `Category ${cats.length+1}`;
    cats.push({ type:'category', title:name, expanded:true, items:[] });
    const inp = document.getElementById('new-cat-name'); if (inp) inp.value='';
    project.taskmaster.updatedAt = nowISO();
    render();
  });

  // Category bindings
  $$('.accordion',container).forEach(acc=>{
    const cidx = Number(acc.getAttribute('data-cidx'));
    const cat = cats[cidx];

    acc.querySelector('.accordion-header').addEventListener('click', (e)=>{
      if (e.target.closest('.accordion-body')) return;
      cat.expanded = !cat.expanded; render();
    });

    if (!cat.expanded) return;
    const body = acc.querySelector('.accordion-body');

    // Add URL handler
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

    // Remove Category handler
    const rm = body.querySelector('.remove-cat');
    if (rm){
      rm.addEventListener('click', ()=>{
        if (!confirm('Remove this category?')) return;
        cats.splice(cidx,1);
        project.taskmaster.updatedAt = nowISO();
        render();
      });
    }

    // Kick off previews
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
  return html`
    <div class="card" data-cidx="${cidx}" data-iidx="${iidx}" data-url="${it.urlSrc || ''}">
      <h4>${it.title || 'Video'} <span class="badge">Online</span></h4>
      <div class="controls">
        <button class="btn rename">Rename</button>
        <button class="btn send-output">Send To Screen</button>
        <button class="btn close-session">Close Session</button>
        <button class="btn remove">Remove</button>
      </div>
    </div>`;
}

// ======= Scores / Notes =======
function renderScores(container){
  // --- THIS IS THE FIX ---
  // Pointing directly to the vendor's index.html to simplify communication
  container.innerHTML = html`
    <div class="panel" style="padding:0; height: calc(100vh - 160px);">
      <iframe id="scoreboard-iframe" src="./scoreboard/_vendor/tm-scoreboard-master/index.html" style="width:100%;height:100%;border:0;"></iframe>
    </div>`;
  
  const iframe = $('#scoreboard-iframe');
  if (iframe) {
    // 1. When the iframe loads, send it the saved data
    iframe.onload = () => {
      const contestantsData = (project.taskmaster.scoreboard && project.taskmaster.scoreboard.contestants) || [];
      iframe.contentWindow.postMessage({
        type: 'scoreboard:load',
        payload: contestantsData
      }, '*');
    };
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

  // --- THIS IS NEW ---
  // 2. Listen for messages *from* the iframe to save data
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'scoreboard:update') {
      if (!project.taskmaster.scoreboard) {
        project.taskmaster.scoreboard = {};
      }
      project.taskmaster.scoreboard.contestants = event.data.payload;
      project.taskmaster.updatedAt = nowISO();
      // console.log('Scoreboard data updated in main project');
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

    const renameBtn = t.closest('.rename');
    if (renameBtn && card) {
      try {
        const h4 = card.querySelector('h4');
        if (h4.querySelector('input')) return; // Already editing

        const cidx = Number(card.getAttribute('data-cidx'));
        const iidx = Number(card.getAttribute('data-iidx'));
        const it = project.taskmaster.playlist[cidx].items[iidx];
        const oldTitle = it.title || '';

        h4.innerHTML = `<input type="text" class="rename-input" value="${oldTitle.replace(/"/g, '&quot;')}" />`;
        const input = h4.querySelector('input');
        input.focus();
        input.select();

        const saveRename = () => {
          it.title = input.value.trim();
          project.taskmaster.updatedAt = nowISO();
          render(); 
        };
        
        input.addEventListener('blur', saveRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveRename();
          if (e.key === 'Escape') render(); 
        });

      } catch (e) { log('rename error', e && e.message || e); render(); }
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
    if (sendBtn){
      try{
        log('send-output clicked');
        const displayId = await window.taskmasterAPI.chooseDisplay();
        if (!displayId) return;
        
        const btnCard = sendBtn.closest('.card'); 
        let url = btnCard ? (btnCard.getAttribute('data-url')||'') : '';
        
        if (!url) url = prompt('Enter video URL to send:','') || '';
        if (!url) return;
        
        await window.taskmasterAPI.playUrl({ src:url, displayId, delayMs: 5000 });
        return;
      }catch(e){ log('send-output error', e && e.message || e); }
    }

    const closeBtn = t.closest('.close-session') || (t.tagName === 'BUTTON' && /Close Session/i.test((t.textContent||'')) ? t : null);
    if (closeBtn){
      try{ await window.taskmasterAPI.closeOutput(); log('close-output from card'); }
      catch(e){ log('close-output error', e && e.message || e); }
      return;
    }
  });
})();