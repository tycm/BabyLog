/* app.js
   Compact baby log PWA with import/export, counters, notes, PDF print, and share-URL.
   Storage: localStorage (JSON).
   Entry format: {type: "pee"|"poop"|"both"|"feed_start"|"feed_stop", ts: 1234567890, note?: "..." }
*/

const STORAGE_KEY = 'baby_log_entries_v1';

// ---------- storage ----------
function loadLog(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.error('Corrupt log, resetting', e);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}
function saveLog(entries){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ---------- entries ----------
function addEntry(type, note){
  const entries = loadLog();
  const entry = {type, ts: Date.now()};
  if(note) entry.note = String(note).slice(0,200);
  entries.push(entry);
  saveLog(entries);
  render();
}
function lastFeedState(){
  const entries = loadLog();
  for(let i = entries.length -1; i>=0; i--){
    if(entries[i].type === 'feed_start') return 'started';
    if(entries[i].type === 'feed_stop') return 'stopped';
  }
  return 'stopped';
}
function toggleFeed(note){
  const state = lastFeedState();
  if(state === 'stopped') addEntry('feed_start', note);
  else addEntry('feed_stop', note);
}

// ---------- formatting ----------
function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}
function relativeLabel(ts){
  const diff = Date.now() - ts;
  const s = Math.floor(diff/1000);
  if(s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  if(m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  if(h < 24) return `${h}h`;
  const d = Math.floor(h/24);
  return `${d}d`;
}

// ---------- counters ----------
function entriesInWindow(ms){
  const now = Date.now();
  return loadLog().filter(e => (now - e.ts) <= ms);
}
function countsFromEntries(entries){
  let pee = 0, poop = 0, feed = 0;
  for(const e of entries){
    if(e.type === 'pee') pee++;
    else if(e.type === 'poop') poop++;
    else if(e.type === 'feed_start') feed++;
  }
  return {pee, poop, feed};
}
function updateCounters(){
  const MS_DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const last24 = entriesInWindow(MS_DAY);
  const c24 = countsFromEntries(last24);
}

// ---------- import/export/merge ----------
function mergeEntries(oldEntries, newEntries){
  const map = new Map();
  for(const e of oldEntries) map.set(`${e.ts}|${e.type}|${e.note||''}`, e);
  for(const e of newEntries) map.set(`${e.ts}|${e.type}|${e.note||''}`, e);
  return Array.from(map.values()).sort((a,b)=> a.ts - b.ts);
}

// export
function exportJSON(){
  const data = loadLog();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'baby-log.json';
  a.click();
  URL.revokeObjectURL(url);
}

// import (file input)
async function handleImportFile(file){
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) throw new Error('Imported JSON must be an array');
    const valid = parsed.every(p => p && typeof p.type === 'string' && typeof p.ts === 'number');
    if(!valid) throw new Error('Entries must be objects with type and ts');
    const existing = loadLog();
    const choice = confirm('OK to MERGE imported entries into existing log. Cancel to REPLACE the log.');
    const result = choice ? mergeEntries(existing, parsed) : parsed.slice().sort((a,b)=>a.ts-b.ts);
    saveLog(result);
    render();
    alert('Import successful');
  }catch(err){
    console.error(err);
    alert('Import failed: ' + (err.message || err));
  }
}

// ---------- render ----------
function render(){
  const list = document.getElementById('logList');
  if(!list) return;
  list.innerHTML = '';
  const entries = loadLog().slice().reverse();
  if(entries.length === 0){
    list.innerHTML = '<li class="logItem">No entries yet</li>';
  } else {
    for(const e of entries){
      const li = document.createElement('li');
      li.className = 'logItem';
      const left = document.createElement('div'); left.className = 'logLeft';
      const label = (()=>{
        switch(e.type){
          case 'pee': return 'Pee';
          case 'poop': return 'Poop';
          case 'both': return 'Both';
          case 'feed_start': return 'Feed — Start';
          case 'feed_stop': return 'Feed — Stop';
          default: return e.type;
        }
      })();
      left.innerHTML = `<strong>${label}</strong><div class="logMeta">${formatTime(e.ts)} • ${relativeLabel(e.ts)}</div>`;
      if(e.note) left.innerHTML += `<div class="logNote">${escapeHtml(e.note)}</div>`;

      const right = document.createElement('div');
      const delBtn = document.createElement('button'); delBtn.className='smallBtn'; delBtn.textContent='Delete';
      delBtn.style.marginLeft='8px';
      delBtn.addEventListener('click', ()=> {
        if(confirm('Delete this entry?')) {
          const all = loadLog().filter(x => !(x.ts===e.ts && x.type===e.type && (x.note||'')===(e.note||'')));
          saveLog(all);
          render();
        }
      });
      right.appendChild(editBtn);
      right.appendChild(delBtn);

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    }
  }
  const feedBtn = document.getElementById('feed');
  if(feedBtn) feedBtn.textContent = (lastFeedState() === 'stopped') ? 'Start Feed' : 'Stop Feed';
  updateCounters();
}

// ---------- edit ----------
function editEntry(e){
  const newNote = prompt('Edit note (blank to remove):', e.note || '');
  if(newNote === null) return;
  const entries = loadLog();
  for(const ent of entries){
    if(ent.ts === e.ts && ent.type === e.type && (ent.note||'') === (e.note||'')){
      if(newNote === '') delete ent.note;
      else ent.note = newNote;
      break;
    }
  }
  saveLog(entries);
  render();
}

// ---------- small helpers ----------
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ---------- listeners ----------
function setupListeners(){
  const peeBtn = document.getElementById('pee');
  const poopBtn = document.getElementById('poop');
  const feedBtn = document.getElementById('feed');
  const exportBtn = document.getElementById('export');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const clearBtn = document.getElementById('clear');
  const addWithNote = document.getElementById('addWithNote');
  const noteInput = document.getElementById('noteInput');

  if(peeBtn) peeBtn.addEventListener('click', ()=> { addEntry('pee'); });
  if(poopBtn) poopBtn.addEventListener('click', ()=> { addEntry('poop'); });
  if(feedBtn) feedBtn.addEventListener('click', ()=> { toggleFeed(); });

  if(exportBtn) exportBtn.addEventListener('click', exportJSON);
  if(importBtn && importFile){
    importBtn.addEventListener('click', ()=> importFile.click());
    importFile.addEventListener('change', async (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if(!f) return;
      await handleImportFile(f);
    });
  }

  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    if(confirm('Clear entire log?')){ localStorage.removeItem(STORAGE_KEY); render(); }
  });

  if(shareBtn) shareBtn.addEventListener('click', createShareURL);
  if(printBtn) printBtn.addEventListener('click', generate24hPDF);
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', ()=>{
  setupListeners();
  tryConsumeShareParam();
  render();
  setInterval(render, 15000);
  setInterval(updateCounters, 30000);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW register failed', e));
  }
});
