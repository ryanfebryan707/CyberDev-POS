import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { env, closeDatabase } from "../lib/runtime-env";
import * as register from "../app/api/auth/register/route";
import * as login from "../app/api/auth/login/route";
import * as me from "../app/api/auth/me/route";
import * as logout from "../app/api/auth/logout/route";
import * as passwords from "../app/api/auth/change-password/route";
import * as products from "../app/api/products/route";
import * as sales from "../app/api/transactions/route";
import * as admin from "../app/api/admin/clients/route";
import * as adminProducts from "../app/api/admin/products/route";
import * as customers from "../app/api/customers/route";
import * as staff from "../app/api/staff/route";
import * as dashboard from "../app/api/dashboard/route";
import * as reports from "../app/api/reports/route";
import * as billing from "../app/api/billing/route";
import * as device from "../app/api/device/authorize/route";
import * as settings from "../app/api/settings/route";
import * as notifications from "../app/api/notifications/route";
import * as imports from "../app/api/products/import/route";
import { GET as startGoogle } from "../app/api/auth/google/route";
import { GET as callback } from "../app/api/auth/google/callback/route";

let directory:string,adminCookie:string,ownerCookie:string,otherCookie:string,tenantId:string,otherTenant:string,productId:number;
const password=randomBytes(24).toString("base64url")+"A1";
function request(path:string,method="GET",body?:unknown,cookie="",ip="qa"){
  return new Request(`http://localhost:3000/api/${path}`,{method,headers:{origin:"http://localhost:3000","content-type":"application/json",cookie,"x-forwarded-for":ip},body:body===undefined?undefined:JSON.stringify(body)});
}
const session=(response:Response)=>response.headers.get("set-cookie")!.split(";")[0];
async function createOwner(email:string,phone:string,ip:string){
  const response=await register.POST(request("auth/register","POST",{name:"QA Owner",storeName:"QA Store",email,phone,password,businessType:"general"},"",ip));
  assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const cookie=session(response),profile=await (await me.GET(request("auth/me","GET",undefined,cookie))).json();
  return {cookie,tenantId:profile.user.tenantId};
}
const payload=(key:string,qty=1)=>({tenantId,offlineId:key,dataRevision:1,items:[{productId,qty}],tax:0,discount:0,paymentMethod:"Tunai",amountReceived:100000});
before(async()=>{
  delete process.env.DATABASE_URL;
  directory=await mkdtemp(join(tmpdir(),"cyberdev-qa-"));process.env.LOCAL_DATABASE_PATH=directory;
  process.env.ADMIN_EMAIL="qa-admin@example.test";process.env.ADMIN_BOOTSTRAP_PASSWORD=password;
  const response=await login.POST(request("auth/login","POST",{identifier:process.env.ADMIN_EMAIL,password}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));adminCookie=session(response);
  const one=await createOwner("owner1@example.test","081111111111","one");ownerCookie=one.cookie;tenantId=one.tenantId;
  const two=await createOwner("owner2@example.test","082222222222","two");otherCookie=two.cookie;otherTenant=two.tenantId;
});
after(async()=>{await closeDatabase();await rm(directory,{recursive:true,force:true});});

