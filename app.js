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
    else if(e.type === 'both'){ pee++; poop++; }
    else if(e.type === 'feed_start') feed++;
  }
  return {pee, poop, feed};
}
function updateCounters(){
  const MS_DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const last24 = entriesInWindow(MS_DAY);
  const c24 = countsFromEntries(last24);

  // 7-day buckets
  const entries = loadLog();
  const dayBuckets = new Array(7).fill(0).map(()=> ({pee:0,poop:0,feed:0}));
  for(const e of entries){
    const age = now - e.ts;
    if(age > 7 * MS_DAY) continue;
    const dayIndex = Math.floor(age / MS_DAY); // 0 = today
    if(dayIndex < 0 || dayIndex >= 7) continue;
    if(e.type === 'pee') dayBuckets[dayIndex].pee++;
    else if(e.type === 'poop') dayBuckets[dayIndex].poop++;
    else if(e.type === 'both'){ dayBuckets[dayIndex].pee++; dayBuckets[dayIndex].poop++; }
    else if(e.type === 'feed_start') dayBuckets[dayIndex].feed++;
  }

  const totals = dayBuckets.reduce((acc,d)=>{ acc.pee+=d.pee; acc.poop+=d.poop; acc.feed+=d.feed; return acc; }, {pee:0,poop:0,feed:0});
  const avgPerDay = {
    pee: +(totals.pee / 7).toFixed(1),
    poop: +(totals.poop / 7).toFixed(1),
    feed: +(totals.feed / 7).toFixed(1)
  };

  const peeEl = document.getElementById('countPee');
  const poopEl = document.getElementById('countPoop');
  const feedEl = document.getElementById('countFeed');
  const avgPee = document.getElementById('avgPee');
  const avgPoop = document.getElementById('avgPoop');
  const avgFeed = document.getElementById('avgFeed');
  const avgTotal = document.getElementById('avgTotal');

  if(peeEl) peeEl.textContent = c24.pee;
  if(poopEl) poopEl.textContent = c24.poop;
  if(feedEl) feedEl.textContent = c24.feed;
  if(avgPee) avgPee.textContent = 'Avg/day (7d): ' + avgPerDay.pee;
  if(avgPoop) avgPoop.textContent = 'Avg/day (7d): ' + avgPerDay.poop;
  if(avgFeed) avgFeed.textContent = 'Avg/day (7d): ' + avgPerDay.feed;
  if(avgTotal) avgTotal.textContent = (avgPerDay.pee + avgPerDay.poop + avgPerDay.feed).toFixed(1);
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

// ---------- compact share URL (fixed 11-char entries) ----------
/*
  Compact string format chosen for share URLs:
  - Entry encoded as: <Type><YYMMDDhhmm><optional single-char noteFlagIndex>
  - Type: P (pee), O (poop), B (both), S (feed_start), E (feed_stop)
  - Timestamp: YYMMDDhhmm (10 digits)
  - If a short note is present it will be stored separately: we place full notes in a simple base64 chunk after a separator when necessary.
  Strategy implemented: create two parts:
    1) compactEntries = sequence of 11-char fixed entries (type + 10 digits + optional 0 char)
    2) notesPart (optional) = b64url(JSON array parallel to entries) appended after "#notes=" for safety
  Final share payload placed in query param ?d=COMPACT (URL-safe)
*/

function pad2(n){ return n.toString().padStart(2,'0'); }
function encodeEntryCompact(e){
  // type letter + YYMMDDhhmm
  const d = new Date(e.ts);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return (e.type[0].toUpperCase() || 'X') + yy + mm + dd + hh + min;
}
function decodeEntryCompact(s){
  // s length 11: TYYMMDDhhmm
  const t = s[0];
  const yy = s.slice(1,3);
  const mm = s.slice(3,5);
  const dd = s.slice(5,7);
  const hh = s.slice(7,9);
  const min = s.slice(9,11);
  const year = 2000 + parseInt(yy,10);
  const ts = new Date(year, parseInt(mm,10)-1, parseInt(dd,10), parseInt(hh,10), parseInt(min,10)).getTime();
  let type = 'unknown';
  if(t === 'P') type = 'pee';
  else if(t === 'O') type = 'poop';
  else if(t === 'B') type = 'both';
  else if(t === 'S') type = 'feed_start';
  else if(t === 'E') type = 'feed_stop';
  return {type, ts};
}
function b64urlEncode(u8str){
  return btoa(unescape(encodeURIComponent(u8str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while(str.length %4) str += '=';
  return decodeURIComponent(escape(atob(str)));
}

// create share URL (copies to clipboard)
function createShareURL(){
  const entries = loadLog();
  if(entries.length === 0){ alert('No entries to share'); return; }
  // build compact body and collect notes
  const compactParts = [];
  const notes = [];
  for(const e of entries){
    compactParts.push(encodeEntryCompact(e));
    notes.push(e.note || '');
  }
  const compact = compactParts.join(''); // fixed-size blocks
  // include notes only if any non-empty
  let url = location.origin + location.pathname + '?d=' + encodeURIComponent(compact);
  const anyNotes = notes.some(n => n && n.length > 0);
  if(anyNotes){
    const notesJson = JSON.stringify(notes);
    const notesB64 = b64urlEncode(notesJson);
    url += '&n=' + notesB64;
  }
  // copy to clipboard
  navigator.clipboard?.writeText(url).then(()=> alert('Share URL copied to clipboard'), ()=>{ prompt('Share URL (copy):', url); });
}

// consume share URL on load (if ?d= present)
function tryConsumeShareParam(){
  const params = new URLSearchParams(location.search);
  const d = params.get('d');
  if(!d) return;
  try{
    const compact = decodeURIComponent(d);
    const entries = [];
    for(let i=0;i<compact.length;i+=11){
      const block = compact.slice(i,i+11);
      if(block.length < 11) break;
      const decoded = decodeEntryCompact(block);
      entries.push(decoded);
    }
    // notes
    const n = params.get('n');
    if(n){
      try{
        const notesJson = b64urlDecode(n);
        const notes = JSON.parse(notesJson);
        for(let i=0;i<entries.length && i<notes.length;i++){
          if(notes[i]) entries[i].note = notes[i];
        }
      }catch(e){ console.warn('notes decode failed', e); }
    }
    if(entries.length){
      if(confirm('Import entries from shared link? OK to MERGE, Cancel to REPLACE.')){
        const merged = mergeEntries(loadLog(), entries);
        saveLog(merged);
      } else {
        saveLog(entries);
      }
      // remove query params to avoid repeated imports
      history.replaceState({}, '', location.pathname);
      render();
      alert('Imported shared entries');
    }
  }catch(err){
    console.error('Failed to parse share data', err);
  }
}

// ---------- print PDF for last 24 hours ----------
function generate24hPDF(){
  const MS_DAY = 24 * 60 * 60 * 1000;
  const entries = entriesInWindow(MS_DAY).slice().sort((a,b)=> a.ts - b.ts);
  const w = window.open('', '_blank');
  if(!w) { alert('Popup blocked. Please allow popups to print.'); return; }
  const html = [];
  html.push('<html><head><title>Baby Log — Last 24h</title>');
  html.push('<style>body{font-family: -apple-system, BlinkMacSystemFont, Arial; padding:20px;} h1{font-size:18px;} table{width:100%;border-collapse:collapse;} td,th{padding:8px;border:1px solid #ddd;text-align:left;} .note{color:#333;font-size:12px;}</style>');
  html.push('</head><body>');
  html.push('<h1>Baby Log — Last 24 hours</h1>');
  html.push('<table><thead><tr><th>Time</th><th>Type</th><th>Note</th></tr></thead><tbody>');
  for(const e of entries){
    const label = (e.type==='pee')? 'Pee' : (e.type==='poop')? 'Poop' : (e.type==='both')? 'Both' : (e.type==='feed_start')? 'Feed Start' : (e.type==='feed_stop')? 'Feed Stop' : e.type;
    html.push(`<tr><td>${formatTime(e.ts)}</td><td>${label}</td><td class="note">${(e.note||'')}</td></tr>`);
  }
  html.push('</tbody></table>');
  html.push('</body></html>');
  w.document.write(html.join(''));
  w.document.close();
  // give it a moment to render then call print
  setTimeout(()=> w.print(), 500);
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
      const editBtn = document.createElement('button'); editBtn.className='smallBtn'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', ()=> editEntry(e));
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
  const bothBtn = document.getElementById('both');
  const feedBtn = document.getElementById('feed');
  const exportBtn = document.getElementById('export');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const clearBtn = document.getElementById('clear');
  const addWithNote = document.getElementById('addWithNote');
  const noteInput = document.getElementById('noteInput');
  const shareBtn = document.getElementById('shareBtn');
  const printBtn = document.getElementById('printBtn');

  if(peeBtn) peeBtn.addEventListener('click', ()=> { addEntry('pee'); });
  if(poopBtn) poopBtn.addEventListener('click', ()=> { addEntry('poop'); });
  if(bothBtn) bothBtn.addEventListener('click', ()=> { addEntry('both'); });
  if(feedBtn) feedBtn.addEventListener('click', ()=> { toggleFeed(); });

  if(addWithNote && noteInput){
    addWithNote.addEventListener('click', ()=>{
      const note = noteInput.value.trim();
      const type = prompt('Type for entry: P=pee, O=poop, B=both, S=start feed, E=end feed','P') || 'P';
      const map = {'P':'pee','O':'poop','B':'both','S':'feed_start','E':'feed_stop'};
      const t = map[type.toUpperCase()] || 'pee';
      addEntry(t, note);
      noteInput.value = '';
    });
  }

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
