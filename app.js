/*
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
  feedBtn.textContent = (lastFeedState() === 'stopped') ? 'Start Feed' : 'Stop Feed';
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

document.getElementById('pee').addEventListener('click', ()=> addEntry('pee'));
document.getElementById('poop').addEventListener('click', ()=> addEntry('poop'));
document.getElementById('both').addEventListener('click', ()=> addEntry('both'));
document.getElementById('feed').addEventListener('click', toggleFeed);
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