'use strict';

// Verzia 2.6: PDF parser používa fyzické stĺpce tlačovej zostavy POHODA.
// Tak sa zalomený názov predchádzajúcej položky nepripojí ku kódu nasledujúcej položky.
parsePdf = async function parsePdfByColumns(buffer,fileName='ponuka.pdf'){
  if(typeof pdfjsLib==='undefined') throw new Error('Knižnica na čítanie PDF sa nenačítala. Skontrolujte internetové pripojenie a obnovte stránku.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
  const pages=[];
  let wholeText='';

  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const words=tc.items
      .filter(x=>String(x.str||'').trim())
      .map(x=>({text:String(x.str).trim(),x:Number(x.transform[4]),y:Number(x.transform[5])}));

    const rows=[];
    words.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(word=>{
      let row=rows.find(r=>Math.abs(r.y-word.y)<2.4);
      if(!row){ row={y:word.y,items:[]}; rows.push(row); }
      row.items.push(word);
    });
    rows.sort((a,b)=>b.y-a.y).forEach(r=>r.items.sort((a,b)=>a.x-b.x));
    pages.push(rows);
    wholeText+=' '+rows.map(r=>r.items.map(i=>i.text).join(' ')).join(' ');
  }

  const titleMatch=wholeText.match(/PONUKA\s*č\.\s*([A-Z0-9]+)/i) || fileName.match(/([0-9]{2}NA[0-9]+)/i);
  const dateMatch=wholeText.match(/Dátum\s*zápisu:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const data={
    sourceType:'pdf',sourceFile:fileName,supplier:{...PTACEK},customerIco:'53690036',
    dispatchNo:titleMatch?titleMatch[1]:fileName.replace(/\.pdf$/i,''),supplierOrderNo:'',
    externalNo:'',contractCode:'',contractName:'',
    date:dateMatch?parseDate(dateMatch[1]):today(),deliveryDate:dateMatch?parseDate(dateMatch[1]):today(),items:[]
  };

  const textIn=(items,min,max)=>items.filter(i=>i.x>=min&&i.x<max).map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
  const firstNumber=(items,min,max)=>{
    const s=textIn(items,min,max).replace(/\s/g,'');
    const m=s.match(/-?\d+(?:[.,]\d+)?/);
    return m?parseN(m[0]):0;
  };
  const extractCodeAndName=raw=>{
    raw=String(raw||'').replace(/\s+/g,' ').trim();
    const colon=raw.indexOf(':');
    if(colon>0&&colon<=45){
      const code=raw.slice(0,colon).trim();
      const name=raw.slice(colon+1).trim();
      if(code&&name&&/^[A-Z0-9 ._\/-]+$/i.test(code)) return {code,name};
    }
    return {code:'',name:raw};
  };

  let lineNo=0;
  let current=null;
  let inTable=false;

  for(const rows of pages){
    inTable=false;
    current=null;
    for(const row of rows){
      const full=row.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
      const left=textIn(row.items,0,190);

      if(/Označenie\s+dodávky/i.test(full)){ inTable=true; current=null; continue; }
      if(!inTable) continue;
      if(/^(Ekonomický a informačný systém|Súčet položiek|SPOLU NA ÚHRADU|Vystavil:|Strana \d+)/i.test(full)){ current=null; continue; }

      // Pevné stĺpce tlačovej zostavy POHODA:
      // názov 42–190, množstvo 205–240, MJ 220–255, J.cena 270–330,
      // Cena 360–405, %DPH 400–455, DPH 455–505, Celkom 505+.
      const qty=firstNumber(row.items,205,240);
      const unit=textIn(row.items,220,260).match(/\b(ks|m|bm|bal|sada|hod|kpl)\b/i)?.[1]||'';
      const unitPrice=firstNumber(row.items,270,335);
      const base=firstNumber(row.items,355,405);
      const vatText=textIn(row.items,400,455);
      const vatMatch=vatText.match(/(0|5|19|23)\s*%/);
      const rate=vatMatch?parseN(vatMatch[1]):0;
      const vatAmount=firstNumber(row.items,455,505);
      const total=firstNumber(row.items,505,580);
      const isItemStart=!!left && qty>0 && unitPrice>=0 && !!vatMatch && total>=0;

      if(isItemStart){
        const parsed=extractCodeAndName(left);
        const it={
          lineNo:String(++lineNo),ptacekNo:'',vendorCode:parsed.code,
          description:parsed.name,unit:unit||'ks',quantity:qty,
          listUnitPrice:unitPrice,netUnitPrice:unitPrice,
          baseTotal:base||qty*unitPrice,vatRate:rate,vatKey:vatKey(rate),include:true
        };
        it.pohodaCode=parsed.code||mappedCode(it);
        data.items.push(it);
        current=it;
        continue;
      }

      // Pokračovanie názvu patrí vždy k poslednej rozpoznanej položke na rovnakej strane.
      // Číta sa iba ľavý stĺpec, takže k názvu sa nepripoja množstvá ani ďalšie ceny.
      if(current&&left&&!/^(Označenie dodávky|Množstvo|J\.cena|Zľava|Cena|%DPH|DPH|EUR Celkom)$/i.test(left)){
        current.description=(current.description+' '+left).replace(/\s+/g,' ').trim();
      }
    }
  }

  if(!data.items.length) throw new Error('V PDF sa nenašli tabuľkové položky. Použite textový PDF export z POHODY, nie naskenovaný obrázok.');
  data.headerText=defaultHeader(data);
  return data;
};
