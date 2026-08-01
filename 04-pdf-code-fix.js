'use strict';

// Verzia 2.5: PDF ponuky POHODA môžu obsahovať položky vo formáte KÓD:NÁZOV.
// Tento parser zachová kód zo začiatku položky a použije ho priamo ako Kód POHODA.
parsePdf = async function parsePdfWithCodes(buffer,fileName='ponuka.pdf'){
  if(typeof pdfjsLib==='undefined') throw new Error('Knižnica na čítanie PDF sa nenačítala. Skontrolujte internetové pripojenie a obnovte stránku.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
  const allLines=[];
  let wholeText='';

  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const textItems=tc.items
      .filter(x=>String(x.str||'').trim())
      .map(x=>({text:String(x.str).trim(),x:x.transform[4],y:x.transform[5]}));

    const groups=[];
    textItems.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(it=>{
      let g=groups.find(r=>Math.abs(r.y-it.y)<2.5);
      if(!g){ g={y:it.y,items:[]}; groups.push(g); }
      g.items.push(it);
    });

    groups.sort((a,b)=>b.y-a.y).forEach(g=>{
      g.items.sort((a,b)=>a.x-b.x);
      const text=g.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
      if(text){ allLines.push({page:p,text}); wholeText+=' '+text; }
    });
  }

  const titleMatch=wholeText.match(/PONUKA\s*č\.\s*([A-Z0-9]+)/i) || fileName.match(/([0-9]{2}NA[0-9]+)/i);
  const dateMatch=wholeText.match(/Dátum\s*zápisu:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const data={
    sourceType:'pdf',sourceFile:fileName,supplier:{...PTACEK},customerIco:'53690036',
    dispatchNo:titleMatch?titleMatch[1]:fileName.replace(/\.pdf$/i,''),supplierOrderNo:'',
    externalNo:'',contractCode:'',contractName:'',
    date:dateMatch?parseDate(dateMatch[1]):today(),deliveryDate:dateMatch?parseDate(dateMatch[1]):today(),items:[]
  };

  let pending=[];
  let lineNo=0;
  const skip=/^(Označenie dodávky|Ekonomický a informačný systém|Strana \d+|Súčet položiek|SPOLU NA ÚHRADU|Dodávateľ:|Odberateľ:|Ponuka č\.|Forma úhrady:|Dátum zápisu:|Platné do:|Konečný príjemca:|Vystavil:|Spektra install|TCH SPACE|IČO:|DIČ:|IČ DPH:|Telefón:|E-mail:|www\.|Realne použité)/i;
  const numericRow=/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(ks|m|bm|bal|sada|hod|kpl)?\s+(\d+[.,]\d{2})\s+(?:(\d+[.,]\d{2})\s+)?(\d+[.,]\d{2})\s+(0|5|19|23)%\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/i;

  for(const row of allLines){
    const t=row.text.trim();
    if(!t || skip.test(t)) continue;

    const m=t.match(numericRow);
    if(m){
      const prefix=m[1].trim();
      let raw=[...pending,prefix].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      pending=[];
      if(!raw || /^(Cena|Zľava|DPH|EUR Celkom)$/i.test(raw)) continue;

      let code='';
      let description=raw;
      const colon=raw.indexOf(':');
      if(colon>0 && colon<=45){
        const candidate=raw.slice(0,colon).trim();
        const rest=raw.slice(colon+1).trim();
        // Kódy môžu byť číselné, alfanumerické, obsahovať medzeru, lomku alebo pomlčku.
        if(candidate && rest && /^[A-Z0-9 ._\/-]+$/i.test(candidate)){
          code=candidate;
          description=rest;
        }
      }

      const qty=parseN(m[2]);
      const unit=m[3]||'ks';
      const unitPrice=parseN(m[4]);
      const base=parseN(m[6]);
      const rate=parseN(m[7]);
      const it={
        lineNo:String(++lineNo),ptacekNo:'',vendorCode:code,description,
        unit,quantity:qty,listUnitPrice:unitPrice,netUnitPrice:unitPrice,
        baseTotal:base||qty*unitPrice,vatRate:rate,vatKey:vatKey(rate),include:true
      };
      it.pohodaCode=code || mappedCode(it);
      data.items.push(it);
      continue;
    }

    // Textový pokračovací riadok názvu položky. Kód:NÁZOV môže byť rozdelený na viac riadkov.
    if(!/^(Množstvo|J\.cena|Zľava|Cena|%DPH|DPH|EUR Celkom)$/i.test(t)){
      pending.push(t);
      if(pending.join(' ').length>700) pending=pending.slice(-8);
    }
  }

  if(!data.items.length) throw new Error('V PDF sa nenašli tabuľkové položky. Použite textový PDF export z POHODY, nie naskenovaný obrázok.');
  data.headerText=defaultHeader(data);
  return data;
};
