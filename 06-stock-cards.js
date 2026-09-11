'use strict';

let pohodaStockCodes = new Set();
let pohodaStockRows = [];
let stockListLoaded = false;

function normalizeStockCode(v){ return String(v??'').trim().toUpperCase(); }
function stockCandidateCode(it){ return String(it.pohodaCode||it.vendorCode||it.ptacekNo||'').trim(); }
function stockExists(it){
  const candidates=[it.pohodaCode,it.vendorCode,it.ptacekNo].map(normalizeStockCode).filter(Boolean);
  return candidates.some(c=>pohodaStockCodes.has(c));
}
function stockVatKey(it){ return it.vatKey || vatKey(it.vatRate||23); }
function stockSellingPrice(it){
  const markup=parseN($('stockMarkup')?.value||30)/100;
  return (Number(it.netUnitPrice)||0)*(1+markup);
}

async function loadPohodaStockExport(file){
  if(typeof XLSX==='undefined') throw new Error('Knižnica XLSX sa nenačítala.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws) throw new Error('Excel zásob neobsahuje pracovný hárok.');
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  if(!rows.length) throw new Error('Excel zásob je prázdny.');
  const hasCode=Object.keys(rows[0]).some(k=>String(k).trim().toLowerCase()==='kód');
  if(!hasCode) throw new Error('V Exceli zásob sa nenašiel stĺpec „Kód“. Použite export Zásoby z POHODY.');
  pohodaStockRows=rows;
  pohodaStockCodes=new Set(rows.map(r=>normalizeStockCode(r['Kód'])).filter(Boolean));
  stockListLoaded=true;
  const stores=[...new Set(rows.map(r=>String(r['Sklad']||'').trim()).filter(Boolean))];
  if(stores.length===1 && $('newStockStorage') && !$('newStockStorage').value) $('newStockStorage').value=stores[0];
  $('stockLoadStatus').className='warning success';
  $('stockLoadStatus').innerHTML=`Načítaných <b>${rows.length}</b> skladových kariet z POHODY. Sklady: <b>${esc(stores.join(', ')||'nezistené')}</b>.`;
  renderMissingStockCards();
}

function renderMissingStockCards(){
  const box=$('missingStockCards');
  const btn=$('downloadStockXml');
  if(!box||!btn) return;
  if(!stockListLoaded){
    box.innerHTML='<div class="warning">Najprv nahrajte aktuálny export <b>Zásoby P.xlsx</b> z POHODY.</div>';
    btn.disabled=true; return;
  }
  const source=(state.items||[]).filter(it=>it.include!==false);
  const missing=source.filter(it=>!stockExists(it));
  const existing=source.length-missing.length;
  if(!missing.length){
    box.innerHTML=`<div class="warning success"><b>Všetky položky existujú.</b> ${existing} z ${source.length} položiek faktúry má zodpovedajúcu skladovú kartu.</div>`;
    btn.disabled=true; return;
  }
  box.innerHTML=`<div class="warning" style="margin-top:0"><b>${missing.length} chýbajúcich kariet</b> z ${source.length} položiek; ${existing} už existuje.</div>
  <div class="table-wrap" style="max-height:430px;margin-top:12px"><table style="min-width:1100px"><thead><tr><th>Vytvoriť</th><th>Kód novej karty</th><th>Názov</th><th>MJ</th><th>Nákup bez DPH</th><th>Predaj bez DPH</th><th>DPH</th></tr></thead><tbody>${missing.map((it,idx)=>{
    const code=stockCandidateCode(it); const sell=stockSellingPrice(it);
    return `<tr class="new-stock-row" data-source-line="${esc(it.lineNo)}"><td><input class="newStockInclude" type="checkbox" checked></td><td><input class="newStockCode code" value="${esc(code)}"></td><td><input class="newStockName" value="${esc(it.description||'')}"></td><td><input class="newStockUnit" value="${esc(it.unit||'ks')}" style="width:70px"></td><td><input class="newStockPurchase num" type="number" step="any" value="${num(it.netUnitPrice)}"></td><td><input class="newStockSelling num" type="number" step="any" value="${num(sell)}"></td><td>${vatRate(stockVatKey(it))} %</td></tr>`;
  }).join('')}</tbody></table></div>`;
  btn.disabled=false;
}

function buildMissingStockXml(){
  if(!stockListLoaded) throw new Error('Najprv nahrajte export zásob z POHODY.');
  const storage=String($('newStockStorage')?.value||'').trim();
  if(!storage) throw new Error('Vyplňte cieľový sklad pre nové karty.');
  const rows=[...document.querySelectorAll('.new-stock-row')].filter(r=>r.querySelector('.newStockInclude')?.checked);
  if(!rows.length) throw new Error('Nie je označená žiadna nová skladová karta.');
  const items=rows.map((r,i)=>{
    const code=r.querySelector('.newStockCode').value.trim();
    const name=r.querySelector('.newStockName').value.trim().slice(0,90);
    const unit=r.querySelector('.newStockUnit').value.trim()||'ks';
    const purchase=parseN(r.querySelector('.newStockPurchase').value);
    const selling=parseN(r.querySelector('.newStockSelling').value);
    if(!code) throw new Error(`Nová karta ${i+1}: chýba kód.`);
    if(!name) throw new Error(`Nová karta ${i+1}: chýba názov.`);
    const src=(state.items||[]).find(x=>String(x.lineNo)===String(r.dataset.sourceLine));
    const rate=stockVatKey(src||{});
    return `\t<dat:dataPackItem id="ZAS-${esc(safeId(code))}" version="2.0">\n\t\t<stk:stock version="2.0">\n\t\t\t<stk:stockHeader>\n\t\t\t\t<stk:stockType>card</stk:stockType>\n\t\t\t\t<stk:code>${esc(code)}</stk:code>\n\t\t\t\t<stk:isSales>true</stk:isSales>\n\t\t\t\t<stk:purchasingRateVAT>${rate}</stk:purchasingRateVAT>\n\t\t\t\t<stk:sellingRateVAT>${rate}</stk:sellingRateVAT>\n\t\t\t\t<stk:name>${esc(name)}</stk:name>\n\t\t\t\t<stk:unit>${esc(unit)}</stk:unit>\n\t\t\t\t<stk:storage><typ:ids>${esc(storage)}</typ:ids></stk:storage>\n\t\t\t\t<stk:purchasingPrice>${num(purchase)}</stk:purchasingPrice>\n\t\t\t\t<stk:sellingPrice>${num(selling)}</stk:sellingPrice>\n\t\t\t</stk:stockHeader>\n\t\t</stk:stock>\n\t</dat:dataPackItem>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack id="NEW-STOCK-${Date.now()}" ico="${esc(state.customerIco||'53690036')}" application="Spektra-Doklady-v3.2" version="2.0" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:stk="http://www.stormware.cz/schema/version_2/stock.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">\n${items}\n</dat:dataPack>\n`;
}

function downloadMissingStockXml(){
  try{
    const xml=buildMissingStockXml();
    downloadText(`${state.invoiceNumber||state.dispatchNo||'doklad'}_NOVE_SKLADOVE_KARTY.xml`,xml);
  }catch(e){ alert(e.message||String(e)); }
}

function initStockCardsUi(){
  $('stockListFile')?.addEventListener('change',e=>e.target.files[0]&&loadPohodaStockExport(e.target.files[0]).catch(err=>{ $('stockLoadStatus').className='warning danger'; $('stockLoadStatus').textContent=err.message||String(err); }));
  $('downloadStockXml')?.addEventListener('click',downloadMissingStockXml);
  $('stockMarkup')?.addEventListener('input',renderMissingStockCards);
  $('refreshStockCheck')?.addEventListener('click',renderMissingStockCards);
  const tbody=$('items');
  if(tbody){ new MutationObserver(()=>{ if(stockListLoaded) renderMissingStockCards(); }).observe(tbody,{childList:true,subtree:false}); }
  renderMissingStockCards();
}

document.addEventListener('DOMContentLoaded',initStockCardsUi);
