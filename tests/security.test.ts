import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { hashPassword, verifyPassword, validatePassword, clearSessionCookie } from "../lib/auth";
import { googleConfigured, verifyGoogleToken } from "../lib/google-auth";
import { buildReceiptHtml } from "../lib/receipt";
import { postgresQuery } from "../lib/runtime-env";
import { parseProductNumber } from "../lib/spreadsheet";
import { proxy } from "../proxy";

test("passwords have independent salts, verify correctly, and reject weak input",async()=>{
  const a=await hashPassword("CorrectLongPassword12"),b=await hashPassword("CorrectLongPassword12");
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.hash,b.hash);
  assert.equal(await verifyPassword("CorrectLongPassword12",a.hash,a.salt),true);
  assert.equal(await verifyPassword("DifferentPassword12",a.hash,a.salt),false);
  assert.equal(validatePassword("short1"),false);assert.equal(validatePassword("OnlyLettersLong"),false);
  assert.match(clearSessionCookie(),/HttpOnly.*SameSite=Lax/);
});
test("Google token validation rejects wrong audience, nonce, issuer, expiry and unverified email",async()=>{
  process.env.GOOGLE_CLIENT_ID="qa-client";
  const {privateKey,publicKey}=await generateKeyPair("RS256");
  const sign=(claims:Record<string,unknown>={})=>new SignJWT({sub:"google-subject",email:"member@example.test",email_verified:true,nonce:"valid-nonce",...claims}).setProtectedHeader({alg:"RS256"}).setIssuer("https://accounts.google.com").setAudience("qa-client").setExpirationTime("2m").sign(privateKey);
  assert.equal((await verifyGoogleToken(await sign(),"valid-nonce",publicKey)).subject,"google-subject");
  await assert.rejects(verifyGoogleToken(await sign(),"wrong",publicKey));
  await assert.rejects(verifyGoogleToken(await sign({email_verified:false}),"valid-nonce",publicKey));
  for(const [iss,aud,exp] of [["https://evil.test","qa-client",9999999999],["https://accounts.google.com","other-client",9999999999],["https://accounts.google.com","qa-client",1]] as const){
    const token=await new SignJWT({sub:"x",email:"x@example.test",email_verified:true,nonce:"valid-nonce"}).setProtectedHeader({alg:"RS256"}).setIssuer(iss).setAudience(aud).setExpirationTime(exp).sign(privateKey);
    await assert.rejects(verifyGoogleToken(token,"valid-nonce",publicKey));
  }
});
test("Google login stays disabled for a copied client id used as the secret",()=>{
  const previous={id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,url:process.env.APP_URL};
  const id="1013741790568-example.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_ID=id;process.env.GOOGLE_CLIENT_SECRET=id;process.env.APP_URL="https://cyber-dev-pos.vercel.app";
  assert.equal(googleConfigured(),false);
  process.env.GOOGLE_CLIENT_SECRET="GOCSPX-valid-shaped-secret";
  assert.equal(googleConfigured(),true);
  if(previous.id===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=previous.id;
  if(previous.secret===undefined)delete process.env.GOOGLE_CLIENT_SECRET;else process.env.GOOGLE_CLIENT_SECRET=previous.secret;
  if(previous.url===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous.url;
});
test("cross-origin, invalid JSON and oversized mutations are rejected",async()=>{
  process.env.APP_URL="http://localhost:3000";
  const request=(headers:Record<string,string>,body:string)=>new NextRequest("http://localhost:3000/api/products",{method:"POST",headers,body});
  assert.equal((await proxy(request({origin:"https://evil.test","content-type":"application/json"},"{}"))).status,403);
  assert.equal((await proxy(request({"content-type":"application/json"},"{}"))).status,403);
  assert.equal((await proxy(request({origin:"http://localhost:3000","content-type":"application/json"},"{"))).status,400);
  assert.equal((await proxy(request({origin:"http://localhost:3000","content-type":"application/json"},JSON.stringify({name:"x".repeat(1048600)})))).status,413);
  assert.equal((await proxy(request({origin:"http://localhost:3000","content-type":"application/json"},'{"password":1234}'))).status,400);
});
test("receipt escapes user HTML and spreadsheet quantities preserve decimals",()=>{
  const html=buildReceiptHtml({transactionId:"T1",storeName:"<img src=x onerror=alert(1)>",cashierName:"Kasir",customerName:"<script>alert(1)</script>",createdAt:Date.now(),items:[],subtotal:100,tax:0,discount:0,total:100,paymentMethod:"Tunai",amountReceived:100,changeAmount:0});
  assert.doesNotMatch(html,/<script>alert\(1\)/);assert.match(html,/&lt;script&gt;/);
  assert.equal(parseProductNumber("1,5"),1.5);assert.equal(parseProductNumber("1.500"),1500);assert.equal(parseProductNumber(1.5),1.5);
});
test("SQL placeholders and camel-case aliases preserve literals",()=>{
  assert.equal(postgresQuery("SELECT '?' AS value, created_at AS createdAt FROM users WHERE id=?"),'SELECT \'?\' AS value, created_at AS "createdAt" FROM users WHERE id=$1');
});
