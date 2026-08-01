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
const parseN = s => Number(String(s??'').replace(/\s/g,'').replace(',','.')) || 0;
function today(){ return new Date().toISOString().slice(0,10); }
function parseDate(s){ const m=String(s||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/); if(!m) return today(); let y=+m[3]; if(y<100)y+=y<70?2000:1900; return `${y.toString().padStart(4,'0')}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function vatKey(rate){ rate=Math.round(Number(rate)||0); return rate===23?'high':rate===19?'low':rate===5?'third':rate===0?'none':'high'; }
function vatRate(key){ return VAT_OPTIONS.find(x=>x.key===key)?.rate ?? 23; }
function defaultHeader(d){ if(d.sourceType==='xlsx') return `Príloha k ponuke ${d.dispatchNo||''}`.trim().slice(0,240); const p=[`Výdajka Ptáček ${d.dispatchNo||''}`.trim()]; if(d.supplierOrderNo)p.push(`objednávka Ptáček ${d.supplierOrderNo}`); if(d.externalNo)p.push(`referencia ${d.externalNo}`); const c=[d.contractCode,d.contractName].filter(Boolean).join(' / '); if(c)p.push(c); return p.join(' | ').slice(0,240); }
function loadMappings(){ try{return JSON.parse(localStorage.getItem('ptacekPohodaMappings')||'{}')||{}}catch{return {}} }
function saveMappings(){ localStorage.setItem('ptacekPohodaMappings',JSON.stringify(mappings)); }
function mappedCode(it){ return mappings['vendor:'+it.vendorCode] || mappings['ptacek:'+it.ptacekNo] || ''; }
function chooseCode(it,source){ if(source==='ptacek')return it.ptacekNo||it.vendorCode; if(source==='saved')return mappedCode(it)||it.vendorCode||it.ptacekNo; return it.vendorCode||it.ptacekNo; }
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
 const wb=XLSX.read(buffer,{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; if(!ws)throw new Error('Excel neobsahuje pracovný hárok.');
 const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
 let title=''; for(const row of rows.slice(0,10)){ for(const v of row){ const s=String(v??'').trim(); if(/PRÍLOHA K PONUKE/i.test(s)){title=s;break;} } if(title)break; }
 const numMatch=title.match(/č\.\s*([^\s]+)/i) || fileName.match(/č\._([^\.]+)/i); const docNo=numMatch?numMatch[1].replace(/_/g,' '):fileName.replace(/\.xlsx$/i,'');
 const data={sourceType:'xlsx',sourceFile:fileName,supplier:{...PTACEK},customerIco:'53690036',dispatchNo:docNo,supplierOrderNo:'',externalNo:'',contractCode:'',contractName:'',date:today(),deliveryDate:today(),items:[]};
 rows.forEach((row,idx)=>{
   const raw=String(row[2]??'').trim(); const qty=parseN(row[7]); const unit=String(row[9]??'').trim(); const unitPrice=parseN(row[10]); const base=parseN(row[16]);
   if(!raw || !(qty>0) || !(unitPrice>=0)) return;
   const m=raw.match(/^\s*([^:]+)\s*:\s*(.+)$/); if(!m)return;
   const code=m[1].trim(), description=m[2].trim();
   let rate=parseN(row[17]); if(rate>0 && rate<1)rate*=100; if(!rate && base)rate=Math.round(parseN(row[19])/base*100);
   const it={lineNo:String(idx+1),ptacekNo:'',vendorCode:code,description,unit,quantity:qty,listUnitPrice:unitPrice,netUnitPrice:unitPrice,baseTotal:base||qty*unitPrice,vatRate:rate||23,vatKey:vatKey(rate||23),include:true};
   it.pohodaCode=mappedCode(it)||chooseCode(it,$('codeSource').value); data.items.push(it);
 });
 if(!data.items.length)throw new Error('V Exceli sa nenašli položky vo formáte KÓD:NÁZOV s množstvom a jednotkovou cenou.');
 data.headerText=title||defaultHeader(data); return data;
}
