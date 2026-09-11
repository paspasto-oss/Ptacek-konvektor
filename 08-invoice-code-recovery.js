'use strict';

function recoverPtacekManufacturerCode(description){
  const s=String(description||'').replace(/\s+/g,' ').trim();
  const candidates=s.match(/\b[A-Z][A-Z0-9.-]{1,24}\/[A-Z0-9.-]{1,24}\b|\b[A-Z][A-Z0-9.-]{2,24}-[A-Z0-9.-]*\/[A-Z0-9.-]+\b/g)||[];
  return candidates.find(code=>{
    const c=code.toUpperCase();
    if(!/[0-9]/.test(c))return false;
    if(/^(DN|PN|SDR)\d/i.test(c))return false;
    if(/^M\d+(?:\/M\d+)+$/i.test(c))return false;
    return true;
  })||'';
}

const _parseReceivedInvoicePdfV41=parseReceivedInvoicePdf;
parseReceivedInvoicePdf=async function(buffer,fileName='faktura.pdf'){
  const data=await _parseReceivedInvoicePdfV41(buffer,fileName);
  for(const it of (data.items||[])){
    if(!String(it.vendorCode||'').trim()){
      const code=recoverPtacekManufacturerCode(it.description);
      if(code){
        it.vendorCode=code;
        it.description=String(it.description||'').replace(code,' ').replace(/\s+/g,' ').trim();
      }
    }
    it.pohodaCode=String(it.vendorCode||'').trim();
  }
  return data;
};
