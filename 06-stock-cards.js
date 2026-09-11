'use strict';

let pohodaStockCodes=new Set();
let pohodaStockRows=[];
let stockListLoaded=false;
window.stockXmlPreparedForDocument=false;

function normalizeStockCode(v){return String(v??'').trim().toUpperCase();}
function stockManufacturerCode(it){return String(it?.vendorCode||'').trim();}
function stockExists(it){const code=normalizeStockCode(stockManufacturerCode(it));return !!code&&pohodaStockCodes.has(code);}
function stockVatKey(it){return it.vatKey||vatKey(it.vatRate||23);}
function stockSellingPrice(it){const markup=parseN($('stockMarkup')?.value||30)/100;return (Number(it.netUnitPrice)||0)*(1+markup);}

async function loadPohodaStockExport(file){
  if(typeof XLSX==='undefined')throw new Error('Knižnica XLSX sa nenačítala.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]]; if(!ws)throw new Error('Excel zásob neobsahuje pracovný hárok.');
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''}); if(!rows.length)throw new Error('Excel zásob je prázdny.');
  const codeKey=Object.keys(rows[0]).find(k=>String(k).trim().toLowerCase()==='kód');
  if(!codeKey)throw new Error('V Exceli zásob sa nenašiel stĺpec „Kód“.');
  pohodaStockRows=rows;
  pohodaStockCodes=new Set(rows.map(r=>normalizeStockCode(r[codeKey])).filter(Boolean));
  stockListLoaded=true; window.stockXmlPreparedForDocument=false;
  localStorage.setItem('spektra_stock_snapshot_v2',JSON.stringify({updated:new Date().toISOString().slice(0,10),source:file.name,codes:[...pohodaStockCodes].join('\n')}));
  $('stockLoadStatus').className='warning success';
  $('stockLoadStatus').innerHTML=`Mesačná aktualizácia: <b>${pohodaStockCodes.size}</b> unikátnych skladových kódov zo súboru <b>${esc(file.name)}</b>.`;
  renderRows(); refresh(); renderMissingStockCards();
}

function missingStockItems(){
  return (state.items||[]).filter(it=>it.include!==false&&stockManufacturerCode(it)&&!stockExists(it));
}

function renderMissingStockCards(){
  const box=$('missingStockCards'),btn=$('downloadStockXml'); if(!box||!btn)return;
  if(!stockListLoaded){box.innerHTML='<div class="warning">Načítavam zoznam zásob POHODA…</div>';btn.disabled=true;return;}
  const active=(state.items||[]).filter(it=>it.include!==false);
  const noCode=active.filter(it=>!stockManufacturerCode(it));
  const missing=missingStockItems();
  const existing=active.filter(stockExists).length;

  if(!state.sourceType){box.innerHTML='<div class="warning">Po načítaní dokladu sa tu zobrazia chýbajúce skladové karty.</div>';btn.disabled=true;return;}
  if(noCode.length){box.innerHTML=`<div class="warning danger"><b>${noCode.length} položkám chýba kód výrobcu.</b> Doplňte Obj.číslo v tabuľke položiek. Bez kódu sa nová skladová karta nevytvorí.</div>`;btn.disabled=true;window.stockXmlPreparedForDocument=false;return;}
  if(!missing.length){box.innerHTML=`<div class="warning success"><b>Všetky položky existujú v zásobách.</b> ${existing} z ${active.length} položiek má skladovú kartu. XML nových kariet nie je potrebné.</div>`;btn.disabled=true;window.stockXmlPreparedForDocument=true;refresh();return;}

  box.innerHTML=`<div class="warning"><b>${missing.length} položiek chýba v zásobách.</b> Z týchto položiek sa vytvoria nové skladové karty. Importujte ich do POHODY pred dokladom.</div><div class="table-wrap" style="max-height:430px;margin-top:12px"><table style="min-width:1050px"><thead><tr><th>Vytvoriť</th><th>Kód výrobcu = Kód POHODA</th><th>Názov</th><th>MJ</th><th>Nákup bez DPH</th><th>Predaj bez DPH</th><th>DPH</th></tr></thead><tbody>${missing.map(it=>`<tr class="new-stock-row" data-source-line="${esc(it.lineNo)}"><td><input class="newStockInclude" type="checkbox" checked></td><td><input class="newStockCode code" value="${esc(stockManufacturerCode(it))}" readonly></td><td><input class="newStockName" value="${esc(it.description||'')}"></td><td><input class="newStockUnit" value="${esc(it.unit||'ks')}" style="width:70px"></td><td><input class="newStockPurchase num" type="number" step="any" value="${num(it.netUnitPrice)}"></td><td><input class="newStockSelling num" type="number" step="any" value="${num(stockSellingPrice(it))}"></td><td>${vatRate(stockVatKey(it))} %</td></tr>`).join('')}</tbody></table></div>`;
  btn.disabled=false;
}

