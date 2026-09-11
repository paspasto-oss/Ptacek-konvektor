'use strict';

async function gunzipBase64ToText(b64){
  let clean=String(b64||'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  clean+='='.repeat((4-clean.length%4)%4);
  const bin=atob(clean),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  if(typeof DecompressionStream==='undefined')throw new Error('Použite aktuálny Chrome alebo Edge.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

function unpackStockCodes(packed){
  const out=[]; let prev='';
  for(const token of String(packed||'').split('|')){
    if(!token)continue;
    const p=token.indexOf(':'); if(p<1)continue;
    const keep=Number(token.slice(0,p)); if(!Number.isFinite(keep)||keep<0)continue;
    prev=prev.slice(0,keep)+token.slice(p+1);
    if(prev)out.push(prev);
  }
  return out;
}

function setStockCodes(codes,updated,label){
  pohodaStockCodes=new Set((codes||[]).map(normalizeStockCode).filter(Boolean));
  pohodaStockRows=[]; stockListLoaded=true; window.stockXmlPreparedForDocument=false;
  const status=$('stockLoadStatus');
  if(status){status.className='warning success';status.innerHTML=`Použitý <b>${esc(label)}</b>: <b>${pohodaStockCodes.size}</b> unikátnych kódov zásob. Aktualizované <b>${esc(updated||'—')}</b>. Párovanie = iba kód výrobcu / Obj.číslo.`;}
  renderRows(); refresh(); renderMissingStockCards();
}

function setStockCodesFromText(text,updated,label){
  setStockCodes(String(text||'').split(/\r?\n/),updated,label);
}

async function loadBuiltInOrLocalStockSnapshot(){
  try{
    const local=JSON.parse(localStorage.getItem('spektra_stock_snapshot_v2')||'null');
    if(local?.codes){setStockCodesFromText(local.codes,local.updated,'mesačný lokálny snapshot');return;}
  }catch{}

  const b64=window.SPEKTRA_STOCK_B64||'';
  if(!b64){
    const status=$('stockLoadStatus');
    if(status){status.className='warning danger';status.textContent='Vstavaný zoznam zásob sa nenašiel.';}
    return;
  }
  try{
    const packed=await gunzipBase64ToText(b64);
    const codes=unpackStockCodes(packed);
    if(!codes.length)throw new Error('Vstavaný zoznam zásob je prázdny.');
    setStockCodes(codes,'2026-09-11','vstavaný snapshot POHODA');
  }catch(e){
    const status=$('stockLoadStatus');
    if(status){status.className='warning danger';status.textContent='Zoznam zásob sa nepodarilo načítať: '+(e.message||String(e));}
  }
}

// Po parsovaní faktúry používame iba kód výrobcu z Obj.číslo.
const _parseReceivedInvoicePdfV4=parseReceivedInvoicePdf;
parseReceivedInvoicePdf=async function(buffer,fileName='faktura.pdf'){
  const data=await _parseReceivedInvoicePdfV4(buffer,fileName);
  (data.items||[]).forEach(it=>it.pohodaCode=String(it.vendorCode||'').trim());
  return data;
};

document.addEventListener('DOMContentLoaded',loadBuiltInOrLocalStockSnapshot);
