function downloadText(name,text,type='application/xml;charset=utf-8'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500); }
async function loadFile(file){
 try{
   const buffer=await file.arrayBuffer();
   if(/\.xlsx$/i.test(file.name)) state=parseExcel(buffer,file.name);
   else if(/\.xml$/i.test(file.name)) state=parsePtacek(decodeXml(buffer),file.name);
   else if(/\.pdf$/i.test(file.name)) state=await parsePdf(buffer,file.name);
   else throw new Error('Podporované sú iba súbory XML, XLSX a PDF.');
   $('loadStatus').className='warning success';
   const label=state.sourceType==='xlsx'?'Excel':state.sourceType==='pdf'?'PDF':'XML';
   $('loadStatus').innerHTML=`Načítaný ${label} doklad <b>${esc(state.dispatchNo)}</b> – ${state.items.length} položiek.${state.sourceType==='pdf'?' PDF neobsahuje skladové kódy; doplňte Kód POHODA alebo použite uložené mapovanie podľa názvu.':''}`;
   $('priceSource').value='net';
   $('priceSource').querySelector('option[value="list"]').disabled=state.sourceType!=='xml';
   renderAll();
 }catch(e){$('loadStatus').className='warning danger';$('loadStatus').textContent=e.message||String(e);}
}

$('file').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));
['dragenter','dragover'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('drag')})); ['dragleave','drop'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('drag')})); $('drop').addEventListener('drop',e=>e.dataTransfer.files[0]&&loadFile(e.dataTransfer.files[0]));
$('items').addEventListener('input',e=>{const tr=e.target.closest('tr');if(!tr)return;const it=state.items[+tr.dataset.i];if(e.target.classList.contains('inc'))it.include=e.target.checked;else if(e.target.classList.contains('pcode'))it.pohodaCode=e.target.value;else if(e.target.classList.contains('qty'))it.quantity=parseN(e.target.value);else if(e.target.classList.contains('unitPrice')){const v=parseN(e.target.value);if($('priceSource').value==='list')it.listUnitPrice=v;else it.netUnitPrice=v;}else if(e.target.classList.contains('vat'))it.vatKey=e.target.value;refresh();});
$('codeSource').addEventListener('change',()=>{state.items.forEach(it=>it.pohodaCode=chooseCode(it,$('codeSource').value));renderRows();refresh();});
$('priceSource').addEventListener('change',()=>{renderRows();refresh();});
['accountIco','docDate','deliveryDate','storeId','paymentType','headerText','linkAddress','ignoreStoreFilter'].forEach(id=>$(id).addEventListener('input',refresh));
$('rememberCodes').addEventListener('click',()=>{state.items.forEach(it=>{if(it.pohodaCode.trim()){if(it.vendorCode)mappings['vendor:'+it.vendorCode]=it.pohodaCode.trim();if(it.ptacekNo)mappings['ptacek:'+it.ptacekNo]=it.pohodaCode.trim();if(it.description)mappings['desc:'+normalizeDescription(it.description)]=it.pohodaCode.trim();}});saveMappings();renderRows();refresh();alert('Mapovanie kódov bolo uložené v tomto prehliadači. Pri ďalšom PDF sa použije aj podľa názvu položky.');});
$('exportMap').addEventListener('click',()=>downloadText('Ptacek_POHODA_mapovanie_kodov.json',JSON.stringify(mappings,null,2),'application/json;charset=utf-8'));
$('importMap').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error();mappings={...mappings,...obj};saveMappings();state.items.forEach(it=>{const m=mappedCode(it);if(m)it.pohodaCode=m;});renderRows();refresh();alert('Mapovanie bolo importované.');}catch{alert('Súbor mapovania nie je platný JSON.')}e.target.value='';});
$('clearMap').addEventListener('click',()=>{if(confirm('Naozaj vymazať všetky zapamätané párovania kódov?')){mappings={};saveMappings();renderRows();refresh();}});
$('download').addEventListener('click',()=>downloadText(`${state.dispatchNo||'Doklad'}_POHODA_vydana_objednavka.xml`,buildXml()));
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(buildXml());$('copy').textContent='Skopírované';setTimeout(()=>$('copy').textContent='Kopírovať XML',1200)}catch{alert('Prehliadač nepovolil kopírovanie. Zobrazte XML a skopírujte ho ručne.')}});
$('toggleXml').addEventListener('click',()=>{const open=$('xmlbox').classList.toggle('open');$('toggleXml').textContent=open?'Skryť XML':'Zobraziť XML';});
state.headerText=defaultHeader(state);renderAll();
