'use strict';
const PTACEK = {company:'Ptáček - veľkoobchod, a.s.',street:'Vajnorská 140',city:'BRATISLAVA',zip:'831 04',ico:'35814586',dic:'SK2020202294',country:'SK'};
const EMPTY = {sourceType:'',sourceFile:'',supplier:{...PTACEK},customerIco:'53690036',dispatchNo:'',supplierOrderNo:'',externalNo:'',contractCode:'',contractName:'',date:'',deliveryDate:'',headerText:'',items:[]};
const VAT_OPTIONS = [{key:'high',rate:23,label:'23 % – high'},{key:'low',rate:19,label:'19 % – low'},{key:'third',rate:5,label:'5 % – third'},{key:'none',rate:0,label:'0 % – none'}];
let state = structuredClone(EMPTY);
let mappings = loadMappings();

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('sk-SK',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const num = n => { let s=(Number(n)||0).toFixed(6).replace(/0+$/,'').replace(/\.$/,''); return s || '0'; };
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const safeId = s => String(s||'DOKLAD').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,35) || 'DOKLAD';
const getText = (node,name) => { const e=node.getElementsByTagName(name)[0]; return e ? (e.textContent||'').trim() : ''; };
const parseN = s => Number(String(s??'').replace(/\s/g,'').replace('%','').replace(',','.')) || 0;
const normalizeDescription = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').replace(/[^a-z0-9/"x+., -]/g,'').trim().slice(0,180);
function today(){ return new Date().toISOString().slice(0,10); }
function parseDate(s){ const m=String(s||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/); if(!m) return today(); let y=+m[3]; if(y<100)y+=y<70?2000:1900; return `${y.toString().padStart(4,'0')}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function vatKey(rate){ rate=Math.round(Number(rate)||0); return rate===23?'high':rate===19?'low':rate===5?'third':rate===0?'none':'high'; }
function vatRate(key){ return VAT_OPTIONS.find(x=>x.key===key)?.rate ?? 23; }
function defaultHeader(d){ if(d.sourceType==='xlsx') return `Príloha k ponuke ${d.dispatchNo||''}`.trim().slice(0,240); if(d.sourceType==='pdf') return `Ponuka POHODA ${d.dispatchNo||''}`.trim().slice(0,240); const p=[`Výdajka Ptáček ${d.dispatchNo||''}`.trim()]; if(d.supplierOrderNo)p.push(`objednávka Ptáček ${d.supplierOrderNo}`); if(d.externalNo)p.push(`referencia ${d.externalNo}`); const c=[d.contractCode,d.contractName].filter(Boolean).join(' / '); if(c)p.push(c); return p.join(' | ').slice(0,240); }
function loadMappings(){ try{return JSON.parse(localStorage.getItem('ptacekPohodaMappings')||'{}')||{}}catch{return {}} }
function saveMappings(){ localStorage.setItem('ptacekPohodaMappings',JSON.stringify(mappings)); }
function mappedCode(it){ return mappings['vendor:'+it.vendorCode] || mappings['ptacek:'+it.ptacekNo] || mappings['desc:'+normalizeDescription(it.description)] || ''; }
function chooseCode(it,source){ if(source==='ptacek')return it.ptacekNo||it.vendorCode; if(source==='saved')return mappedCode(it)||it.vendorCode||it.ptacekNo; return it.vendorCode||it.ptacekNo||mappedCode(it); }
function mappingStatus(it){ const m=mappedCode(it); if(!it.pohodaCode)return ['none','Chýba']; if(m&&m===it.pohodaCode)return ['ok','Zapamätané']; if(it.pohodaCode===(it.vendorCode||it.ptacekNo))return ['ok','Zdrojový']; return ['custom','Vlastný']; }

function decodeXml(buffer){ const b=new Uint8Array(buffer); if(b[0]===0xFF&&b[1]===0xFE)return new TextDecoder('utf-16le').decode(b); if(b[0]===0xFE&&b[1]===0xFF)return new TextDecoder('utf-16be').decode(b); if(b.length>4&&b[1]===0&&b[3]===0)return new TextDecoder('utf-16le').decode(b); if(b.length>4&&b[0]===0&&b[2]===0)return new TextDecoder('utf-16be').decode(b); return new TextDecoder('utf-8').decode(b); }
function parsePtacek(xmlText,fileName='výdajka.xml'){
 const doc=new DOMParser().parseFromString(xmlText,'application/xml'); const pe=doc.querySelector('parsererror'); if(pe)throw new Error('XML sa nepodarilo načítať: '+pe.textContent.slice(0,180));
 const root=doc.documentElement; if(root.tagName!=='Sales_Shipment')throw new Error('Súbor nemá očakávaný koreň Sales_Shipment.');
 const c=root.getElementsByTagName('Company_Information')[0], h=root.getElementsByTagName('Sales_Header')[0]; if(!c||!h)throw new Error('Chýba Company_Information alebo Sales_Header.');
 const data={sourceType:'xml',sourceFile:fileName,supplier:{company:getText(c,'Name'),street:[getText(c,'Address'),getText(c,'Address2')].filter(Boolean).join(' '),city:getText(c,'City'),zip:getText(c,'PostCode'),ico:getText(c,'RegistrationNo'),dic:getText(c,'VATRegistrationNo'),country:getText(c,'CountryCode')},customerIco:getText(h,'RegistrationNo')||getText(h,'Sell-toCustomerNo'),dispatchNo:getText(h,'No'),supplierOrderNo:getText(h,'OrderNo'),externalNo:getText(h,'ExternalDocumentNo'),contractCode:getText(h,'KodZakazky'),contractName:getText(h,'NazevZakazky'),date:parseDate(getText(h,'DocumentDate')||getText(h,'PostingDate')),deliveryDate:parseDate(getText(h,'ShipmentDate')||getText(h,'DocumentDate')),items:[]};
 [...root.getElementsByTagName('Sales_Line')].forEach(line=>{ const q=parseN(getText(line,'Quantity')), base=parseN(getText(line,'VATBaseAmount')), rate=parseN(getText(line,'VATRate')); const it={lineNo:getText(line,'LineNo'),ptacekNo:getText(line,'No'),vendorCode:getText(line,'VendorItemNo'),description:getText(line,'Description').replace(/\s+/g,' ').trim(),unit:getText(line,'UnitOfMeasure'),quantity:q,listUnitPrice:parseN(getText(line,'UnitPrice')),netUnitPrice:q?base/q:0,baseTotal:base,vatRate:rate,vatKey:vatKey(rate),include:true}; it.pohodaCode=mappedCode(it)||chooseCode(it,$('codeSource').value); data.items.push(it); });
 if(!data.items.length)throw new Error('Vo výdajke sa nenašli žiadne Sales_Line.'); data.headerText=defaultHeader(data); return data;
}

function parseExcel(buffer,fileName='priloha.xlsx'){
 if(typeof XLSX==='undefined') throw new Error('Knižnica na čítanie XLSX sa nenačítala. Skontrolujte internetové pripojenie a obnovte stránku.');
 const book=XLSX.read(buffer,{type:'array',cellDates:true}); const ws=book.Sheets[book.SheetNames[0]]; if(!ws) throw new Error('Excel neobsahuje pracovný hárok.');
 const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1'); const value=(r,c)=>{ const cell=ws[XLSX.utils.encode_cell({r,c})]; return cell ? (cell.v ?? cell.w ?? '') : ''; };
 let title=''; for(let r=range.s.r;r<=Math.min(range.e.r,12);r++){ for(let c=range.s.c;c<=range.e.c;c++){ const s=String(value(r,c)??'').trim(); if(/PRÍLOHA\s+K\s+PONUKE/i.test(s)){ title=s; break; } } if(title) break; }
 const numMatch=title.match(/č\.\s*([^\s]+)/i) || fileName.match(/č\._([^\.]+)/i); const docNo=numMatch ? numMatch[1].replace(/_/g,' ') : fileName.replace(/\.xlsx$/i,'');
 const data={sourceType:'xlsx',sourceFile:fileName,supplier:{...PTACEK},customerIco:'53690036',dispatchNo:docNo,supplierOrderNo:'',externalNo:'',contractCode:'',contractName:'',date:today(),deliveryDate:today(),items:[]};
 for(let r=range.s.r;r<=range.e.r;r++){
   let raw=''; let rawCol=-1; for(let c=range.s.c;c<=Math.min(range.e.c,12);c++){ const s=String(value(r,c)??'').trim(); if(/^\s*[^:]+\s*:\s*.+/.test(s) && !/Označenie\s+dodávky/i.test(s)){ raw=s; rawCol=c; break; } }
   if(!raw) continue; const m=raw.match(/^\s*([^:]+?)\s*:\s*(.+)$/); if(!m) continue; const code=m[1].trim(), description=m[2].replace(/\s+/g,' ').trim(); if(!code || !description) continue;
   let qty=parseN(value(r,7)), unit=String(value(r,9)??'').trim(), unitPrice=parseN(value(r,10)), base=parseN(value(r,16)), rateRaw=value(r,17), vatAmount=parseN(value(r,19));
   if(!(qty>0)){ for(let c=rawCol+1;c<=Math.min(range.e.c,12);c++){ const n=parseN(value(r,c)); if(n>0){ qty=n; break; } } }
   if(!unit){ for(let c=rawCol+1;c<=Math.min(range.e.c,12);c++){ const s=String(value(r,c)??'').trim(); if(/^(ks|m|bm|bal|sada|hod|kpl)$/i.test(s)){ unit=s; break; } } }
   if(!(unitPrice>0)){ const candidates=[]; for(let c=rawCol+1;c<=Math.min(range.e.c,15);c++){ const n=parseN(value(r,c)); if(n>0)candidates.push(n); } if(candidates.length>1) unitPrice=candidates[1]; }
   if(!(qty>0) || !(unitPrice>0)) continue; if(!(base>0)) base=qty*unitPrice; let rate=parseN(rateRaw); if(rate>0 && rate<1) rate*=100; if(!rate && base>0 && vatAmount>=0) rate=Math.round(vatAmount/base*100); if(![0,5,19,23].includes(Math.round(rate))) rate=23;
   const it={lineNo:String(r+1),ptacekNo:'',vendorCode:code,description,unit:unit||'ks',quantity:qty,listUnitPrice:unitPrice,netUnitPrice:unitPrice,baseTotal:base,vatRate:rate,vatKey:vatKey(rate),include:true}; it.pohodaCode=mappedCode(it)||chooseCode(it,$('codeSource').value); data.items.push(it);
 }
 if(!data.items.length) throw new Error('V Exceli sa nenašli položky. Očakávaný formát je kód a názov v jednom riadku, množstvo v stĺpci H a jednotková cena v stĺpci K.'); data.headerText=title||defaultHeader(data); return data;
}

async function parsePdf(buffer,fileName='ponuka.pdf'){
 if(typeof pdfjsLib==='undefined') throw new Error('Knižnica na čítanie PDF sa nenačítala. Skontrolujte internetové pripojenie a obnovte stránku.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
 const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
 const allLines=[]; let wholeText='';
 for(let p=1;p<=pdf.numPages;p++){
   const page=await pdf.getPage(p); const tc=await page.getTextContent();
   const items=tc.items.filter(x=>String(x.str||'').trim()).map(x=>({text:String(x.str).trim(),x:x.transform[4],y:x.transform[5]}));
   const groups=[];
   items.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(it=>{ let g=groups.find(r=>Math.abs(r.y-it.y)<2.5); if(!g){g={y:it.y,items:[]};groups.push(g);} g.items.push(it); });
   groups.sort((a,b)=>b.y-a.y).forEach(g=>{ g.items.sort((a,b)=>a.x-b.x); const text=g.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim(); if(text){allLines.push({page:p,text,items:g.items}); wholeText+=' '+text;} });
 }
 const titleMatch=wholeText.match(/PONUKA\s*č\.\s*([A-Z0-9]+)/i) || fileName.match(/([0-9]{2}NA[0-9]+)/i);
 const dateMatch=wholeText.match(/Dátum\s*zápisu:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
 const data={sourceType:'pdf',sourceFile:fileName,supplier:{...PTACEK},customerIco:'53690036',dispatchNo:titleMatch?titleMatch[1]:fileName.replace(/\.pdf$/i,''),supplierOrderNo:'',externalNo:'',contractCode:'',contractName:'',date:dateMatch?parseDate(dateMatch[1]):today(),deliveryDate:dateMatch?parseDate(dateMatch[1]):today(),items:[]};
 let pending=[]; let lineNo=0;
 const skip=/^(Označenie dodávky|Ekonomický a informačný systém|Strana \d+|Súčet položiek|SPOLU NA ÚHRADU|Dodávateľ:|Odberateľ:|Ponuka č\.|Forma úhrady:|Dátum zápisu:|Platné do:|Konečný príjemca:|Vystavil:)/i;
 for(const row of allLines){
   const t=row.text.trim(); if(!t||skip.test(t)) continue;
   const m=t.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(ks|m|bm|bal|sada|hod|kpl)?\s+(\d+[.,]\d{2})\s+(?:(\d+[.,]\d{2})\s+)?(\d+[.,]\d{2})\s+(0|5|19|23)%\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/i);
   if(m){
     const prefix=m[1].trim(); let description=[...pending,prefix].filter(Boolean).join(' ').replace(/\s+/g,' ').trim(); pending=[];
     if(!description||/^(Cena|Zľava|DPH|EUR Celkom)$/i.test(description)) continue;
     const qty=parseN(m[2]), unit=m[3]||'', unitPrice=parseN(m[4]), base=parseN(m[6]), rate=parseN(m[7]);
     const it={lineNo:String(++lineNo),ptacekNo:'',vendorCode:'',description,unit:unit||'ks',quantity:qty,listUnitPrice:unitPrice,netUnitPrice:unitPrice,baseTotal:base||qty*unitPrice,vatRate:rate,vatKey:vatKey(rate),include:true};
     it.pohodaCode=mappedCode(it); data.items.push(it);
   } else if(!/^(Spektra install|TCH SPACE|Hlavná|Rajecká Lesná|IČO:|DIČ:|IČ DPH:|Telefón:|E-mail:|www\.|Tel\.:|Email\s*:|Realne použité)/i.test(t)){
     pending.push(t); if(pending.length>4) pending.shift();
   }
 }
 if(!data.items.length) throw new Error('V PDF sa nepodarilo rozpoznať položky. Podporovaný je textový PDF export ponuky z POHODY; naskenovaný obrázok bez textovej vrstvy sa nedá načítať.');
 data.headerText=defaultHeader(data); return data;
}
