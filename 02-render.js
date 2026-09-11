function renderAll(){
  const inv=state.sourceType==='invoicePdf';
  $('accountIco').value=state.customerIco||'53690036';
  $('docDate').value=state.date||'';
  $('deliveryDate').value=state.deliveryDate||state.dateTax||'';
  $('headerText').value=state.headerText||defaultHeader(state);
  $('invoiceFields').style.display=inv?'grid':'none';
  if(inv){
    $('invoiceNumber').value=state.invoiceNumber||state.dispatchNo||'';
    $('symVar').value=state.symVar||'';
    $('dateTax').value=state.dateTax||'';
    $('dateDue').value=state.dateDue||'';
    $('contractCode').value=state.contractCode||'';
  }
  const typeLabel=inv?'PDF faktúra Ptáček → prijatá faktúra':state.sourceType==='xml'?'XML výdajka Ptáček → vydaná objednávka':'—';
  $('meta').innerHTML=[['Typ',typeLabel],['Súbor',state.sourceFile],['Číslo',state.invoiceNumber||state.dispatchNo],['Dodávateľ',state.supplier?.company||'—'],['Dátum',state.date],['Položky',state.items.length]].map(([a,b])=>`<div><small>${esc(a)}</small><b>${esc(b||'—')}</b></div>`).join('');
  renderRows();
  refresh();
  if(typeof renderMissingStockCards==='function') renderMissingStockCards();
}

function effectiveUnitPrice(it){ return Number(it.netUnitPrice)||0; }
function stockState(it){
  if(!String(it.vendorCode||'').trim()) return ['none','Chýba kód výrobcu'];
  if(!stockListLoaded) return ['custom','Čakám na zásoby'];
  return stockExists(it)?['ok','Existuje v POHODE']:['custom','Nová karta'];
}
function renderRows(){
  const tbody=$('items');
  tbody.innerHTML=(state.items||[]).map((it,i)=>{
    const [cl,tx]=stockState(it);
    return `<tr data-i="${i}"><td class="sourcecode">${esc(it.lineNo||i+1)}</td><td class="codecol"><input class="vendorCode code" value="${esc(it.vendorCode||'')}"></td><td><span class="tag ${cl}">${esc(tx)}</span></td><td class="desc"><input class="descInput" value="${esc(it.description||'')}" readonly></td><td class="smallcol"><input class="qty num" type="number" min="0" step="any" value="${num(it.quantity)}"></td><td>${esc(it.unit||'ks')}</td><td class="smallcol"><input class="unitPrice num" type="number" min="0" step="any" value="${num(effectiveUnitPrice(it))}"></td><td class="num lineBase">${money((it.quantity||0)*effectiveUnitPrice(it))}</td><td><select class="vat">${VAT_OPTIONS.map(v=>`<option value="${v.key}" ${v.key===it.vatKey?'selected':''}>${v.label}</option>`).join('')}</select></td></tr>`;
  }).join('');
}

function syncControls(){
  state.customerIco=$('accountIco').value.trim();
  state.date=$('docDate').value;
  state.deliveryDate=$('deliveryDate').value;
  state.headerText=$('headerText').value.trim().slice(0,240);
  if(state.sourceType==='invoicePdf'){
    state.invoiceNumber=$('invoiceNumber').value.trim();
    state.dispatchNo=state.invoiceNumber;
    state.symVar=$('symVar').value.trim();
    state.dateTax=$('dateTax').value;
    state.dateDue=$('dateDue').value;
    state.contractCode=$('contractCode').value.trim();
  }
}

function validationProblems(){
  const problems=[];
  const active=(state.items||[]).filter(x=>x.include!==false);
  if(!['xml','invoicePdf'].includes(state.sourceType)) problems.push('Nie je načítaná Ptáček výdajka ani faktúra.');
  if(!/^\d{6,15}$/.test(state.customerIco||'')) problems.push('IČO účtovnej jednotky nie je správne.');
  if(!active.length) problems.push('Doklad neobsahuje položky.');
  if(state.sourceType==='invoicePdf'&&!state.invoiceNumber) problems.push('Chýba číslo dodávateľskej faktúry.');
  active.forEach((x,i)=>{
    const n=x.lineNo||i+1;
    if(!String(x.vendorCode||'').trim()) problems.push(`Položka ${n}: chýba kód výrobcu / Obj.číslo.`);
    if(!(Number(x.quantity)>0)) problems.push(`Položka ${n}: množstvo musí byť väčšie ako 0.`);
    if(!(effectiveUnitPrice(x)>0)) problems.push(`Položka ${n}: chýba nákupná cena.`);
  });
  if(state.sourceType==='invoicePdf' && state.baseTotal>0){
    const base=active.reduce((s,x)=>s+(Number(x.quantity)||0)*effectiveUnitPrice(x),0);
    if(Math.abs(base-state.baseTotal)>0.05) problems.push(`Súčet základov položiek (${money(base)}) nesedí so základom faktúry (${money(state.baseTotal)}).`);
  }
  return problems;
}

