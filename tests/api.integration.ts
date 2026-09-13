import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
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
import * as qris from "../app/api/qris/route";
import * as notifications from "../app/api/notifications/route";
import * as imports from "../app/api/products/import/route";
import { GET as startGoogle } from "../app/api/auth/google/route";
import { GET as callback } from "../app/api/auth/google/callback/route";
import * as googleIdentity from "../app/api/auth/google/identity/route";
import { completeGoogleIdentityLogin } from "../lib/google-auth";
import { hashPassword } from "../lib/auth";

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
  for(const route of [products,dashboard,admin,adminProducts,customers,staff,settings,qris,billing,notifications])assert.equal((await route.GET(request("test"))).status,401);
  assert.equal((await admin.GET(request("admin/clients","GET",undefined,ownerCookie))).status,403);
  assert.deepEqual((await (await products.GET(request("products","GET",undefined,ownerCookie))).json()).products,[]);
});
test("clients created by Admin can log in with either email or phone",async()=>{
  const email="admin-created@example.test",phone="083456789012";
  const created=await admin.POST(request("admin/clients","POST",{
    ownerName:"Admin Created Owner",storeName:"Admin Created Store",email,phone,password,
    planCode:"demo",businessType:"general",address:"QA Address",city:"QA City",
  },adminCookie,"admin-create-client"));
  assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  const createdData=await created.json() as {tenantId:string;status:string};
  assert.equal(createdData.status,"demo");
  for(const [identifier,ip] of [[email,"admin-client-email"],[phone,"admin-client-phone"]] as const){
    const logged=await login.POST(request("auth/login","POST",{identifier,password},"",ip));
    assert.equal(logged.status,200,JSON.stringify(await logged.clone().json()));
    const clientCookie=session(logged);
    const profile=await (await me.GET(request("auth/me","GET",undefined,clientCookie))).json();
    assert.equal(profile.user.role,"owner");
    assert.equal(profile.user.tenantId,createdData.tenantId);
    assert.equal(profile.user.tenantStatus,"demo");
    const clientDashboard=await dashboard.GET(request("dashboard","GET",undefined,clientCookie,`${ip}-dashboard`));
    assert.equal(clientDashboard.status,200,JSON.stringify(await clientDashboard.clone().json()));
  }
});
test("Admin can permanently delete only the confirmed client and all tenant data",async()=>{
  const email="delete-client@example.test",phone="083456789013",storeName="Delete Client Store";
  const created=await admin.POST(request("admin/clients","POST",{
    ownerName:"Delete Client Owner",storeName,email,phone,password,
    planCode:"demo",businessType:"general",address:"QA Address",city:"QA City",
  },adminCookie,"delete-client-create"));
  assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  const {tenantId:deleteTenant}=await created.json() as {tenantId:string};

  const logged=await login.POST(request("auth/login","POST",{identifier:email,password},"","delete-client-login"));
  assert.equal(logged.status,200,JSON.stringify(await logged.clone().json()));
  const deleteCookie=session(logged);
  const owner=await env.DB.prepare("SELECT id FROM users WHERE tenant_id=? AND role='owner'").bind(deleteTenant).first<{id:string}>();
  assert.ok(owner?.id);
  const product=await products.POST(request("products","POST",{name:"Disposable Product",category:"QA",barcode:"DELETE-01",price:5000,cost:2000,stock:3,unit:"pcs"},deleteCookie,"delete-product"));
  assert.equal(product.status,201,JSON.stringify(await product.clone().json()));
  const member=await customers.POST(request("customers","POST",{name:"Disposable Member",phone:"081234567890",email:"disposable-member@example.test"},deleteCookie,"delete-member"));
  assert.equal(member.status,201,JSON.stringify(await member.clone().json()));
  const payment=await billing.POST(request("billing","POST",{planCode:"monthly",method:"bri",reference:"DELETE QA"},deleteCookie,"delete-payment"));
  assert.equal(payment.status,201,JSON.stringify(await payment.clone().json()));
  const announcementId=crypto.randomUUID(),now=Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO oauth_accounts(provider,subject,user_id,created_at) VALUES ('google',?,?,?)").bind(`delete-${crypto.randomUUID()}`,owner.id,now),
    env.DB.prepare("INSERT INTO oauth_states(state_hash,nonce,verifier,browser_hash,user_id,expires_at,intent) VALUES (?,?,?,?,?,?,'client')").bind(`delete-${crypto.randomUUID()}`,"nonce","verifier","browser",owner.id,now+60000),
    env.DB.prepare("INSERT INTO announcements(id,title,message,audience,severity,is_active,expires_at,created_by,created_at) VALUES (?,?,?,?,?,1,NULL,?,?)").bind(announcementId,"Delete QA","Disposable","all","info",owner.id,now),
    env.DB.prepare("INSERT INTO announcement_reads(id,announcement_id,user_id,read_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),announcementId,owner.id,now),
  ]);

  const wrong=await admin.DELETE(request("admin/clients","DELETE",{tenantId:deleteTenant,confirmation:"wrong"},adminCookie,"delete-client-wrong"));
  assert.equal(wrong.status,400,JSON.stringify(await wrong.clone().json()));
  assert.ok(await env.DB.prepare("SELECT id FROM tenants WHERE id=?").bind(deleteTenant).first());

  const removed=await admin.DELETE(request("admin/clients","DELETE",{tenantId:deleteTenant,confirmation:storeName},adminCookie,"delete-client-confirmed"));
  assert.equal(removed.status,200,JSON.stringify(await removed.clone().json()));
  assert.deepEqual(await removed.json(),{ok:true,deleted:true,tenantId:deleteTenant});
  for(const [table,column,value] of [
    ["tenants","id",deleteTenant],
    ["users","tenant_id",deleteTenant],
    ["products","tenant_id",deleteTenant],
    ["customers","tenant_id",deleteTenant],
    ["payments","tenant_id",deleteTenant],
    ["subscriptions","tenant_id",deleteTenant],
    ["transactions","tenant_id",deleteTenant],
    ["oauth_accounts","user_id",owner.id],
    ["oauth_states","user_id",owner.id],
    ["auth_sessions","user_id",owner.id],
    ["announcements","created_by",owner.id],
    ["announcement_reads","user_id",owner.id],
  ] as const){
    const row=await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column}=?`).bind(value).first<{total:number}>();
    assert.equal(Number(row?.total||0),0,`${table} masih menyimpan data client yang dihapus`);
  }
  const audit=await env.DB.prepare("SELECT tenant_id AS tenantId,user_id AS userId FROM audit_logs WHERE action='CLIENT_DELETED' AND details LIKE ? ORDER BY created_at DESC LIMIT 1")
    .bind(`%${storeName}%`).first<{tenantId:string|null;userId:string}>();
  assert.equal(audit?.tenantId,null);assert.ok(audit?.userId);
  assert.equal((await login.POST(request("auth/login","POST",{identifier:email,password},"","delete-client-after"))).status,401);
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
  const qrisPayload="0002010102115204000053033605802ID5908QA STORE6304ABCD";
  assert.equal((await settings.PATCH(request("settings","PATCH",{storeName:"Updated QA Store",businessType:"general",address:"Test",city:"QA",qrisMerchantName:"QA Store",qrisPayload},ownerCookie))).status,200);
  const savedSettings=await (await settings.GET(request("settings","GET",undefined,ownerCookie))).json();
  assert.equal(savedSettings.qris.configured,true);assert.equal(savedSettings.qris.merchantName,"QA Store");assert.equal(savedSettings.qris.payload,qrisPayload);
  const qrisImage=await qris.GET(request("qris","GET",undefined,ownerCookie));assert.equal(qrisImage.status,200);assert.match(qrisImage.headers.get("content-type")||"",/^image\/svg\+xml/);assert.match(await qrisImage.text(),/<svg/);
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
test("production Super-Admin password cannot be changed from the dashboard",async()=>{
  const previous=process.env.CYBERDEV_ADMIN_PASSWORD_LOCKED;
  process.env.CYBERDEV_ADMIN_PASSWORD_LOCKED="1";
  try {
    const response=await passwords.POST(request("auth/change-password","POST",{currentPassword:password,newPassword:password+"3"},adminCookie,"admin-password-lock"));
    assert.equal(response.status,403,JSON.stringify(await response.clone().json()));
  } finally {
    if(previous===undefined)delete process.env.CYBERDEV_ADMIN_PASSWORD_LOCKED;else process.env.CYBERDEV_ADMIN_PASSWORD_LOCKED=previous;
  }
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
test("bootstrap secret can recover only an Admin that never completed first login",async()=>{
  const previous={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_BOOTSTRAP_PASSWORD,phones:process.env.ADMIN_PHONE_ALIASES};
  const recoveryPassword=randomBytes(18).toString("base64url")+"A1";
  const stalePassword=randomBytes(18).toString("base64url")+"B2";
  process.env.ADMIN_EMAIL="recovery-admin@example.test";
  process.env.ADMIN_BOOTSTRAP_PASSWORD=recoveryPassword;
  process.env.ADMIN_PHONE_ALIASES="083333333334,6283333333334";
  try {
    const stale=await hashPassword(stalePassword),id=crypto.randomUUID(),now=Date.now();
    await env.DB.prepare("INSERT INTO users(id,tenant_id,name,email,phone,password_hash,password_salt,role,is_active,password_changed_at,last_login_at,created_at) VALUES (?,NULL,'Recovery Admin',?,?,?,?,'superadmin',1,?,NULL,?)")
      .bind(id,process.env.ADMIN_EMAIL,"083333333334",stale.hash,stale.salt,now,now).run();
    const recovered=await login.POST(request("auth/login","POST",{identifier:"6283333333334",password:recoveryPassword},"","admin-recovery"));
    assert.equal(recovered.status,200,JSON.stringify(await recovered.clone().json()));
    const row=await env.DB.prepare("SELECT last_login_at AS lastLoginAt FROM users WHERE id=?").bind(id).first<{lastLoginAt:number|null}>();
    assert.ok(Number(row?.lastLoginAt)>0);
    process.env.ADMIN_BOOTSTRAP_PASSWORD=stalePassword;
    const cannotReuse=await login.POST(request("auth/login","POST",{identifier:process.env.ADMIN_EMAIL,password:stalePassword},"","admin-recovery-used"));
    assert.equal(cannotReuse.status,401);
  } finally {
    if(previous.email===undefined)delete process.env.ADMIN_EMAIL;else process.env.ADMIN_EMAIL=previous.email;
    if(previous.password===undefined)delete process.env.ADMIN_BOOTSTRAP_PASSWORD;else process.env.ADMIN_BOOTSTRAP_PASSWORD=previous.password;
    if(previous.phones===undefined)delete process.env.ADMIN_PHONE_ALIASES;else process.env.ADMIN_PHONE_ALIASES=previous.phones;
  }
});
test("Google Identity config works without a client secret and is protected by nonce and role",async()=>{
  const previous={id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,alias:process.env.AUTH_GOOGLE_SECRET,url:process.env.APP_URL};
  process.env.GOOGLE_CLIENT_ID="1013741790568-qa.apps.googleusercontent.com";
  delete process.env.GOOGLE_CLIENT_SECRET;delete process.env.AUTH_GOOGLE_SECRET;
  process.env.APP_URL="http://localhost:3000";
  const manual=await createOwner("google-manual@example.test","084444444441","google-manual-register");
  const adminCreated=await admin.POST(request("admin/clients","POST",{
    ownerName:"Google Admin Client",storeName:"Google Admin Store",email:"google-admin@example.test",phone:"084444444442",password,
    planCode:"demo",businessType:"general",address:"QA",city:"QA",
  },adminCookie,"google-admin-create"));
  assert.equal(adminCreated.status,201,JSON.stringify(await adminCreated.clone().json()));
  const adminCreatedTenant=(await adminCreated.json() as {tenantId:string}).tenantId;
  const {privateKey,publicKey}=await generateKeyPair("RS256");
  const googleLogin=async(email:string,subject:string,expectedTenant:string,ip:string)=>{
    const config=await googleIdentity.GET(request("auth/google/identity","GET",undefined,"",`${ip}-config`));
    assert.equal(config.status,200,JSON.stringify(await config.clone().json()));
    const data=await config.json() as {clientId:string;nonce:string};
    assert.equal(data.clientId,process.env.GOOGLE_CLIENT_ID);assert.ok(data.nonce.length>=40);
    const token=await new SignJWT({sub:subject,email,email_verified:true,nonce:data.nonce,name:"Google QA Owner"})
      .setProtectedHeader({alg:"RS256"}).setIssuer("https://accounts.google.com").setAudience(data.clientId).setExpirationTime("2m").sign(privateKey);
    const createdSession=await completeGoogleIdentityLogin(request("auth/google/identity","POST",undefined,session(config),`${ip}-post`),token,publicKey);
    const googleOwner=await (await me.GET(request("auth/me","GET",undefined,createdSession.cookie.split(";")[0]))).json();
    assert.equal(googleOwner.user.role,"owner");assert.equal(googleOwner.user.tenantId,expectedTenant);
    return {config,token};
  };
  const linkedManual=await googleLogin("google-manual@example.test","google-manual-subject",manual.tenantId,"google-manual");
  await assert.rejects(completeGoogleIdentityLogin(request("auth/google/identity","POST",undefined,session(linkedManual.config),"google-manual-replay"),linkedManual.token,publicKey));
  await googleLogin("google-admin@example.test","google-admin-subject",adminCreatedTenant,"google-admin");
  const tenantsBefore=Number((await env.DB.prepare("SELECT COUNT(*) AS total FROM tenants").first<{total:number}>())?.total||0);
  const unknownConfig=await googleIdentity.GET(request("auth/google/identity","GET",undefined,"","google-unknown-config"));
  const unknownData=await unknownConfig.json() as {clientId:string;nonce:string};
  const unknownToken=await new SignJWT({sub:"google-unknown-subject",email:"unknown-google@example.test",email_verified:true,nonce:unknownData.nonce,name:"Unknown"})
    .setProtectedHeader({alg:"RS256"}).setIssuer("https://accounts.google.com").setAudience(unknownData.clientId).setExpirationTime("2m").sign(privateKey);
  await assert.rejects(
    completeGoogleIdentityLogin(request("auth/google/identity","POST",undefined,session(unknownConfig),"google-unknown-post"),unknownToken,publicKey),
    /Email Google belum terdaftar/
  );
  assert.equal(Number((await env.DB.prepare("SELECT COUNT(*) AS total FROM tenants").first<{total:number}>())?.total||0),tenantsBefore);
  const invalidConfig=await googleIdentity.GET(request("auth/google/identity","GET",undefined,"","google-identity-invalid-config"));
  const invalidCookie=session(invalidConfig);
  const forwardedRequest=(origin:string,ip:string)=>new Request("http://internal:8080/api/auth/google/identity",{
    method:"POST",
    headers:{
      origin,
      host:"internal:8080",
      "x-forwarded-host":"cyberdev-pos-app-production.up.railway.app",
      "x-forwarded-proto":"https",
      "sec-fetch-site":"same-origin",
      "content-type":"application/json",
      cookie:invalidCookie,
      "x-forwarded-for":ip,
    },
    body:JSON.stringify({credential:"x".repeat(100)}),
  });
  const hostile=await googleIdentity.POST(forwardedRequest("https://evil.example.test","google-identity-hostile"));
  assert.equal(hostile.status,403,JSON.stringify(await hostile.clone().json()));
  const invalid=await googleIdentity.POST(forwardedRequest("https://cyberdev-pos-app-production.up.railway.app","google-identity-post"));
  assert.equal(invalid.status,401,JSON.stringify(await invalid.clone().json()));
  const replay=await googleIdentity.POST(request("auth/google/identity","POST",{credential:"x".repeat(100)},invalidCookie,"google-identity-replay"));
  assert.equal(replay.status,400);
  assert.equal((await googleIdentity.GET(request("auth/google/identity","GET",undefined,adminCookie,"google-identity-admin"))).status,403);
  if(previous.id===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=previous.id;
  if(previous.secret===undefined)delete process.env.GOOGLE_CLIENT_SECRET;else process.env.GOOGLE_CLIENT_SECRET=previous.secret;
  if(previous.alias===undefined)delete process.env.AUTH_GOOGLE_SECRET;else process.env.AUTH_GOOGLE_SECRET=previous.alias;
  if(previous.url===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous.url;
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
