'use strict';

const VERSION = '1.0.0';
const DEFAULT_PROFILES = ['Erin', 'Kaliyah'];
const PROFILE_KEY = 'atlas_mtga_profiles_v1';
const ACTIVE_KEY = 'atlas_mtga_active_profile_v1';
const META_PREFIX = 'atlas_mtga_meta_v1_';
const DECK_PREFIX = 'atlas_mtga_decks_v1_';
const WC_PREFIX = 'atlas_mtga_wildcards_v1_';
const DB_NAME = 'AtlasMTGACompanion';
const DB_VERSION = 1;
let db;
let activeProfile = localStorage.getItem(ACTIVE_KEY) || 'Erin';
let activeDeckDetailId = null;
let collectionCache = [];
let changesCache = [];

const momoDeck = `Deck
4 Momo, Friendly Flier (TLA) 29
4 Quantum Riddler (EOE) 72
4 Sage of the Skies (TDM) 22
4 Starfield Shepherd (EOE) 37
1 Empyrean Eagle (M20) 208
3 Empyrean Eagle (FDN) 239
1 Inspiring Overseer (SNC) 18
1 Inspiring Overseer (FDN) 496
4 Daydream (SOS) 9
4 Practiced Offense (SOS) 25
4 Springleaf Drum (LRW) 261
2 Seam Rip (EOE) 34
2 We Say Thee Nay! (MSH) 82
10 Plains (ANB) 115
5 Island (ANB) 113
2 Starting Town (FIN) 289
1 Hallowed Fountain (ECL) 265
1 Azorius Guildgate (RNA) 244
1 Tranquil Cove (M21) 258
1 Temple of Enlightenment (FDN) 698
1 Sharlayan, Nation of Scholars (FIN) 288`;

const bloomguardDeck = `Deck
2 Hinterland Sanctifier
3 Leonin Vanguard
3 Healer's Hawk
2 Emergency Phytomedic
4 Ajani's Pridemate
2 Unflinching Hortimancer
3 Sun-Blessed Healer
1 Vigorbloom Vanguard
2 Cat Collector
2 Dazzling Angel
1 Good-Fortune Unicorn
1 Bloombrute
1 Titanbones, Towering Heart
1 Edgar, Moonlit Sovereign
1 Kwia Vigorbloom
3 Banishing Light
2 Valorous Stance
2 Snakeskin Veil
4 Blossoming Sands
2 Vigorbloom Annex
9 Plains
9 Forest`;

