'use strict';

// v3.5 – vstavaný mesačný snapshot zásob + párovanie iba podľa kódu výrobcu.
// Dlhý interný kód Ptáčka (ptacekNo) sa zámerne nepoužíva na párovanie ani tvorbu karty.

function manufacturerMappedCode(it){
  const vendor=String(it?.vendorCode||'').trim();
  if(vendor && mappings['vendor:'+vendor]) return mappings['vendor:'+vendor];
  if(it?.description){
    const d=mappings['desc:'+normalizeDescription(it.description)];
    if(d) return d;
  }
  return '';
}

mappedCode = manufacturerMappedCode;

const _parseReceivedInvoicePdfManufacturer = parseReceivedInvoicePdf;
parseReceivedInvoicePdf = async function(buffer,fileName='faktura.pdf'){
  const data=await _parseReceivedInvoicePdfManufacturer(buffer,fileName);
  (data.items||[]).forEach(it=>{
    const manufacturer=String(it.vendorCode||'').trim();
    it.pohodaCode=manufacturerMappedCode(it)||manufacturer||'';
  });
  return data;
};

stockCandidateCode = function(it){
  return String(it?.pohodaCode||it?.vendorCode||codeFromDescription(it?.description)||'').trim();
};
stockExists = function(it){
  const candidates=[it?.pohodaCode,it?.vendorCode].map(normalizeStockCode).filter(Boolean);
  return candidates.some(c=>pohodaStockCodes.has(c));
};

function normalizeBase64(input){
  let s=String(input||'')
    .replace(/^data:[^,]+,/, '')
    .replace(/\s+/g,'')
    .replace(/-/g,'+')
    .replace(/_/g,'/')
    .replace(/[^A-Za-z0-9+/=]/g,'');
  // odstráň prípadné nesprávne padding znaky a doplň správny padding
  s=s.replace(/=+$/,'');
  const rem=s.length%4;
  if(rem) s+='='.repeat(4-rem);
  return s;
}

async function gunzipBase64ToText(b64){
  const clean=normalizeBase64(b64);
  if(!clean) throw new Error('Vstavaný zoznam zásob je prázdny.');
  let bin;
  try{ bin=atob(clean); }
  catch(e){ throw new Error('Vstavaný zoznam zásob má neplatné kódovanie. Obnovte stránku Ctrl+F5.'); }
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  if(typeof DecompressionStream==='undefined') throw new Error('Prehliadač nepodporuje načítanie vstavaného zoznamu zásob. Použite aktuálny Chrome alebo Edge.');
  try{
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }catch(e){
    throw new Error('Vstavaný zoznam zásob sa nepodarilo rozbaliť. Obnovte stránku Ctrl+F5.');
  }
}

function setStockCodesFromText(text,updated,source,label){
  const codes=String(text||'').split(/\r?\n/).map(normalizeStockCode).filter(Boolean);
  pohodaStockCodes=new Set(codes);
  pohodaStockRows=[];
  stockListLoaded=true;
  const status=$('stockLoadStatus');
  if(status){
    status.className='warning success';
    status.innerHTML=`Použitý <b>${esc(label)}</b>: <b>${pohodaStockCodes.size}</b> unikátnych kódov zásob. Aktualizované: <b>${esc(updated||'—')}</b>. Párovanie Ptáček = iba <b>kód výrobcu (Obj.číslo)</b>; dlhý Ptáček kód sa ignoruje.`;
  }
  renderMissingStockCards();
}

async function loadBuiltInOrLocalStockSnapshot(){
  // Mesačná aktualizácia nahraná používateľom má prednosť pred vstavaným snapshotom.
  try{
    const local=JSON.parse(localStorage.getItem('spektra_stock_snapshot_v1')||'null');
    if(local?.codes){
      setStockCodesFromText(local.codes,local.updated,local.source||'lokálny export','mesačný lokálny snapshot');
      return;
    }
  }catch{}

  const snap=window.SPEKTRA_STOCK_SNAPSHOT;
  if(!snap?.gzipBase64){
    const status=$('stockLoadStatus');
    if(status){status.className='warning danger';status.textContent='Vstavaný snapshot zásob sa nenašiel. Nahrajte Zásoby.xlsx.';}
    return;
  }
  try{
    const text=await gunzipBase64ToText(snap.gzipBase64);
    setStockCodesFromText(text,snap.updated,snap.source||'Zásoby.xlsx','vstavaný snapshot POHODA');
  }catch(e){
    const status=$('stockLoadStatus');
    if(status){status.className='warning danger';status.textContent=e.message||String(e);}
  }
}

const _loadPohodaStockExportMonthly = loadPohodaStockExport;
loadPohodaStockExport = async function(file){
  await _loadPohodaStockExportMonthly(file);
  const updated=new Date().toISOString().slice(0,10);
  const codes=[...pohodaStockCodes].sort().join('\n');
  try{
    localStorage.setItem('spektra_stock_snapshot_v1',JSON.stringify({updated,source:file.name,codes}));
  }catch(e){
    console.warn('Zoznam zásob sa nepodarilo uložiť do localStorage:',e);
  }
  const status=$('stockLoadStatus');
  if(status){
    status.className='warning success';
    status.innerHTML=`Mesačná aktualizácia uložená: <b>${pohodaStockCodes.size}</b> unikátnych kódov, súbor <b>${esc(file.name)}</b>, dátum <b>${updated}</b>. Pri ďalšom otvorení sa načíta automaticky. Dlhý Ptáček kód sa ignoruje.`;
  }
  renderMissingStockCards();
};

document.addEventListener('DOMContentLoaded',loadBuiltInOrLocalStockSnapshot);
