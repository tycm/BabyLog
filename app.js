/* app.js
   Simple baby log using localStorage for JSON storage.
   Entry format: {type: "pee"|"poop"|"both"|"feed_start"|"feed_stop", ts: 1234567890}
*/

const STORAGE_KEY = 'baby_log_entries_v1';

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
function addEntry(type){
  const entries = loadLog();
  const entry = {type, ts: Date.now()};
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
function toggleFeed(){
  const state = lastFeedState();
  if(state === 'stopped'){
    addEntry('feed_start');
  } else {
    addEntry('feed_stop');
  }
}
function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}
function render(){
  const list = document.getElementById('logList');
  list.innerHTML = '';
  const entries = loadLog().slice().reverse();
  if(entries.length === 0){
    list.innerHTML = '<li class="logItem">No entries yet</li>';
  } else {
    for(const e of entries){
      const li = document.createElement('li');
      li.className = 'logItem';
      const label = (()=>{
        switch(e.type){
          case 'pee': return 'Pee';
          case 'poop': return 'Poop';
          case 'both': return 'Both';
          case 'feed_start': return 'Feeding — Start';
          case 'feed_stop': return 'Feeding — Stop';
          default: return e.type;
        }
      })();
      li.innerHTML = `<div><strong>${label}</strong><div class="meta">${formatTime(e.ts)}</div></div><div>${relativeLabel(e.ts)}</div>`;
      list.appendChild(li);
    }
  }
  // update feed button label
  const feedBtn = document.getElementById('feed');
  if(feedBtn) feedBtn.textContent = (lastFeedState() === 'stopped') ? 'Start Feed' : 'Stop Feed';
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

// merge two entry arrays, avoiding exact duplicates (by ts+type)
// returns chronological array (oldest first)
function mergeEntries(oldEntries, newEntries){
  const map = new Map();
  for(const e of oldEntries) map.set(`${e.ts}|${e.type}`, e);
  for(const e of newEntries) map.set(`${e.ts}|${e.type}`, e);
  return Array.from(map.values()).sort((a,b)=> a.ts - b.ts);
}

// Event listeners
document.getElementById('pee').addEventListener('click', ()=> addEntry('pee'));
document.getElementById('poop').addEventListener('click', ()=> addEntry('poop'));
document.getElementById('both').addEventListener('click', ()=> addEntry('both'));
document.getElementById('feed').addEventListener('click', toggleFeed);

// Export
document.getElementById('export').addEventListener('click', ()=>{
  const data = loadLog();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'baby-log.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Import UI: wired to #importBtn and #importFile in index.html
document.getElementById('importBtn').addEventListener('click', ()=>{
  const input = document.getElementById('importFile');
  if(input) input.click();
});

document.getElementById('importFile').addEventListener('change', async (ev)=>{
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = ''; // reset so same file can be reselected
  if(!f) return;
  try{
    const text = await f.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) throw new Error('Imported JSON must be an array of entries');
    // basic validation of entries: must have type (string) and ts (number)
    const valid = parsed.every(p => p && typeof p.type === 'string' && typeof p.ts === 'number');
    if(!valid) throw new Error('Entries must be objects with "type" (string) and "ts" (number)');
    const existing = loadLog();
    const choice = confirm('Press OK to MERGE imported entries into existing log. Press Cancel to REPLACE the log with imported entries.');
    const result = choice ? mergeEntries(existing, parsed) : parsed.slice().sort((a,b)=>a.ts-b.ts);
    saveLog(result);
    render();
    alert('Import successful');
  } catch(err){
    console.error(err);
    alert('Import failed: ' + (err.message || err));
  }
});

// Clear
document.getElementById('clear').addEventListener('click', ()=>{
  if(confirm('Clear entire log?')){ localStorage.removeItem(STORAGE_KEY); render(); }
});

// initial render
render();

// update relative times every 15s
setInterval(render, 15000);

// register service worker for offline and installability
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW register failed', e));
}