function refresh(){
  syncControls();
  let base=0,vat=0;
  (state.items||[]).forEach((it,i)=>{
    if(it.include===false)return;
    const line=(Number(it.quantity)||0)*effectiveUnitPrice(it);
    base+=line; vat+=line*vatRate(it.vatKey)/100;
    const tr=$('items').querySelector(`tr[data-i="${i}"]`);
    if(tr){
      tr.querySelector('.lineBase').textContent=money(line);
      const [cl,tx]=stockState(it); const tag=tr.querySelector('.tag'); tag.className='tag '+cl; tag.textContent=tx;
    }
  });
  $('sumBase').textContent=money(base); $('sumVat').textContent=money(vat); $('sumGross').textContent=money(base+vat);
  const problems=validationProblems();
  const missing=stockListLoaded?(state.items||[]).filter(x=>x.include!==false&&!stockExists(x)&&String(x.vendorCode||'').trim()):[];
  const stockGate=missing.length>0 && !window.stockXmlPreparedForDocument;
  const val=$('validation');
  if(problems.length){ val.className='warning danger'; val.innerHTML='<b>Pred exportom opravte:</b><br>'+problems.map(esc).join('<br>'); }
  else if(stockGate){ val.className='warning'; val.innerHTML=`<b>${missing.length} položiek chýba v zásobách.</b> Najprv stiahnite a importujte XML nových skladových kariet.`; }
  else { val.className='warning success'; val.innerHTML='<b>Doklad je pripravený.</b> Kódy výrobcu, množstvá a ceny sú vyplnené.'; }
  const blocked=problems.length>0||stockGate;
  $('download').disabled=blocked; $('copy').disabled=blocked;
  $('xmlPreview').value=blocked?'':buildXml();
  $('documentTypeInfo').className='warning '+(blocked?'':'success');
  $('documentTypeInfo').innerHTML=state.sourceType==='invoicePdf'?'<b>Výstup:</b> prijatá faktúra POHODA.':state.sourceType==='xml'?'<b>Výstup:</b> vydaná objednávka POHODA.':'Najprv nahrajte doklad.';
  const pw=$('priceWarning'); pw.style.display=state.sourceType?'block':'none';
  if(state.sourceType==='invoicePdf'){ pw.className='warning success'; pw.innerHTML=`PDF faktúra: základ ${money(state.baseTotal)} + DPH ${money(state.vatTotal)} = ${money(state.grossTotal)}. Jednotkovú cenu počítame z riadkového základu ÷ množstvo.`; }
  else if(state.sourceType==='xml'){ pw.className='warning success'; pw.innerHTML='XML výdajka: nákupná jednotková cena = VATBaseAmount ÷ Quantity.'; }
}

function buildXml(){
  if(state.sourceType==='invoicePdf') return buildReceivedInvoiceXml();
  syncControls();
  const id=safeId(state.dispatchNo),pay=$('paymentType').value.trim(),store=$('storeId').value.trim();
  const items=state.items.filter(x=>x.include!==false).map(it=>`\t\t\t<ord:orderItem>\n\t\t\t\t<ord:quantity>${num(it.quantity)}</ord:quantity>\n\t\t\t\t<ord:delivered>0</ord:delivered>\n\t\t\t\t<ord:rateVAT>${it.vatKey}</ord:rateVAT>\n\t\t\t\t<ord:homeCurrency><typ:unitPrice>${num(effectiveUnitPrice(it))}</typ:unitPrice></ord:homeCurrency>\n\t\t\t\t<ord:stockItem>${store?`<typ:store><typ:ids>${esc(store)}</typ:ids></typ:store>`:''}<typ:stockItem><typ:ids>${esc(String(it.vendorCode||'').trim())}</typ:ids></typ:stockItem></ord:stockItem>\n\t\t\t</ord:orderItem>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack id="PT-${esc(id)}" ico="${esc(state.customerIco)}" application="Spektra-Ptacek-v4.0" version="2.0" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:ord="http://www.stormware.cz/schema/version_2/order.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"><dat:dataPackItem id="${esc(id)}" version="2.0"><ord:order version="2.0"><ord:orderHeader><ord:orderType>issuedOrder</ord:orderType><ord:date>${esc(state.date)}</ord:date><ord:dateDelivery>${esc(state.deliveryDate)}</ord:dateDelivery><ord:text>${esc(state.headerText)}</ord:text><ord:partnerIdentity><typ:address><typ:company>${esc(state.supplier.company)}</typ:company><typ:city>${esc(state.supplier.city)}</typ:city><typ:street>${esc(state.supplier.street)}</typ:street><typ:zip>${esc(state.supplier.zip)}</typ:zip><typ:ico>${esc(state.supplier.ico)}</typ:ico><typ:dic>${esc(state.supplier.dic)}</typ:dic></typ:address></ord:partnerIdentity>${pay?`<ord:paymentType><typ:ids>${esc(pay)}</typ:ids></ord:paymentType>`:''}</ord:orderHeader><ord:orderDetail>\n${items}\n</ord:orderDetail><ord:orderSummary><ord:roundingDocument>math2one</ord:roundingDocument></ord:orderSummary></ord:order></dat:dataPackItem></dat:dataPack>`;
}
