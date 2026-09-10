import { z } from "zod";
import { safeRoute, jsonBody, HttpError } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser, hasTenantAccess, sha256 } from "@/lib/auth";

const saleSchema = z.object({
  tenantId:z.string().optional(),offlineId:z.string().min(1).max(100).optional(),
  dataRevision:z.number().int().positive(),tax:z.number().int().min(0).max(1000000000).default(0),
  discount:z.number().int().min(0).max(1000000000).default(0),
  paymentMethod:z.string().trim().min(1).max(32),customerName:z.string().trim().max(80).default("Umum"),
  amountReceived:z.number().int().min(0).max(1000000000000),
  items:z.array(z.object({productId:z.number().int().positive(),qty:z.number().finite().positive().max(1000000)})).min(1).max(100),
});

async function POSTHandler(request: Request) {
  const user = await getCurrentUser(request);
  if(!user)return authError();
  if(!user.tenantId || !hasTenantAccess(user))return forbidden("Akses transaksi toko telah berakhir.");
  const body = await jsonBody(request,saleSchema);
  if(body.tenantId && body.tenantId!==user.tenantId)throw new HttpError(403,"Transaksi berasal dari toko berbeda.");
  const combined = new Map<number,number>();
  for(const item of body.items) combined.set(item.productId,(combined.get(item.productId)||0)+item.qty);
  const items=[...combined].sort((a,b)=>a[0]-b[0]).map(([productId,qty])=>({productId,qty}));
  const requestHash=await sha256(JSON.stringify({...body,items}));
  const transactionId=body.offlineId ? `TRX-${await sha256(user.tenantId+"|"+body.offlineId)}` : `TRX-${crypto.randomUUID()}`;
  return env.DB.transaction(async()=>{
    // Lock the tenant before checking revision/idempotency, then lock stock in a stable order.
    await env.DB.prepare("SELECT id FROM tenants WHERE id=? FOR UPDATE").bind(user.tenantId).first();
    const current=await getCurrentUser(request);
    if(!current || !hasTenantAccess(current))throw new HttpError(403,"Akses transaksi toko telah berakhir.");
    const duplicate=await env.DB.prepare("SELECT id,created_at AS createdAt,request_hash AS requestHash FROM transactions WHERE id=? AND tenant_id=?").bind(transactionId,user.tenantId).first<{id:string;createdAt:number;requestHash:string}>();
    if(duplicate){
      if(duplicate.requestHash!==requestHash)throw new HttpError(409,"ID transaksi digunakan dengan isi berbeda.","IDEMPOTENCY_CONFLICT");
      return Response.json({id:duplicate.id,createdAt:duplicate.createdAt,status:"paid",synced:true,duplicate:true});
    }
    if(body.dataRevision!==Number(current.dataRevision))throw new HttpError(409,"Data offline berasal dari versi toko sebelum reset.","STALE_OFFLINE_DATA");
    const lines=[];
    for(const item of items){
      const product=await env.DB.prepare("SELECT id,name,barcode,price,cost,stock FROM products WHERE id=? AND tenant_id=? FOR UPDATE").bind(item.productId,user.tenantId).first<{id:number;name:string;barcode:string|null;price:number;cost:number;stock:number}>();
      if(!product)throw new HttpError(400,"Produk tidak ditemukan di toko ini.");
      if(item.qty>Number(product.stock))throw new HttpError(409,`Stok ${product.name} tidak cukup. Tersedia ${product.stock}.`,"INSUFFICIENT_STOCK");
      lines.push({...product,...item,lineTotal:Math.round(Number(product.price)*item.qty)});
    }
    const subtotal=lines.reduce((sum,item)=>sum+item.lineTotal,0),total=subtotal+body.tax-body.discount;
    if(!Number.isSafeInteger(total)||total<=0||total>1000000000000||body.discount>subtotal||body.tax>subtotal)throw new HttpError(400,"Nilai transaksi tidak valid.");
    const received=body.paymentMethod==="Tunai"?body.amountReceived:total;
    if(received<total)throw new HttpError(400,"Uang diterima belum mencukupi.");
    const now=Date.now(),changeAmount=received-total;
    await env.DB.prepare("INSERT INTO transactions(id,tenant_id,cashier_name,customer_name,subtotal,tax,discount,total,payment_method,amount_received,change_amount,status,created_at,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,'paid',?,?)").bind(transactionId,user.tenantId,user.name,body.customerName||"Umum",subtotal,body.tax,body.discount,total,body.paymentMethod,received,changeAmount,now,requestHash).run();
    for(const line of lines){
      await env.DB.prepare("INSERT INTO transaction_items(transaction_id,product_id,product_name,barcode,quantity,unit_price,unit_cost,line_total) VALUES (?,?,?,?,?,?,?,?)").bind(transactionId,line.id,line.name,line.barcode,line.qty,line.price,line.cost,line.lineTotal).run();
      await env.DB.prepare("UPDATE products SET stock=stock-? WHERE id=? AND tenant_id=?").bind(line.qty,line.id,user.tenantId).run();
    }
    await env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES (?,?,?,'TRANSACTION_CREATED',?,?)").bind(crypto.randomUUID(),user.tenantId,user.id,transactionId,now).run();
    return Response.json({id:transactionId,createdAt:now,cashierName:user.name,customerName:body.customerName,paymentMethod:body.paymentMethod,amountReceived:received,changeAmount,total,status:"paid",synced:true},{status:201});
  });
}

async function GETHandler(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return authError();
    if (!user.tenantId) return forbidden();
    const transactionId = new URL(request.url).searchParams.get("id")?.trim().slice(0, 80);
    if (transactionId) {
      const transaction = await env.DB.prepare(
        `SELECT x.id, x.cashier_name AS cashierName, x.customer_name AS customerName,
          x.subtotal, x.tax, x.discount, x.total, x.payment_method AS paymentMethod,
          x.amount_received AS amountReceived, x.change_amount AS changeAmount, x.status,
          x.created_at AS createdAt, t.name AS storeName, t.address, t.city, t.phone
         FROM transactions x JOIN tenants t ON t.id = x.tenant_id
         WHERE x.id = ? AND x.tenant_id = ?`
      ).bind(transactionId, user.tenantId).first();
      if (!transaction) return Response.json({ error: "Transaksi tidak ditemukan." }, { status: 404 });
      const items = await env.DB.prepare(
        `SELECT product_name AS name, barcode, quantity, unit_price AS unitPrice, line_total AS lineTotal,
          COALESCE((SELECT unit FROM products p WHERE p.id = transaction_items.product_id), 'pcs') AS unit
         FROM transaction_items WHERE transaction_id = ? ORDER BY id ASC`
      ).bind(transactionId).all();
      return Response.json({ transaction: { ...transaction, items: items.results } });
    }
    const result = await env.DB.prepare(
      "SELECT id, cashier_name AS cashierName, customer_name AS customerName, total, payment_method AS paymentMethod, amount_received AS amountReceived, change_amount AS changeAmount, status, created_at AS createdAt FROM transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20"
    ).bind(user.tenantId).all();
    return Response.json({ transactions: result.results });
  } catch {
    return Response.json(
      { error: false ? "" : "Riwayat transaksi tidak tersedia." },
      { status: 500 }
    );
  }
}



export const GET=safeRoute(GETHandler);
export const POST=safeRoute(POSTHandler);
