"use client";
export async function exportRows(filename: string, sheets: Array<{name:string;rows:Record<string,unknown>[]}>) {
  const { Workbook }=await import("exceljs");
  const book=new Workbook();
  for(const {name,rows} of sheets){
    const sheet=book.addWorksheet(name),keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    sheet.addRow(keys);
    for(const row of rows)sheet.addRow(keys.map(key=>row[key] ?? ""));
    sheet.getRow(1).font={bold:true};
  }
  const bytes=await book.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const link=document.createElement("a");link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readRows(file: File):Promise<Record<string,unknown>[]> {
  if(file.size>2*1024*1024)throw new Error("Ukuran file maksimal 2 MB.");
  if(file.name.toLowerCase().endsWith(".csv")){
    const Papa=await import("papaparse");
    const parsed=Papa.default.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true});
    if(parsed.errors.length)throw new Error("Format CSV tidak valid.");
    if(parsed.data.length>1000)throw new Error("Maksimal 1.000 baris.");
    return parsed.data;
  }
  if(!file.name.toLowerCase().endsWith(".xlsx"))throw new Error("Gunakan file .xlsx atau .csv.");
  const { Workbook }=await import("exceljs");
  const book=new Workbook();await book.xlsx.load(await file.arrayBuffer());
  const sheet=book.worksheets[0];if(!sheet)throw new Error("Sheet pertama tidak ditemukan.");
  if(sheet.rowCount>1001)throw new Error("Maksimal 1.000 baris.");
  const keys:string[]=[];sheet.getRow(1).eachCell((cell,index)=>{keys[index]=cell.text;});
  const rows:Record<string,unknown>[]=[];
  sheet.eachRow((row,index)=>{
    if(index===1)return;
    const result:Record<string,unknown>={};
    row.eachCell((cell,i)=>{if(keys[i]){if(cell.formula)throw new Error("Hapus formula dan gunakan nilai produk biasa.");result[keys[i]]=typeof cell.value==="number"?cell.value:cell.text;}});
    rows.push(result);
  });
  return rows;
}

export function parseProductNumber(value:unknown) {
  if(typeof value==="number")return value;
  let text=String(value??"").trim().replace(/^Rp\s*/i,"");
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text))text=text.replace(/\./g,"");
  text=text.replace(",",".");
  const result=Number(text);
  if(!Number.isFinite(result))throw new Error("Angka pada file tidak valid.");
  return result;
}
