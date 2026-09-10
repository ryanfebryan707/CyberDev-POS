export type ReceiptLineItem = {
  name: string;
  barcode?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptData = {
  transactionId: string;
  storeName: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  cashierName: string;
  customerName: string;
  createdAt: number;
  items: ReceiptLineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  amountReceived: number;
  changeAmount: number;
};

const currency = (value: number) => `Rp${new Intl.NumberFormat("id-ID").format(Math.round(value || 0))}`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fit(value: string, width: number) {
  return value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`;
}

function center(value: string, width: number) {
  const text = fit(value, width);
  return `${" ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`;
}

function pair(left: string, right: string, width: number) {
  const rightText = fit(right, Math.floor(width * 0.55));
  const leftText = fit(left, Math.max(1, width - rightText.length - 1));
  return `${leftText}${" ".repeat(Math.max(1, width - leftText.length - rightText.length))}${rightText}`;
}

export function buildReceiptText(receipt: ReceiptData, width = 32) {
  const divider = "-".repeat(width);
  const address = [receipt.address, receipt.city].filter(Boolean).join(", ");
  const created = new Date(receipt.createdAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  const lines = [
    center(receipt.storeName || "TOKO", width),
    ...(address ? [center(address, width)] : []),
    ...(receipt.phone ? [center(`Telp/WA ${receipt.phone}`, width)] : []),
    divider,
    pair("No. Struk", receipt.transactionId, width),
    pair("Tanggal", created, width),
    pair("Kasir", receipt.cashierName, width),
    pair("Pelanggan", receipt.customerName || "Umum", width),
    divider,
  ];

  for (const item of receipt.items) {
    lines.push(fit(item.name, width));
    lines.push(pair(`${item.quantity} ${item.unit} x ${currency(item.unitPrice)}`, currency(item.lineTotal), width));
    if (item.barcode) lines.push(fit(`  Barcode ${item.barcode}`, width));
  }

  lines.push(
    divider,
    pair("Subtotal", currency(receipt.subtotal), width),
    ...(receipt.tax ? [pair("Pajak", currency(receipt.tax), width)] : []),
    ...(receipt.discount ? [pair("Diskon", `-${currency(receipt.discount)}`, width)] : []),
    pair("TOTAL", currency(receipt.total), width),
    pair("Pembayaran", receipt.paymentMethod, width),
    pair("Diterima", currency(receipt.amountReceived), width),
    pair("Kembalian", currency(receipt.changeAmount), width),
    divider,
    center("Terima kasih", width),
    center("Barang yang dibeli telah diperiksa", width),
    "",
    "",
  );
  return lines.join("\n");
}

export function buildReceiptHtml(receipt: ReceiptData) {
  const address = [receipt.address, receipt.city].filter(Boolean).join(", ");
  const created = new Date(receipt.createdAt).toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "medium",
  });
  const rows = receipt.items.map((item) => `
    <tr>
      <td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(String(item.quantity))} ${escapeHtml(item.unit)} × ${currency(item.unitPrice)}${item.barcode ? `<br>Barcode ${escapeHtml(item.barcode)}` : ""}</small></td>
      <td>${currency(item.lineTotal)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Struk ${escapeHtml(receipt.transactionId)}</title>
<style>
  @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;color:#111;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}
  h1{font-size:18px;line-height:1.2;margin:0 0 4px;text-align:center}header p,footer p{margin:2px 0;text-align:center}.rule{border-top:1px dashed #111;margin:8px 0}
  dl{display:grid;grid-template-columns:23mm 1fr;gap:2px;margin:0}dt{font-weight:700}dd{margin:0;text-align:right;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}small{display:block;font-weight:400}
  .totals{display:grid;grid-template-columns:1fr auto;gap:3px 8px}.totals b{font-size:14px}.totals span:nth-child(even){text-align:right}.strong{font-size:14px;font-weight:800}
  @media screen{body{padding:16px;box-shadow:0 0 24px #bbb;margin-top:20px;margin-bottom:20px}}
</style></head><body>
<header><h1>${escapeHtml(receipt.storeName || "TOKO")}</h1>${address ? `<p>${escapeHtml(address)}</p>` : ""}${receipt.phone ? `<p>Telp/WA ${escapeHtml(receipt.phone)}</p>` : ""}</header>
<div class="rule"></div><dl><dt>No. Struk</dt><dd>${escapeHtml(receipt.transactionId)}</dd><dt>Tanggal</dt><dd>${escapeHtml(created)}</dd><dt>Kasir</dt><dd>${escapeHtml(receipt.cashierName)}</dd><dt>Pelanggan</dt><dd>${escapeHtml(receipt.customerName || "Umum")}</dd></dl>
<div class="rule"></div><table><tbody>${rows}</tbody></table><div class="rule"></div>
<section class="totals"><span>Subtotal</span><span>${currency(receipt.subtotal)}</span>${receipt.tax ? `<span>Pajak</span><span>${currency(receipt.tax)}</span>` : ""}${receipt.discount ? `<span>Diskon</span><span>-${currency(receipt.discount)}</span>` : ""}<span class="strong">TOTAL</span><span class="strong">${currency(receipt.total)}</span><span>Metode bayar</span><span>${escapeHtml(receipt.paymentMethod)}</span><span>Uang diterima</span><span>${currency(receipt.amountReceived)}</span><span>Kembalian</span><span>${currency(receipt.changeAmount)}</span></section>
<div class="rule"></div><footer><p><b>Terima kasih</b></p><p>Barang yang dibeli telah diperiksa.</p></footer>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),150));<\/script></body></html>`;
}
