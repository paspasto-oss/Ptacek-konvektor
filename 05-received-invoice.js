'use strict';

async function extractPdfRows(buffer){
  if(typeof pdfjsLib==='undefined') throw new Error('Knižnica PDF sa nenačítala.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
  const pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p), tc=await page.getTextContent();
    const words=tc.items.filter(x=>String(x.str||'').trim()).map(x=>({text:String(x.str).trim(),x:x.transform[4],y:x.transform[5]}));
    const rows=[];
    words.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(w=>{let r=rows.find(z=>Math.abs(z.y-w.y)<2.4);if(!r){r={y:w.y,words:[]};rows.push(r)}r.words.push(w)});
    rows.sort((a,b)=>b.y-a.y).forEach(r=>r.words.sort((a,b)=>a.x-b.x));
    pages.push(rows);
  }
  return pages;
}
const rowText=r=>r.words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
const colText=(r,a,b)=>r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();

async function parseReceivedInvoicePdf(buffer,fileName='faktura.pdf'){
  const pages=await extractPdfRows(buffer); const text=pages.flat().map(rowText).join(' ');
  if(!/(FAKTÚRA|FAKTURA).*(DAŇOVÝ|DANOVY)|Variabilný\s+symbol/i.test(text)) { const e=new Error('NOT_INVOICE'); e.code='NOT_INVOICE'; throw e; }
  const find=(re)=>{const m=text.match(re);return m?m[1].trim():''};
  const invoiceNo=find(/\b(F\d{8,})\b/i)||find(/(?:FAKTÚRA|FAKTURA)[^A-Z0-9]+([A-Z0-9-]+)/i);
  const symVar=find(/Variabilný\s+symbol\s+(\d+)/i)||invoiceNo.replace(/\D/g,'');
  const dateDue=find(/Dátum\s+splatnosti\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const dateTax=find(/DUZP\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const dateIssue=find(/Dátum\s+vystavenia\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const contract=find(/Zákazka\s*:\s*([A-Z0-9_-]+)/i);
  const baseTotal=parseN(find(/Čiastka\s+bez\s+DPH\s*:\s*([\d\s,.]+)/i));
  const vatTotal=parseN(find(/Čiastka\s+DPH\s*:\s*([\d\s,.]+)/i));
  const grossTotal=parseN(find(/Čiastka\s+celkom\s*:\s*([\d\s,.]+)/i));
  const data={sourceType:'invoicePdf',sourceFile:fileName,customerIco:'53690036',dispatchNo:invoiceNo||fileName.replace(/\.pdf$/i,''),invoiceNumber:invoiceNo,symVar,date:parseDate(dateIssue),dateTax:parseDate(dateTax||dateIssue),dateDue:parseDate(dateDue),deliveryDate:parseDate(dateTax||dateIssue),contractCode:contract,baseTotal,vatTotal,grossTotal,
    supplier:{company:'Ptáček - veľkoobchod, a.s.',street:'Vajnorská 140',city:'BRATISLAVA',zip:'831 04',ico:'35814586',dic:'SK2020202294',country:'SK'},supplierOrderNo:'',externalNo:'',headerText:`Prijatá faktúra Ptáček ${invoiceNo}`.trim(),items:[]};
  let lineNo=0;
  for(const rows of pages){
    for(let i=0;i<rows.length;i++){
      const r=rows[i], qty=parseN(colText(r,288,335)), unitPriceShown=parseN(colText(r,405,470)), lineTotal=parseN(colText(r,500,570));
      if(!(qty>0)||!(unitPriceShown>0)||!(lineTotal>0)) continue;
      const desc1=colText(r,25,190); if(!desc1||/Množstvo|Cena za MJ/i.test(desc1)) continue;
      const sourceCode=colText(r,190,288); let description=desc1, longCode='', unit='', rate=23;
      for(let j=i+1;j<Math.min(rows.length,i+4);j++){
        const rr=rows[j], nextQty=parseN(colText(rr,288,335)); if(nextQty>0) break;
        const left=colText(rr,25,190); if(left&&!/Dodací list/i.test(left)) description+=' '+left;
        const c=colText(rr,190,288); if(c&&/^\d{10,}$/.test(c.replace(/\s/g,''))) longCode=c.replace(/\s/g,'');
        const u=colText(rr,288,330); if(/^(KS|M|BM|BAL|SADA|HOD|KPL)$/i.test(u)) unit=u;
        const rv=parseN(colText(rr,410,470)); if([0,5,19,23].includes(Math.round(rv))) rate=Math.round(rv);
      }
      const effective=lineTotal/qty;
      const it={lineNo:String(++lineNo),ptacekNo:longCode,vendorCode:sourceCode,description:description.replace(/\s+/g,' ').trim(),unit:unit||'ks',quantity:qty,listUnitPrice:unitPriceShown,netUnitPrice:effective,baseTotal:lineTotal,vatRate:rate,vatKey:vatKey(rate),include:true};
      it.pohodaCode=mappedCode(it)||sourceCode||longCode||''; data.items.push(it);
    }
  }
  if(!data.items.length) throw new Error('Faktúra bola rozpoznaná, ale nepodarilo sa načítať položky.');
  return data;
}

function buildReceivedInvoiceXml(){
  syncControls(); const id=safeId(state.invoiceNumber||state.dispatchNo); const pay=$('paymentType').value.trim(); const store=$('storeId').value.trim(); const ignore=$('ignoreStoreFilter').checked?' applyUserSettingsFilterOnTheStore="false"':'';
  const items=state.items.filter(x=>x.include).map(it=>{
    const text=esc((it.description||'Položka').slice(0,90)); const stock=it.pohodaCode.trim();
    return `\t\t\t<inv:invoiceItem>\n\t\t\t\t<inv:text>${text}</inv:text>\n\t\t\t\t<inv:quantity>${num(it.quantity)}</inv:quantity>\n\t\t\t\t<inv:unit>${esc(it.unit||'ks')}</inv:unit>\n\t\t\t\t<inv:payVAT>true</inv:payVAT>\n\t\t\t\t<inv:rateVAT>${it.vatKey}</inv:rateVAT>\n\t\t\t\t<inv:homeCurrency>\n\t\t\t\t\t<typ:unitPrice>${num(it.netUnitPrice)}</typ:unitPrice>\n\t\t\t\t</inv:homeCurrency>${stock?`\n\t\t\t\t<inv:stockItem${ignore}>\n${store?`\t\t\t\t\t<typ:store><typ:ids>${esc(store)}</typ:ids></typ:store>\n`:''}\t\t\t\t\t<typ:stockItem><typ:ids>${esc(stock)}</typ:ids></typ:stockItem>\n\t\t\t\t</inv:stockItem>`:''}\n\t\t\t</inv:invoiceItem>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack id="PF-${esc(id)}" ico="${esc(state.customerIco)}" application="Spektra-Ptacek-v3.0" version="2.0" note="Import prijatej faktury" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">\n\t<dat:dataPackItem id="${esc(id)}" version="2.0">\n\t\t<inv:invoice version="2.0">\n\t\t\t<inv:invoiceHeader>\n\t\t\t\t<inv:invoiceType>receivedInvoice</inv:invoiceType>\n\t\t\t\t<inv:symVar>${esc(state.symVar||'')}</inv:symVar>\n\t\t\t\t<inv:originalDocument>${esc(state.invoiceNumber||state.dispatchNo)}</inv:originalDocument>\n\t\t\t\t<inv:date>${esc(state.date)}</inv:date>\n\t\t\t\t<inv:dateAccounting>${esc(state.dateTax||state.date)}</inv:dateAccounting>\n\t\t\t\t<inv:dateTax>${esc(state.dateTax||state.date)}</inv:dateTax>\n\t\t\t\t<inv:dateDue>${esc(state.dateDue||state.date)}</inv:dateDue>\n${state.contractCode?`\t\t\t\t<inv:contract><typ:ids>${esc(state.contractCode)}</typ:ids></inv:contract>\n`:''}\t\t\t\t<inv:partnerIdentity><typ:address><typ:company>${esc(state.supplier.company)}</typ:company><typ:city>${esc(state.supplier.city)}</typ:city><typ:street>${esc(state.supplier.street)}</typ:street><typ:zip>${esc(state.supplier.zip)}</typ:zip><typ:ico>${esc(state.supplier.ico)}</typ:ico><typ:dic>${esc(state.supplier.dic)}</typ:dic></typ:address></inv:partnerIdentity>\n\t\t\t\t<inv:text>${esc(state.headerText)}</inv:text>\n${pay?`\t\t\t\t<inv:paymentType><typ:ids>${esc(pay)}</typ:ids></inv:paymentType>\n`:''}\t\t\t</inv:invoiceHeader>\n\t\t\t<inv:invoiceDetail>\n${items}\n\t\t\t</inv:invoiceDetail>\n\t\t\t<inv:invoiceSummary><inv:roundingDocument>none</inv:roundingDocument></inv:invoiceSummary>\n\t\t</inv:invoice>\n\t</dat:dataPackItem>\n</dat:dataPack>\n`;
}
