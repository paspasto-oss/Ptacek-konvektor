'use strict';

async function extractPdfRows(buffer){
  if(typeof pdfjsLib==='undefined') throw new Error('Knižnica PDF sa nenačítala.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
  const pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p), tc=await page.getTextContent();
    const viewport=page.getViewport({scale:1});
    const words=tc.items.filter(x=>String(x.str||'').trim()).map(x=>({text:String(x.str).trim(),x:x.transform[4],y:x.transform[5],w:x.width||0}));
    const rows=[];
    words.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(w=>{
      let r=rows.find(z=>Math.abs(z.y-w.y)<3.2);
      if(!r){r={y:w.y,words:[]};rows.push(r)}
      r.words.push(w);
    });
    rows.sort((a,b)=>b.y-a.y).forEach(r=>r.words.sort((a,b)=>a.x-b.x));
    pages.push({rows,width:viewport.width,height:viewport.height});
  }
  return pages;
}
const rowText=r=>r.words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
const wordsIn=(r,a,b)=>r.words.filter(w=>w.x>=a&&w.x<b);
const textIn=(r,a,b)=>wordsIn(r,a,b).map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
const moneyNums=s=>[...String(s||'').matchAll(/-?\d[\d\s]*(?:[.,]\d{1,4})?/g)].map(m=>parseN(m[0])).filter(n=>Number.isFinite(n));
const firstPositive=s=>moneyNums(s).find(n=>n>0)||0;
const lastPositive=s=>{const a=moneyNums(s).filter(n=>n>0);return a.length?a[a.length-1]:0;};

function detectInvoiceColumns(page){
  const W=page.width||595;
  let qtyX=W*.48, priceX=W*.69, totalX=W*.86, codeX=W*.32;
  for(const r of page.rows){
    for(const w of r.words){
      const t=w.text.toLowerCase();
      if(t.includes('množstvo')||t.includes('mnozstvo')) qtyX=w.x;
      if(t==='obj.číslo'||t==='obj.cislo'||t==='obj.číslo' || t.includes('obj.čís')) codeX=w.x;
    }
    const rt=rowText(r).toLowerCase();
    if(rt.includes('cena za mj')){
      const candidates=r.words.filter(w=>/cena|mj/i.test(w.text));
      if(candidates.length) priceX=Math.min(...candidates.map(w=>w.x));
    }
    if(rt.includes('cena celkom')){
      const candidates=r.words.filter(w=>/cena|celkom/i.test(w.text));
      if(candidates.length) totalX=Math.min(...candidates.map(w=>w.x));
    }
  }
  // Ochrana pred zlou detekciou pri rozbitej hlavičke.
  if(!(codeX<qtyX)) codeX=W*.32;
  if(!(qtyX<priceX)) priceX=W*.69;
  if(!(priceX<totalX)) totalX=W*.86;
  return {W,codeX,qtyX,priceX,totalX};
}

function cleanInvoiceCode(s){
  s=String(s||'').replace(/\s+/g,' ').trim();
  const m=s.match(/([A-Z0-9][A-Z0-9._\/-]{2,})/i);
  return m?m[1]:'';
}

