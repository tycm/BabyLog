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

/* ---------- COUNTER LOGIC ---------- */
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

  const entries = loadLog();
  const dayBuckets = new Array(7).fill(0).map(()=> ({pee:0,poop:0,feed:0}));
  for(const e of entries){
    const age = now - e.ts;
    if(age > 7 * MS_DAY) continue;
    const dayIndex = Math.floor(age / MS_DAY);
    if(dayIndex < 0 || dayIndex >= 7) continue;
    if(e.type === 'pee') dayBuckets[dayIndex].pee++;
    else if(e.type === 'poop') dayBuckets[dayIndex].poop++;
    else if(e.type === 'both'){ dayBuckets[dayIndex].pee++; dayBuckets[dayIndex].poop++; }
    else if(e.type === 'feed_start') dayBuckets[dayIndex].feed++;
  }

  const totals = dayBuckets.reduce((acc, d) => {
    acc.pee += d.pee; acc.poop += d.poop; acc.feed += d.feed; return acc;
  }, {pee:0,poop:0,feed:0});

  const avgPerDay = {
    pee: +(totals.pee / 7).toFixed(1),
    poop: +(totals.poop / 7).toFixed(1),
    feed: +(totals.feed / 7).toFixed(1)
  };

  const peeEl = document.getElementById('countPee');
  const poopEl = document.getElementById('countPoop');
  const feedEl = document.getElementById('countFeed');
  const avgEl  = document.getElementById('avgWeek');

  if(peeEl) peeEl.textContent = c24.pee;
  if(poopEl) poopEl.textContent = c24.poop;
  if(feedEl) feedEl.textContent = c24.feed;
  if(avgEl) avgEl.textContent = (avgPerDay.pee + avgPerDay.poop + avgPerDay.feed).toFixed(1);
}

/* ---------- MERGE / IMPORT ---------- */
function mergeEntries(oldEntries, newEntries){
  const map = new Map();
  for(const e of oldEntries) map.set(`${e.ts}|${e.type}`, e);
  for(const e of newEntries) map.set(`${e.ts}|${e.type}`, e);
  return Array.from(map.values()).sort((a,b)=> a.ts - b.ts);
}

/* ---------- RENDER ---------- */
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
  const feedBtn = document.getElementById('feed');
  if(feedBtn) feedBtn.textContent = (lastFeedState() === 'stopped') ? 'Start Feed' : 'Stop Feed';
  updateCounters();
}

/* ---------- EVENTS ---------- */
function setupListeners(){
  const peeBtn = document.getElementById('pee');
  const poopBtn = document.getElementById('poop');
  const bothBtn = document.getElementById('both');
  const feedBtn = document.getElementById('feed');
  const exportBtn = document.getElementById('export');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const clearBtn = document.getElementById('clear');

  if(peeBtn) peeBtn.addEventListener('click', ()=> addEntry('pee'));
  if(poopBtn) poopBtn.addEventListener('click', ()=> addEntry('poop'));
  if(bothBtn) bothBtn.addEventListener('click', ()=> addEntry('both'));
  if(feedBtn) feedBtn.addEventListener('click', toggleFeed);

  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    const data = loadLog();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baby-log.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  if(importBtn && importFile){
    importBtn.addEventListener('click', ()=> importFile.click());
    importFile.addEventListener('change', async (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if(!f) return;
      try{
        const text = await f.text();
        const parsed = JSON.parse(text);
        if(!Array.isArray(parsed)) throw new Error('Imported JSON must be an array of entries');
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
  }

  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    if(confirm('Clear entire log?')){ localStorage.removeItem(STORAGE_KEY); render(); }
  });
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  setupListeners();
  render();
  setInterval(render, 15000);
  setInterval(updateCounters, 30000);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW register failed', e));
  }
});