function $(id){ return document.getElementById(id); }
function profileSlug(name){ return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_'); }
function loadProfiles(){
  let p;
  try { p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { p = null; }
  if (!Array.isArray(p) || !p.length) p = [...DEFAULT_PROFILES];
  for (const n of DEFAULT_PROFILES) if (!p.includes(n)) p.push(n);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  return p;
}
function getMeta(profile=activeProfile){ try { return JSON.parse(localStorage.getItem(META_PREFIX+profileSlug(profile)) || '{}'); } catch { return {}; } }
function saveMeta(meta, profile=activeProfile){ localStorage.setItem(META_PREFIX+profileSlug(profile), JSON.stringify(meta)); }
function getWildcards(profile=activeProfile){
  try {
    const v = JSON.parse(localStorage.getItem(WC_PREFIX+profileSlug(profile)) || 'null');
    if (v) return v;
  } catch {}
  if (profile === 'Kaliyah') return {common:19, uncommon:25, rare:5, mythic:3, isSet:true};
  return {common:null, uncommon:null, rare:null, mythic:null, isSet:false};
}
function saveWildcards(w, profile=activeProfile){ localStorage.setItem(WC_PREFIX+profileSlug(profile), JSON.stringify({...w,isSet:true})); }
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : 'd_'+Date.now()+'_'+Math.random().toString(16).slice(2)); }
function getDecks(profile=activeProfile){
  const key = DECK_PREFIX+profileSlug(profile);
  try { const d = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(d)) return d; } catch {}
  let d=[];
  if(profile==='Kaliyah') d=[
    {id:uid(),name:'Azorius Momo Flyers',list:momoDeck,type:'Custom'},
    {id:uid(),name:'Bloomguard Pride',list:bloomguardDeck,type:'Custom'},
    {id:uid(),name:'Cloud',list:'',type:'Final Fantasy precon'},
    {id:uid(),name:'Sephiroth',list:'',type:'Final Fantasy precon'}
  ];
  localStorage.setItem(key,JSON.stringify(d));
  return d;
}
function saveDecks(decks, profile=activeProfile){ localStorage.setItem(DECK_PREFIX+profileSlug(profile), JSON.stringify(decks)); }

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains('collections')) d.createObjectStore('collections',{keyPath:'profile'});
      if(!d.objectStoreNames.contains('changes')) d.createObjectStore('changes',{keyPath:'profile'});
    };
    req.onsuccess=()=>{db=req.result; resolve(db);};
    req.onerror=()=>reject(req.error);
  });
}
function idbPut(store,value){ return new Promise((resolve,reject)=>{ const tx=db.transaction(store,'readwrite'); tx.objectStore(store).put(value); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }
function idbGet(store,profile){ return new Promise((resolve,reject)=>{ const req=db.transaction(store,'readonly').objectStore(store).get(profile); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
function idbDelete(store,profile){ return new Promise((resolve,reject)=>{ const tx=db.transaction(store,'readwrite'); tx.objectStore(store).delete(profile); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }

function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"'){q=false;} else cell+=c; }
    else { if(c==='"') q=true; else if(c===','){row.push(cell);cell='';} else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';} else cell+=c; }
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  if(!rows.length) return [];
  const headers=rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()])));
}
function detectCsvType(rows,name=''){
  const keys=Object.keys(rows[0]||{}).map(x=>x.toLowerCase());
  const low=name.toLowerCase();
  if(low.includes('change') || keys.includes('what changed') || keys.includes('change')) return 'changes';
  if(keys.includes('count') && keys.includes('name')) return 'collection';
  return 'unknown';
}
function numberVal(v){ const n=Number(String(v??'').replace(/[^0-9.-]/g,'')); return Number.isFinite(n)?n:0; }
function normalizeCollection(rows){
  return rows.map(r=>({
    count:numberVal(r.Count ?? r.count),
    name:r.Name ?? r.name ?? '',
    edition:r.Edition ?? r.Set ?? r.edition ?? r.set ?? '',
    collector:r['Collector Number'] ?? r['CollectorNumber'] ?? '',
    condition:r.Condition ?? '',
    language:r.Language ?? '',
    foil:r.Foil ?? '',
    tag:r.Tag ?? ''
  })).filter(r=>r.name);
}
function normalizeChanges(rows){
  return rows.map(r=>({
    card:r.Card ?? r.Name ?? '', set:r.Set ?? r.Edition ?? '', before:numberVal(r.Before), now:numberVal(r.Now),
    change:numberVal(r.Change), what:r['What changed'] ?? r.WhatChanged ?? ''
  })).filter(r=>r.card);
}
function fmtDate(v){ if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function escapeHTML(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2600); }
function show(el){ el.classList.remove('hidden'); el.setAttribute('aria-hidden','false'); }
function hide(el){ el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); }

async function refreshCaches(){
  const c=await idbGet('collections',activeProfile); collectionCache=c?.rows||[];
  const ch=await idbGet('changes',activeProfile); changesCache=ch?.rows||[];
}
function setActiveProfile(name){
  activeProfile=name; localStorage.setItem(ACTIVE_KEY,name); refreshAll().catch(console.error); hide($('profileSheet'));
}
function updateProfileUI(){
  $('profileNameTop').textContent=activeProfile; $('profileInitial').textContent=activeProfile.slice(0,1).toUpperCase();
  $('homeProfileName').textContent=activeProfile; $('collectionTitle').textContent=`${activeProfile}'s Cards`; $('deckTitle').textContent=`${activeProfile}'s Decks`;
  $('settingsProfileBtn').textContent=activeProfile+' ▾'; $('icloudHint').textContent=`iCloud Drive → Atlas MTGA → ${activeProfile}`;
  renderProfileChoices();
}
function renderProfileChoices(){
  $('profileChoices').innerHTML=loadProfiles().map(p=>`<button class="profile-choice ${p===activeProfile?'active':''}" data-profile="${escapeHTML(p)}" type="button">${escapeHTML(p)}</button>`).join('');
  document.querySelectorAll('.profile-choice').forEach(b=>b.onclick=()=>setActiveProfile(b.dataset.profile));
}
function openProfileSheet(){ renderProfileChoices(); show($('profileSheet')); }
function addProfile(){
  const name=prompt('Profile name'); if(!name||!name.trim())return;
  const clean=name.trim(); const p=loadProfiles();
  if(p.some(x=>x.toLowerCase()===clean.toLowerCase())){toast('That profile already exists.');return;}
  p.push(clean); localStorage.setItem(PROFILE_KEY,JSON.stringify(p)); setActiveProfile(clean); toast(`${clean} added.`);
}

function renderHome(){
  const meta=getMeta();
  $('statPrintings').textContent=collectionCache.length?collectionCache.length.toLocaleString():'—';
  $('statCopies').textContent=collectionCache.length?collectionCache.reduce((a,r)=>a+r.count,0).toLocaleString():'—';
  $('statSets').textContent=collectionCache.length?new Set(collectionCache.map(r=>r.edition).filter(Boolean)).size:'—';
  $('statDecks').textContent=getDecks().length;
  $('homeSyncText').textContent=meta.lastImportedAt?`Last refreshed ${fmtDate(meta.lastImportedAt)}`:'No collection imported yet.';
  const w=getWildcards(); for(const [k,id] of [['common','wcCommon'],['uncommon','wcUncommon'],['rare','wcRare'],['mythic','wcMythic']]) $(id).textContent=w[k]===null?'—':w[k];
  if(!changesCache.length) $('homeChanges').innerHTML='<div class="empty-state">Import the latest change report from iCloud to see new cards here.</div>';
  else $('homeChanges').innerHTML=changesCache.slice(0,5).map(renderChangeMini).join('');
  const decks=getDecks(); $('homeDecks').innerHTML=decks.length?decks.slice(0,4).map(d=>`<div class="deck-mini"><span>${escapeHTML(d.name)}</span><span>${escapeHTML(d.type||deckCardCount(d.list)+' cards')}</span></div>`).join(''):'<div class="empty-state">No decks saved yet.</div>';
}
function renderChangeMini(r){ const c=r.change; return `<div class="change-mini"><div class="change-main"><div><div class="change-name">${escapeHTML(r.card)}</div><div class="change-meta">${escapeHTML(r.set)} • ${escapeHTML(r.what||'Collection change')}</div></div><div class="${c>=0?'change-positive':'change-negative'}">${c>0?'+':''}${c||''}</div></div></div>`; }
function renderCollection(){
  const q=$('collectionSearch').value.trim().toLowerCase(); const set=$('setFilter').value;
  const filtered=collectionCache.filter(r=>(!q||r.name.toLowerCase().includes(q)||r.edition.toLowerCase().includes(q))&&(!set||r.edition===set));
  $('collectionSummary').textContent=collectionCache.length?`${filtered.length.toLocaleString()} of ${collectionCache.length.toLocaleString()} printings shown • ${filtered.reduce((a,r)=>a+r.count,0).toLocaleString()} copies`:'No collection loaded. Tap Refresh to import from iCloud Drive.';
  if(!collectionCache.length){$('collectionList').innerHTML='<div class="empty-state">No cards imported for this profile yet.</div>';return;}
  $('collectionList').innerHTML=filtered.slice(0,700).map(r=>`<div class="collection-card"><div><div class="card-name">${escapeHTML(r.name)}</div><div class="card-meta">${escapeHTML(r.edition||'Unknown set')}${r.collector?' • #'+escapeHTML(r.collector):''}${r.foil?' • '+escapeHTML(r.foil):''}</div></div><div class="card-count">${r.count}</div></div>`).join('')+(filtered.length>700?`<div class="empty-state">Showing first 700 matches. Narrow your search to see more.</div>`:'');
}
function rebuildSetFilter(){
  const old=$('setFilter').value; const sets=[...new Set(collectionCache.map(r=>r.edition).filter(Boolean))].sort();
  $('setFilter').innerHTML='<option value="">All sets</option>'+sets.map(s=>`<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join(''); if(sets.includes(old))$('setFilter').value=old;
}
function renderChanges(){
  if(!changesCache.length){$('changesSummary').textContent='No change report loaded.';$('changesList').innerHTML='<div class="empty-state">Import Last_Collection_Changes.csv from the selected profile folder.</div>';return;}
  const gained=changesCache.filter(x=>x.change>0).reduce((a,x)=>a+x.change,0); const lost=changesCache.filter(x=>x.change<0).reduce((a,x)=>a+Math.abs(x.change),0);
  $('changesSummary').textContent=`${changesCache.length} changed printing${changesCache.length===1?'':'s'} • +${gained} copies${lost?` • -${lost} copies`:''}`;
  $('changesList').innerHTML=changesCache.map(r=>`<div class="change-row"><div class="change-main"><div><div class="change-name">${escapeHTML(r.card)}</div><div class="change-meta">${escapeHTML(r.set)} • ${escapeHTML(r.what||'Changed')} • ${r.before} → ${r.now}</div></div><div class="${r.change>=0?'change-positive':'change-negative'}">${r.change>0?'+':''}${r.change}</div></div></div>`).join('');
}
function deckCardCount(list){
  if(!list)return 0; return list.split(/\r?\n/).reduce((sum,line)=>{ const m=line.trim().match(/^(\d+)\s+/); return sum+(m?Number(m[1]):0); },0);
}
function renderDecks(){
  const decks=getDecks();
  $('deckList').innerHTML=decks.length?decks.map(d=>`<div class="deck-card" data-deck-id="${d.id}"><div><div class="deck-name">${escapeHTML(d.name)}</div><div class="deck-meta">${escapeHTML(d.type||'Custom')}${d.list?` • ${deckCardCount(d.list)} cards`:''}</div></div><div class="deck-chevron">›</div></div>`).join(''):'<div class="empty-state">No decks saved. Tap + Add to paste an Arena deck list.</div>';
  document.querySelectorAll('.deck-card').forEach(el=>el.onclick=()=>openDeckDetail(el.dataset.deckId));
}
function openDeckDetail(id){
  const d=getDecks().find(x=>x.id===id); if(!d)return; activeDeckDetailId=id;
  $('deckDetailName').textContent=d.name; $('deckDetailCount').textContent=d.list?`${deckCardCount(d.list)} cards`:d.type||''; $('deckDetailText').textContent=d.list||'No deck list saved yet. Tap Edit to add it.'; show($('deckDetailSheet'));
}
function openDeckEditor(id=null){
  hide($('deckDetailSheet')); const d=id?getDecks().find(x=>x.id===id):null;
  $('deckModalTitle').textContent=d?'Edit Deck':'Add Deck'; $('deckNameInput').value=d?.name||''; $('deckListInput').value=d?.list||''; $('editingDeckId').value=d?.id||''; show($('deckModal'));
}
function saveDeck(){
  const name=$('deckNameInput').value.trim(); if(!name){toast('Give the deck a name.');return;}
  let decks=getDecks(); const id=$('editingDeckId').value;
  if(id){ const i=decks.findIndex(d=>d.id===id); if(i>=0) decks[i]={...decks[i],name,list:$('deckListInput').value.trim(),type:'Custom'}; }
  else decks.unshift({id:uid(),name,list:$('deckListInput').value.trim(),type:'Custom'});
  saveDecks(decks); hide($('deckModal')); renderDecks(); renderHome(); toast('Deck saved.');
}
function deleteDeck(){
  if(!activeDeckDetailId)return; const decks=getDecks(); const d=decks.find(x=>x.id===activeDeckDetailId); if(!d)return;
  if(!confirm(`Delete ${d.name} from Atlas Companion?`))return; saveDecks(decks.filter(x=>x.id!==activeDeckDetailId)); hide($('deckDetailSheet')); activeDeckDetailId=null; renderDecks();renderHome();toast('Deck deleted.');
}
async function copyDeck(){ const d=getDecks().find(x=>x.id===activeDeckDetailId); if(!d?.list){toast('No deck list saved yet.');return;} try{await navigator.clipboard.writeText(d.list);toast('Deck list copied.');}catch{toast('Copy was blocked. Select the list and copy manually.');} }

async function importFiles(files){
  if(!files?.length)return;
  let collectionRows=null, changeRows=null, profileInfo=null; let detectedProfile=activeProfile;
  for(const file of files){
    const text=await file.text();
    if(file.name.toLowerCase().endsWith('.json')){
      try { const j=JSON.parse(text); if(file.name.toLowerCase()==='profile.json'||j.profile||j.Profile){profileInfo=j; detectedProfile=j.profile||j.Profile||detectedProfile;} } catch {}
      continue;
    }
    if(file.name.toLowerCase().endsWith('.csv')){
      const rows=parseCSV(text); const type=detectCsvType(rows,file.name);
      if(type==='collection') collectionRows=normalizeCollection(rows);
      else if(type==='changes') changeRows=normalizeChanges(rows);
    }
  }
  const profiles=loadProfiles();
  if(detectedProfile && !profiles.some(x=>x.toLowerCase()===String(detectedProfile).toLowerCase())){
    profiles.push(String(detectedProfile)); localStorage.setItem(PROFILE_KEY,JSON.stringify(profiles));
  }
  const target=profiles.find(x=>x.toLowerCase()===String(detectedProfile).toLowerCase())||activeProfile;
  if(collectionRows){ await idbPut('collections',{profile:target,rows:collectionRows,importedAt:new Date().toISOString()}); }
  if(changeRows){ await idbPut('changes',{profile:target,rows:changeRows,importedAt:new Date().toISOString()}); }
  const meta=getMeta(target); saveMeta({...meta,...profileInfo,lastImportedAt:new Date().toISOString(),printings:collectionRows?.length??meta.printings,ownedCopies:collectionRows?collectionRows.reduce((a,r)=>a+r.count,0):meta.ownedCopies},target);
  if(target!==activeProfile) setActiveProfile(target); else await refreshAll();
  const parts=[]; if(collectionRows)parts.push(`${collectionRows.length} printings`); if(changeRows)parts.push(`${changeRows.length} changes`); toast(parts.length?`Imported ${parts.join(' and ')} for ${target}.`:'No Atlas collection files recognized.');
}
function openImport(){ $('syncFileInput').value=''; $('syncFileInput').click(); }

function openWildcards(){ const w=getWildcards(); $('editCommon').value=w.common??'';$('editUncommon').value=w.uncommon??'';$('editRare').value=w.rare??'';$('editMythic').value=w.mythic??'';show($('wildcardModal')); }
function saveWildcardEdit(){ saveWildcards({common:numberVal($('editCommon').value),uncommon:numberVal($('editUncommon').value),rare:numberVal($('editRare').value),mythic:numberVal($('editMythic').value)}); hide($('wildcardModal'));renderHome();toast('Wildcards updated.'); }

function navigate(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  window.scrollTo({top:0,behavior:'instant'});
  if(view==='collection')renderCollection(); if(view==='changes')renderChanges(); if(view==='decks')renderDecks();
}
async function exportBackup(){
  const payload={version:VERSION,exportedAt:new Date().toISOString(),profiles:loadProfiles(),activeProfile,data:{}};
  for(const p of loadProfiles()) payload.data[p]={meta:getMeta(p),wildcards:getWildcards(p),decks:getDecks(p),collection:(await idbGet('collections',p))?.rows||[],changes:(await idbGet('changes',p))?.rows||[]};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=`Atlas_MTGA_Companion_Backup_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup created.');
}
async function clearProfile(){
  if(!confirm(`Clear the imported collection, changes, decks, and wildcard counts for ${activeProfile}?`))return;
  await idbDelete('collections',activeProfile); await idbDelete('changes',activeProfile); localStorage.removeItem(META_PREFIX+profileSlug(activeProfile));localStorage.removeItem(DECK_PREFIX+profileSlug(activeProfile));localStorage.removeItem(WC_PREFIX+profileSlug(activeProfile));await refreshAll();toast(`${activeProfile}'s local app data cleared.`);
}
async function refreshAll(){
  updateProfileUI(); await refreshCaches(); rebuildSetFilter(); renderHome(); renderCollection(); renderChanges(); renderDecks();
}

function wireUI(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  $('profileButton').onclick=openProfileSheet;$('settingsProfileBtn').onclick=openProfileSheet;$('sheetAddProfile').onclick=addProfile;$('addProfileBtn').onclick=addProfile;
  document.querySelectorAll('[data-close-sheet]').forEach(b=>b.onclick=()=>hide($(b.dataset.closeSheet)));
  document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=()=>hide($(b.dataset.closeModal)));
  $('homeRefreshBtn').onclick=openImport;$('collectionRefreshBtn').onclick=openImport;$('changesRefreshBtn').onclick=openImport;$('settingsRefreshBtn').onclick=openImport;
  $('syncFileInput').onchange=e=>importFiles([...e.target.files]).catch(err=>{console.error(err);toast('Import failed. Check the selected files.');});
  $('collectionSearch').oninput=renderCollection;$('setFilter').onchange=renderCollection;
  $('editWildcardsBtn').onclick=openWildcards;$('saveWildcardsBtn').onclick=saveWildcardEdit;
  $('addDeckBtn').onclick=()=>openDeckEditor();$('saveDeckBtn').onclick=saveDeck;$('copyDeckBtn').onclick=copyDeck;$('editDeckBtn').onclick=()=>openDeckEditor(activeDeckDetailId);$('deleteDeckBtn').onclick=deleteDeck;
  $('exportBackupBtn').onclick=exportBackup;$('clearProfileBtn').onclick=clearProfile;
  for(const id of ['profileSheet','wildcardModal','deckModal','deckDetailSheet']) $(id).addEventListener('click',e=>{if(e.target===$(id))hide($(id));});
}

(async function init(){
  wireUI(); try{await openDB();await refreshAll();}catch(err){console.error(err);toast('Atlas could not open local storage.');}
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
})();
