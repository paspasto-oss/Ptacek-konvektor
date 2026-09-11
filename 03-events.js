function downloadText(name,text,type='application/xml;charset=utf-8'){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

async function loadFile(file){
  try{
    window.stockXmlPreparedForDocument=false;
    const buffer=await file.arrayBuffer();
    if(/\.xml$/i.test(file.name)){
      state=parsePtacek(decodeXml(buffer),file.name);
      // striktne iba kód výrobcu
      state.items.forEach(it=>it.pohodaCode=String(it.vendorCode||'').trim());
    }else if(/\.pdf$/i.test(file.name)){
      state=await parseReceivedInvoicePdf(buffer,file.name);
      state.items.forEach(it=>it.pohodaCode=String(it.vendorCode||'').trim());
    }else throw new Error('Podporované sú iba Ptáček XML výdajky a PDF faktúry.');

    $('loadStatus').className='warning success';
    $('loadStatus').innerHTML=`Načítaný <b>${state.sourceType==='invoicePdf'?'PDF faktúra':'XML výdajka'}</b> ${esc(state.invoiceNumber||state.dispatchNo)} – ${state.items.length} položiek.`;
    renderAll();
  }catch(e){
    $('loadStatus').className='warning danger';
    $('loadStatus').textContent=e.message||String(e);
  }
}

$('file').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));
['dragenter','dragover'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('drag')}));
['dragleave','drop'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('drag')}));
$('drop').addEventListener('drop',e=>e.dataTransfer.files[0]&&loadFile(e.dataTransfer.files[0]));

$('items').addEventListener('input',e=>{
  const tr=e.target.closest('tr'); if(!tr)return;
  const it=state.items[+tr.dataset.i];
  if(e.target.classList.contains('vendorCode')){ it.vendorCode=e.target.value.trim(); it.pohodaCode=it.vendorCode; window.stockXmlPreparedForDocument=false; }
  else if(e.target.classList.contains('qty')) it.quantity=parseN(e.target.value);
  else if(e.target.classList.contains('unitPrice')) it.netUnitPrice=parseN(e.target.value);
  else if(e.target.classList.contains('vat')) it.vatKey=e.target.value;
  refresh();
  if(typeof renderMissingStockCards==='function') renderMissingStockCards();
});

['accountIco','docDate','deliveryDate','storeId','paymentType','headerText','invoiceNumber','symVar','dateTax','dateDue','contractCode'].forEach(id=>{
  const e=$(id); if(e)e.addEventListener('input',refresh);
});

$('download').addEventListener('click',()=>{
  const inv=state.sourceType==='invoicePdf';
  downloadText(`${state.invoiceNumber||state.dispatchNo||'Doklad'}_POHODA_${inv?'prijata_faktura':'vydana_objednavka'}.xml`,buildXml());
});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(buildXml());$('copy').textContent='Skopírované';setTimeout(()=>$('copy').textContent='Kopírovať XML',1200)}catch{alert('Kopírovanie nebolo povolené.')}});
$('toggleXml').addEventListener('click',()=>{const open=$('xmlbox').classList.toggle('open');$('toggleXml').textContent=open?'Skryť XML':'Zobraziť XML'});

state.headerText=defaultHeader(state); renderAll();