test("new owners start with empty stock; private APIs reject anonymous and cross-role access",async()=>{
  for(const route of [products,dashboard,admin,adminProducts,customers,staff,settings,billing,notifications])assert.equal((await route.GET(request("test"))).status,401);
  assert.equal((await admin.GET(request("admin/clients","GET",undefined,ownerCookie))).status,403);
  assert.deepEqual((await (await products.GET(request("products","GET",undefined,ownerCookie))).json()).products,[]);
});
test("product CRUD and customer edits are isolated by tenant",async()=>{
  const response=await products.POST(request("products","POST",{name:"QA Product",category:"QA",barcode:"QA-01",price:10000,cost:4000,stock:2,unit:"pcs"},ownerCookie));
  assert.equal(response.status,201);productId=Number((await response.json()).id);
  assert.equal((await products.PATCH(request("products","PATCH",{id:productId,name:"Stolen",price:1,stock:1},otherCookie))).status,404);
  const member=await customers.POST(request("customers","POST",{name:"QA Member",phone:"08123",email:"member@example.test"},ownerCookie));assert.equal(member.status,201);
  const id=(await member.json()).id;
  assert.equal((await customers.PATCH(request("customers","PATCH",{id,name:"Wrong owner"},otherCookie))).status,404);
  assert.equal((await customers.PATCH(request("customers","PATCH",{id,name:"Edited Member"},ownerCookie))).status,200);
});
test("duplicate line quantities cannot oversell and concurrent checkouts are atomic",async()=>{
  const duplicateLines={...payload("duplicate-lines"),items:[{productId,qty:2},{productId,qty:2}]};
  assert.equal((await sales.POST(request("transactions","POST",duplicateLines,ownerCookie))).status,409);
  const concurrent=await Promise.all(["a","b","c"].map(key=>sales.POST(request("transactions","POST",payload(key),ownerCookie))));
  assert.deepEqual(concurrent.map(response=>response.status).sort(),[201,201,409]);
  const row=await env.DB.prepare("SELECT stock FROM products WHERE id=?").bind(productId).first<{stock:number}>();assert.equal(Number(row?.stock),0);
});
test("retrying a saved sale is idempotent even after stock reaches zero",async()=>{
  const row=await env.DB.prepare("SELECT id FROM transactions WHERE tenant_id=? ORDER BY created_at LIMIT 1").bind(tenantId).first<{id:string}>();assert.ok(row);
  const candidates=await Promise.all(["a","b","c"].map(key=>sales.POST(request("transactions","POST",payload(key),ownerCookie))));
  assert.equal(candidates.filter(response=>response.status===200).length,2);
  const successIndex=candidates.findIndex(response=>response.status===200),key=["a","b","c"][successIndex];
  assert.equal((await sales.POST(request("transactions","POST",{...payload(key),discount:1},ownerCookie))).status,409);
  assert.equal((await sales.POST(request("transactions","POST",payload("cross"),otherCookie))).status,403);
  assert.equal((await sales.GET(request(`transactions?id=${row.id}`,"GET",undefined,otherCookie))).status,404);
});
test("dashboard aggregates actual transactions and contains no other tenant stock",async()=>{
  const own=await (await dashboard.GET(request("dashboard","GET",undefined,ownerCookie))).json();assert.equal(Number(own.stats.revenue),20000);assert.equal(Number(own.stats.transactionCount),2);assert.equal(own.topProducts[0].name,"QA Product");
  const other=await (await dashboard.GET(request("dashboard","GET",undefined,otherCookie))).json();assert.equal(Number(other.stats.revenue),0);assert.equal(other.topProducts.length,0);
});
test("payment submission stays pending until admin activation; reports include discounts",async()=>{
  assert.equal((await billing.POST(request("billing","POST",{planCode:"monthly",method:"bri",reference:"QA manual"},ownerCookie))).status,201);
  const before=await (await me.GET(request("auth/me","GET",undefined,ownerCookie))).json();assert.equal(before.user.tenantStatus,"demo");
  assert.equal((await reports.GET(request("reports","GET",undefined,ownerCookie))).status,403);
  assert.equal((await admin.PATCH(request("admin/clients","PATCH",{tenantId,action:"activate",planCode:"monthly"},adminCookie))).status,200);
  assert.equal((await device.POST(request("device/authorize","POST",{consent:true,latitude:2.8,longitude:117.3,accuracy:10,address:"QA Test Location",city:"QA"},ownerCookie))).status,200);
  await products.PATCH(request("products","PATCH",{id:productId,name:"QA Product",category:"QA",barcode:"QA-01",price:10000,cost:4000,stock:2},ownerCookie));
  assert.equal((await sales.POST(request("transactions","POST",{...payload("discounted"),discount:2000,tax:1000},ownerCookie))).status,201);
  const report=await reports.GET(request("reports","GET",undefined,ownerCookie));assert.equal(report.status,200,JSON.stringify(await report.clone().json()));
  const data=await report.json();assert.equal(data.summary.revenue,28000);assert.equal(data.summary.costOfGoods,12000);assert.equal(data.summary.grossProfit,16000);
});
test("staff permissions block privilege escalation; disabling staff revokes sessions",async()=>{
  const created=await staff.POST(request("staff","POST",{name:"QA Cashier",email:"cashier@example.test",password,role:"cashier"},ownerCookie));assert.equal(created.status,201);const id=(await created.json()).id;
  const logged=await login.POST(request("auth/login","POST",{identifier:"cashier@example.test",password},"","staff"));assert.equal(logged.status,200);const cookie=session(logged);
  assert.equal((await staff.GET(request("staff","GET",undefined,cookie))).status,403);
  assert.equal((await products.POST(request("products","POST",{name:"Not permitted",price:100},cookie))).status,403);
  assert.equal((await reports.GET(request("reports","GET",undefined,cookie))).status,403);
  assert.equal((await staff.POST(request("staff","POST",{name:"Escalate",email:"evil@example.test",password,role:"superadmin"},ownerCookie))).status,400);
  assert.equal((await staff.PATCH(request("staff","PATCH",{id,isActive:false,role:"cashier"},otherCookie))).status,404);
  assert.equal((await staff.PATCH(request("staff","PATCH",{id,isActive:false,role:"cashier"},ownerCookie))).status,200);
  assert.equal((await me.GET(request("auth/me","GET",undefined,cookie))).status,200);
  assert.equal((await (await me.GET(request("auth/me","GET",undefined,cookie))).json()).user,null);
});
test("imports, notifications, settings and admin endpoints execute against PostgreSQL",async()=>{
  const imported=await imports.POST(request("products/import","POST",{products:[{name:"Fractional stock",barcode:"QA-IMP",price:12000,cost:5000,stock:1.5,unit:"kg"}]},ownerCookie));assert.equal(imported.status,201,JSON.stringify(await imported.clone().json()));
  assert.equal((await settings.PATCH(request("settings","PATCH",{storeName:"Updated QA Store",businessType:"general",address:"Test",city:"QA"},ownerCookie))).status,200);
  const sent=await notifications.POST(request("notifications","POST",{title:"QA Notice",message:"Test announcement",audience:"all"},adminCookie));assert.equal(sent.status,201);const id=(await sent.json()).id;
  assert.equal((await notifications.PATCH(request("notifications","PATCH",{action:"read",announcementId:id},ownerCookie))).status,200);
  const notices=await (await notifications.GET(request("notifications","GET",undefined,ownerCookie))).json();assert.equal(Number(notices.unread),0);
  assert.equal((await admin.GET(request("admin/clients","GET",undefined,adminCookie))).status,200);
  assert.equal((await adminProducts.GET(request(`admin/products?tenantId=${tenantId}`,"GET",undefined,adminCookie))).status,200);
});
test("suspension and stale offline revision block new sales",async()=>{
  assert.equal((await sales.POST(request("transactions","POST",{...payload("stale"),dataRevision:99},ownerCookie))).status,409);
  await admin.PATCH(request("admin/clients","PATCH",{tenantId,action:"suspend"},adminCookie));
  assert.equal((await sales.POST(request("transactions","POST",payload("suspended"),ownerCookie))).status,403);
});
test("password changes and logout revoke cookies; brute-force is throttled",async()=>{
  const changed=await passwords.POST(request("auth/change-password","POST",{currentPassword:password,newPassword:password+"2"},otherCookie));assert.equal(changed.status,200);
  assert.equal((await (await me.GET(request("auth/me","GET",undefined,otherCookie))).json()).user,null);
  for(let i=0;i<6;i++)assert.equal((await login.POST(request("auth/login","POST",{identifier:"missing@example.test",password},"","throttle"))).status,401);
  assert.equal((await login.POST(request("auth/login","POST",{identifier:"missing@example.test",password},"","throttle"))).status,429);
  assert.equal((await logout.POST(request("auth/logout","POST",{},ownerCookie))).status,200);
  assert.equal((await (await me.GET(request("auth/me","GET",undefined,ownerCookie))).json()).user,null);
});
test("an existing legacy-length password can authenticate and then be upgraded",async()=>{
  const previous={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_BOOTSTRAP_PASSWORD,phones:process.env.ADMIN_PHONE_ALIASES};
  const legacyPassword="Legacy8007!";
  process.env.ADMIN_EMAIL="legacy-admin@example.test";process.env.ADMIN_BOOTSTRAP_PASSWORD=legacyPassword;process.env.ADMIN_PHONE_ALIASES="083333333333";
  const logged=await login.POST(request("auth/login","POST",{identifier:process.env.ADMIN_EMAIL,password:legacyPassword},"","legacy-admin"));
  assert.equal(logged.status,200,JSON.stringify(await logged.clone().json()));
  const changed=await passwords.POST(request("auth/change-password","POST",{currentPassword:legacyPassword,newPassword:password+"9"},session(logged),"legacy-admin-change"));
  assert.equal(changed.status,200,JSON.stringify(await changed.clone().json()));
  if(previous.email===undefined)delete process.env.ADMIN_EMAIL;else process.env.ADMIN_EMAIL=previous.email;
  if(previous.password===undefined)delete process.env.ADMIN_BOOTSTRAP_PASSWORD;else process.env.ADMIN_BOOTSTRAP_PASSWORD=previous.password;
  if(previous.phones===undefined)delete process.env.ADMIN_PHONE_ALIASES;else process.env.ADMIN_PHONE_ALIASES=previous.phones;
});
test("Google login is client-only even when an admin intent is requested",async()=>{
  const previous={id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,url:process.env.APP_URL};
  process.env.GOOGLE_CLIENT_ID="1013741790568-qa.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET="GOCSPX-qa-valid-secret";
  process.env.APP_URL="http://localhost:3000";
  const response=await startGoogle(new Request("http://localhost:3000/api/auth/google?intent=admin",{headers:{"x-forwarded-for":"oauth-test"}}));
  assert.equal(response.status,302);
  assert.match(response.headers.get("location")||"",/^https:\/\/accounts\.google\.com\//);
  const state=await env.DB.prepare("SELECT intent FROM oauth_states ORDER BY expires_at DESC LIMIT 1").first<{intent:string}>();
  assert.equal(state?.intent,"client");
  const adminResponse=await startGoogle(request("auth/google?intent=admin","GET",undefined,adminCookie,"oauth-admin"));
  assert.equal(adminResponse.status,403);
  if(previous.id===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=previous.id;
  if(previous.secret===undefined)delete process.env.GOOGLE_CLIENT_SECRET;else process.env.GOOGLE_CLIENT_SECRET=previous.secret;
  if(previous.url===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous.url;
});
test("Google callback fails closed without credentials",async()=>{
  delete process.env.AUTH_GOOGLE_SECRET;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal((await callback(request("auth/google/callback?state=forged&code=forged"))).status,503);
});