function buildMissingStockXml(){
  if(!stockListLoaded)throw new Error('Zoznam zásob ešte nie je načítaný.');
  const rows=[...document.querySelectorAll('.new-stock-row')].filter(r=>r.querySelector('.newStockInclude')?.checked); if(!rows.length)throw new Error('Nie je označená žiadna nová skladová karta.');
  const items=rows.map((r,i)=>{
    const code=r.querySelector('.newStockCode').value.trim();
    const name=r.querySelector('.newStockName').value.trim().slice(0,90);
    const unit=r.querySelector('.newStockUnit').value.trim()||'ks';
    const purchase=parseN(r.querySelector('.newStockPurchase').value);
    const selling=parseN(r.querySelector('.newStockSelling').value);
    if(!code)throw new Error(`Nová karta ${i+1}: chýba kód výrobcu.`);
    if(!name)throw new Error(`Nová karta ${i+1}: chýba názov.`);
    const src=(state.items||[]).find(x=>String(x.lineNo)===String(r.dataset.sourceLine));
    const rate=stockVatKey(src||{});
    return `\t<dat:dataPackItem id="ZAS-${esc(safeId(code))}" version="2.0">\n\t\t<stk:stock version="2.0">\n\t\t\t<stk:stockHeader>\n\t\t\t\t<stk:stockType>card</stk:stockType>\n\t\t\t\t<stk:code>${esc(code)}</stk:code>\n\t\t\t\t<stk:isSales>true</stk:isSales>\n\t\t\t\t<stk:purchasingRateVAT>${rate}</stk:purchasingRateVAT>\n\t\t\t\t<stk:sellingRateVAT>${rate}</stk:sellingRateVAT>\n\t\t\t\t<stk:name>${esc(name)}</stk:name>\n\t\t\t\t<stk:unit>${esc(unit)}</stk:unit>\n\t\t\t\t<stk:purchasingPrice>${num(purchase)}</stk:purchasingPrice>\n\t\t\t\t<stk:sellingPrice>${num(selling)}</stk:sellingPrice>\n\t\t\t</stk:stockHeader>\n\t\t</stk:stock>\n\t</dat:dataPackItem>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack id="NEW-STOCK-${Date.now()}" ico="${esc(state.customerIco||'53690036')}" application="Spektra-Ptacek-v4.2" version="2.0" note="Import novych skladovych kariet z dokladu Ptacek" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:stk="http://www.stormware.cz/schema/version_2/stock.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">\n${items}\n</dat:dataPack>\n`;
}

function downloadMissingStockXml(){
  try{
    const xml=buildMissingStockXml();
    downloadText(`${state.invoiceNumber||state.dispatchNo||'doklad'}_1_NOVE_SKLADOVE_KARTY.xml`,xml);
    window.stockXmlPreparedForDocument=true;
    const status=$('stockLoadStatus'); status.className='warning success'; status.innerHTML+=' <b>XML nových kariet bolo pripravené.</b> Po jeho importe do POHODY môžete stiahnuť XML dokladu.';
    refresh();
  }catch(e){alert(e.message||String(e));}
}

function initStockCardsUi(){
  $('stockListFile')?.addEventListener('change',e=>e.target.files[0]&&loadPohodaStockExport(e.target.files[0]).catch(err=>{ $('stockLoadStatus').className='warning danger'; $('stockLoadStatus').textContent=err.message||String(err); }));
  $('downloadStockXml')?.addEventListener('click',downloadMissingStockXml);
  $('stockMarkup')?.addEventListener('input',()=>{window.stockXmlPreparedForDocument=false;renderMissingStockCards();refresh();});
  $('refreshStockCheck')?.addEventListener('click',()=>{renderRows();renderMissingStockCards();refresh();});
  renderMissingStockCards();
}
document.addEventListener('DOMContentLoaded',initStockCardsUi);