async function parseReceivedInvoicePdf(buffer,fileName='faktura.pdf'){
  const pages=await extractPdfRows(buffer);
  const text=pages.flatMap(p=>p.rows).map(rowText).join(' ');
  if(!/(FAKTÚRA|FAKTURA).*(DAŇOVÝ|DANOVY)|Variabilný\s+symbol/i.test(text)) { const e=new Error('NOT_INVOICE'); e.code='NOT_INVOICE'; throw e; }

  const find=(re)=>{const m=text.match(re);return m?m[1].trim():''};
  const invoiceNo=find(/\b(F\d{8,})\b/i)||find(/(?:FAKTÚRA|FAKTURA)[^A-Z0-9]+([A-Z0-9-]+)/i)||((fileName.match(/F\d{8,}/i)||[])[0]||'');
  const symVar=find(/Variabilný\s+symbol\s+(\d+)/i)||invoiceNo.replace(/\D/g,'');
  const dateDue=find(/Dátum\s+splatnosti\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  const dateTax=find(/DUZP\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  const dateIssue=find(/Dátum\s+vystavenia\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  const contract=find(/Zákazka\s*:\s*([A-Z0-9_-]+)/i);
  const baseTotal=parseN(find(/Čiastka\s+bez\s+DPH\s*:?\s*([\d\s,.]+)/i));
  const vatTotal=parseN(find(/Čiastka\s+DPH\s*:?\s*([\d\s,.]+)/i));
  const grossTotal=parseN(find(/Čiastka\s+celkom\s*:?\s*([\d\s,.]+)/i));

  const data={sourceType:'invoicePdf',sourceFile:fileName,customerIco:'53690036',dispatchNo:invoiceNo||fileName.replace(/\.pdf$/i,''),invoiceNumber:invoiceNo,symVar,date:parseDate(dateIssue),dateTax:parseDate(dateTax||dateIssue),dateDue:parseDate(dateDue),deliveryDate:parseDate(dateTax||dateIssue),contractCode:contract,baseTotal,vatTotal,grossTotal,
    supplier:{company:'Ptáček - veľkoobchod, a.s.',street:'Vajnorská 140',city:'BRATISLAVA',zip:'831 04',ico:'35814586',dic:'SK2020202294',country:'SK'},supplierOrderNo:'',externalNo:'',headerText:`Prijatá faktúra Ptáček ${invoiceNo}`.trim(),items:[]};

  let lineNo=0;
  for(const page of pages){
    const c=detectInvoiceColumns(page);
    const rows=page.rows;
    for(let i=0;i<rows.length;i++){
      const r=rows[i], rt=rowText(r);
      if(/Množstvo|Cena za MJ|Cena celkom|Rekapitulácia DPH|Dodací list|Čiastka celkom|Na úhradu/i.test(rt)) continue;

      // Dynamické zóny podľa skutočnej hlavičky faktúry.
      let qty=firstPositive(textIn(r,c.qtyX-18,c.priceX-8));
      let unitPriceShown=lastPositive(textIn(r,c.priceX-18,c.totalX-8));
      let lineTotal=lastPositive(textIn(r,c.totalX-18,c.W+20));

      // Záložný režim: ak PDF rozseká čísla do susedných stĺpcov, vezmeme numerické tokeny vpravo od kódu.
      if(!(qty>0&&unitPriceShown>0&&lineTotal>0)){
        const right=r.words.filter(w=>w.x>=c.qtyX-30).map(w=>w.text).join(' ');
        const nums=moneyNums(right).filter(n=>n>0);
        if(nums.length>=3){
          qty=qty||nums[0];
          unitPriceShown=unitPriceShown||nums[nums.length-2];
          lineTotal=lineTotal||nums[nums.length-1];
        }
      }
      if(!(qty>0)||!(unitPriceShown>0)||!(lineTotal>0)) continue;

      const desc1=textIn(r,10,c.codeX-6).trim();
      const sourceArea=textIn(r,c.codeX-8,c.qtyX-12);
      if(!desc1 || /Položka|Sadzba DPH|Obj\.číslo|Kód tovaru/i.test(desc1)) continue;

      let sourceCode=cleanInvoiceCode(sourceArea), description=desc1, longCode='', unit='', rate=23;
      for(let j=i+1;j<Math.min(rows.length,i+5);j++){
        const rr=rows[j], rrt=rowText(rr);
        if(/Dodací list|Rekapitulácia DPH|Čiastka celkom/i.test(rrt)) break;
        const nextQty=firstPositive(textIn(rr,c.qtyX-18,c.priceX-8));
        const nextPrice=lastPositive(textIn(rr,c.priceX-18,c.totalX-8));
        if(nextQty>0&&nextPrice>0) break;

        const left=textIn(rr,10,c.codeX-6);
        if(left&&!/Dodací list|Položka|Upozornenie/i.test(left)) description+=' '+left;
        const codeArea=textIn(rr,c.codeX-8,c.qtyX-12).replace(/\s/g,'');
        if(/^\d{10,}$/.test(codeArea)) longCode=codeArea;
        else if(!sourceCode && codeArea) sourceCode=cleanInvoiceCode(codeArea);

        const mid=textIn(rr,c.qtyX-18,c.priceX-8);
        const um=mid.match(/\b(KS|M|BM|BAL|SADA|HOD|KPL)\b/i); if(um) unit=um[1];
        const whole=rowText(rr); const rm=whole.match(/\b(0|5|19|23)\s*%/); if(rm) rate=Number(rm[1]);
      }

      // Základ riadku na faktúre je autoritatívny; tým sa zachová aj zaokrúhlenie Ptáčka.
      const effective=lineTotal/qty;
      const it={lineNo:String(++lineNo),ptacekNo:longCode,vendorCode:sourceCode,description:description.replace(/\s+/g,' ').trim(),unit:unit||'ks',quantity:qty,listUnitPrice:unitPriceShown,netUnitPrice:effective,baseTotal:lineTotal,vatRate:rate,vatKey:vatKey(rate),include:true};
      it.pohodaCode=mappedCode(it)||sourceCode||longCode||'';
      data.items.push(it);
    }
  }

  // Odstráni prípadné duplicitné zachytenie rovnakého riadku PDF.
  const seen=new Set();
  data.items=data.items.filter(it=>{
    const k=[it.vendorCode,it.ptacekNo,it.description,it.quantity,it.baseTotal].join('|');
    if(seen.has(k)) return false; seen.add(k); return true;
  });
  data.items.forEach((it,i)=>it.lineNo=String(i+1));

  if(!data.items.length) throw new Error('Faktúra bola rozpoznaná, ale nepodarilo sa načítať položky. Skúste Ctrl+F5. Ak problém zostane, nahrajte konkrétny PDF súbor do chatu a upravíme jeho rozloženie.');
  return data;
}

function buildReceivedInvoiceXml(){
  syncControls(); const id=safeId(state.invoiceNumber||state.dispatchNo); const pay=$('paymentType').value.trim(); const store=$('storeId').value.trim(); const ignore=$('ignoreStoreFilter').checked?' applyUserSettingsFilterOnTheStore="false"':'';
  const items=state.items.filter(x=>x.include).map(it=>{
    const text=esc((it.description||'Položka').slice(0,90)); const stock=it.pohodaCode.trim();
    return `\t\t\t<inv:invoiceItem>\n\t\t\t\t<inv:text>${text}</inv:text>\n\t\t\t\t<inv:quantity>${num(it.quantity)}</inv:quantity>\n\t\t\t\t<inv:unit>${esc(it.unit||'ks')}</inv:unit>\n\t\t\t\t<inv:payVAT>true</inv:payVAT>\n\t\t\t\t<inv:rateVAT>${it.vatKey}</inv:rateVAT>\n\t\t\t\t<inv:homeCurrency>\n\t\t\t\t\t<typ:unitPrice>${num(it.netUnitPrice)}</typ:unitPrice>\n\t\t\t\t</inv:homeCurrency>${stock?`\n\t\t\t\t<inv:stockItem${ignore}>\n${store?`\t\t\t\t\t<typ:store><typ:ids>${esc(store)}</typ:ids></typ:store>\n`:''}\t\t\t\t\t<typ:stockItem><typ:ids>${esc(stock)}</typ:ids></typ:stockItem>\n\t\t\t\t</inv:stockItem>`:''}\n\t\t\t</inv:invoiceItem>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack id="PF-${esc(id)}" ico="${esc(state.customerIco)}" application="Spektra-Ptacek-v3.1" version="2.0" note="Import prijatej faktury" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">\n\t<dat:dataPackItem id="${esc(id)}" version="2.0">\n\t\t<inv:invoice version="2.0">\n\t\t\t<inv:invoiceHeader>\n\t\t\t\t<inv:invoiceType>receivedInvoice</inv:invoiceType>\n\t\t\t\t<inv:symVar>${esc(state.symVar||'')}</inv:symVar>\n\t\t\t\t<inv:originalDocument>${esc(state.invoiceNumber||state.dispatchNo)}</inv:originalDocument>\n\t\t\t\t<inv:date>${esc(state.date)}</inv:date>\n\t\t\t\t<inv:dateAccounting>${esc(state.dateTax||state.date)}</inv:dateAccounting>\n\t\t\t\t<inv:dateTax>${esc(state.dateTax||state.date)}</inv:dateTax>\n\t\t\t\t<inv:dateDue>${esc(state.dateDue||state.date)}</inv:dateDue>\n${state.contractCode?`\t\t\t\t<inv:contract><typ:ids>${esc(state.contractCode)}</typ:ids></inv:contract>\n`:''}\t\t\t\t<inv:partnerIdentity><typ:address><typ:company>${esc(state.supplier.company)}</typ:company><typ:city>${esc(state.supplier.city)}</typ:city><typ:street>${esc(state.supplier.street)}</typ:street><typ:zip>${esc(state.supplier.zip)}</typ:zip><typ:ico>${esc(state.supplier.ico)}</typ:ico><typ:dic>${esc(state.supplier.dic)}</typ:dic></typ:address></inv:partnerIdentity>\n\t\t\t\t<inv:text>${esc(state.headerText)}</inv:text>\n${pay?`\t\t\t\t<inv:paymentType><typ:ids>${esc(pay)}</typ:ids></inv:paymentType>\n`:''}\t\t\t</inv:invoiceHeader>\n\t\t\t<inv:invoiceDetail>\n${items}\n\t\t\t</inv:invoiceDetail>\n\t\t\t<inv:invoiceSummary><inv:roundingDocument>none</inv:roundingDocument></inv:invoiceSummary>\n\t\t</inv:invoice>\n\t</dat:dataPackItem>\n</dat:dataPack>\n`;
}
