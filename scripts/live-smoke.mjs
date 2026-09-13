import { randomBytes } from "node:crypto";

const baseUrl = process.env.CYBERDEV_LIVE_BASE_URL?.replace(/\/$/, "");
const adminIdentifier = process.env.CYBERDEV_LIVE_ADMIN_IDENTIFIER;
const adminIdentifiers = (process.env.CYBERDEV_LIVE_ADMIN_IDENTIFIERS || adminIdentifier || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const adminPassword = process.env.CYBERDEV_LIVE_ADMIN_PASSWORD;
const testPassword = process.env.CYBERDEV_LIVE_TEST_PASSWORD || `${randomBytes(24).toString("base64url")}A1`;

if (!baseUrl || !adminIdentifier || !adminPassword) {
  throw new Error("CYBERDEV_LIVE_BASE_URL, CYBERDEV_LIVE_ADMIN_IDENTIFIER, and CYBERDEV_LIVE_ADMIN_PASSWORD are required.");
}

const checks = [];
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const digits = `${Date.now()}`.slice(-8);
const demo = {
  email: `qa-demo-${suffix}@example.test`,
  phone: `081${digits}`,
};
const client = {
  email: `qa-client-${suffix}@gmail.com`,
  phone: `082${digits}`,
};

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function request(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json", origin: baseUrl }),
      ...(cookie ? { cookie } : {}),
      "user-agent": "CyberDevProductionVerifier/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { response, data, cookie: cookieFrom(response) };
}

function expect(name, result, expectedStatus, predicate = () => true) {
  const passed = result.response.status === expectedStatus && predicate(result.data);
  checks.push({ name, status: result.response.status, passed });
  if (!passed) {
    const code = result.data && typeof result.data === "object" ? result.data.code || null : null;
    const message = result.data && typeof result.data === "object" && typeof result.data.error === "string"
      ? result.data.error.slice(0, 180)
      : null;
    throw new Error(`${name} failed (HTTP ${result.response.status}${code ? `, ${code}` : ""}${message ? `: ${message}` : ""}).`);
  }
}

const health = await request("/api/health");
expect("database health", health, 200, (data) => data.status === "ok" && data.database === "connected");

const adminLogin = await request("/api/auth/login", {
  method: "POST",
  body: { identifier: adminIdentifier, password: adminPassword },
});
expect("admin login", adminLogin, 200, (data) => data.role === "superadmin" && Boolean(adminLogin.cookie));
const adminCookie = adminLogin.cookie;

const adminMe = await request("/api/auth/me", { cookie: adminCookie });
expect("admin session", adminMe, 200, (data) => data.user?.role === "superadmin" && Boolean(data.user?.id));
const adminUserId = adminMe.data.user.id;

for (const identifier of adminIdentifiers) {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { identifier, password: adminPassword },
  });
  expect(`admin identifier ${identifier.includes("@") ? "email" : identifier.slice(-4)}`, login, 200,
    (data) => data.role === "superadmin" && Boolean(login.cookie));
  const me = await request("/api/auth/me", { cookie: login.cookie });
  expect(`admin identity ${identifier.includes("@") ? "email" : identifier.slice(-4)}`, me, 200,
    (data) => data.user?.role === "superadmin" && data.user?.id === adminUserId);
}

const adminDashboard = await request("/api/admin/clients", { cookie: adminCookie });
expect("admin dashboard API", adminDashboard, 200, (data) => Array.isArray(data.clients));

const demoRegister = await request("/api/auth/register", {
  method: "POST",
  body: {
    name: "CyberDev Demo Verification",
    storeName: "CyberDev Demo Verification Store",
    email: demo.email,
    phone: demo.phone,
    password: testPassword,
    businessType: "general",
    address: "Production smoke test",
    city: "Verification",
  },
});
expect("demo registration", demoRegister, 201, (data) => data.role === "owner" && Boolean(demoRegister.cookie));
const demoCookie = demoRegister.cookie;

const demoMe = await request("/api/auth/me", { cookie: demoCookie });
expect("demo session", demoMe, 200, (data) => data.user?.role === "owner" && data.user?.tenantStatus === "demo");
const demoTenantId = demoMe.data.user.tenantId;
const demoRevision = Number(demoMe.data.user.dataRevision);

const demoDashboardBefore = await request("/api/dashboard", { cookie: demoCookie });
expect("demo dashboard", demoDashboardBefore, 200, (data) =>
  Boolean(data.stats)
  && Array.isArray(data.latest)
  && Array.isArray(data.hourly)
  && Array.isArray(data.topProducts)
  && Array.isArray(data.lowProducts)
  && data.subscription?.hasAccess === true
);

const product = await request("/api/products", {
  method: "POST",
  cookie: demoCookie,
  body: {
    name: "Produk Verifikasi Production",
    category: "Verification",
    barcode: `QA-${suffix}`,
    price: 15000,
    cost: 7000,
    stock: 5,
    unit: "pcs",
  },
});
expect("POS product creation", product, 201, (data) => Number.isInteger(Number(data.id)));

const sale = await request("/api/transactions", {
  method: "POST",
  cookie: demoCookie,
  body: {
    tenantId: demoTenantId,
    offlineId: `live-${suffix}`,
    dataRevision: demoRevision,
    items: [{ productId: Number(product.data.id), qty: 2 }],
    tax: 0,
    discount: 0,
    paymentMethod: "Tunai",
    amountReceived: 50000,
    customerName: "Pelanggan Verifikasi",
  },
});
expect("POS checkout", sale, 201, (data) => data.status === "paid" && data.total === 30000);

const saleRetry = await request("/api/transactions", {
  method: "POST",
  cookie: demoCookie,
  body: {
    tenantId: demoTenantId,
    offlineId: `live-${suffix}`,
    dataRevision: demoRevision,
    items: [{ productId: Number(product.data.id), qty: 2 }],
    tax: 0,
    discount: 0,
    paymentMethod: "Tunai",
    amountReceived: 50000,
    customerName: "Pelanggan Verifikasi",
  },
});
expect("POS idempotent retry", saleRetry, 200, (data) => data.duplicate === true && data.id === sale.data.id);

const qrisSale = await request("/api/transactions", {
  method: "POST",
  cookie: demoCookie,
  body: {
    tenantId: demoTenantId,
    offlineId: `qris-${suffix}`,
    dataRevision: demoRevision,
    items: [{ productId: Number(product.data.id), qty: 1 }],
    tax: 0,
    discount: 0,
    paymentMethod: "QRIS",
    amountReceived: 0,
    customerName: "Pelanggan QRIS Verifikasi",
  },
});
expect("POS QRIS checkout", qrisSale, 201,
  (data) => data.status === "paid" && data.paymentMethod === "QRIS" && data.total === 15000 && data.amountReceived === 15000);

const receipt = await request(`/api/transactions?id=${encodeURIComponent(qrisSale.data.id)}`, { cookie: demoCookie });
expect("receipt keeps barcode and QRIS", receipt, 200, (data) =>
  data.transaction?.paymentMethod === "QRIS"
  && data.transaction?.total === 15000
  && data.transaction?.items?.[0]?.barcode === `QA-${suffix}`
);

const remainingStock = await request("/api/products", { cookie: demoCookie });
expect("barcode product stock updated", remainingStock, 200, (data) =>
  data.products?.some((item) => item.id === Number(product.data.id) && item.barcode === `QA-${suffix}` && Number(item.stock) === 2)
);

const demoDashboardAfter = await request("/api/dashboard", { cookie: demoCookie });
expect("dashboard reflects cash and QRIS sales", demoDashboardAfter, 200,
  (data) => Number(data.stats?.transactionCount) === 2 && Number(data.stats?.revenue) === 45000);

for (const [label, identifier] of [["demo email login", demo.email], ["demo phone login", demo.phone]]) {
  const login = await request("/api/auth/login", { method: "POST", body: { identifier, password: testPassword } });
  expect(label, login, 200, (data) => data.role === "owner" && Boolean(login.cookie));
}

const clientCreate = await request("/api/admin/clients", {
  method: "POST",
  cookie: adminCookie,
  body: {
    ownerName: "CyberDev Client Verification",
    storeName: "CyberDev Client Verification Store",
    email: client.email,
    phone: client.phone,
    password: testPassword,
    planCode: "demo",
    businessType: "general",
    address: "Production smoke test",
    city: "Verification",
  },
});
expect("admin creates client", clientCreate, 201, (data) => data.status === "demo" && Boolean(data.tenantId));

for (const [label, identifier] of [["client email login", client.email], ["client phone login", client.phone]]) {
  const login = await request("/api/auth/login", { method: "POST", body: { identifier, password: testPassword } });
  expect(label, login, 200, (data) => data.role === "owner" && Boolean(login.cookie));
  const dashboard = await request("/api/dashboard", { cookie: login.cookie });
  expect(`${label} dashboard`, dashboard, 200, (data) =>
    Boolean(data.stats)
    && Array.isArray(data.latest)
    && Array.isArray(data.hourly)
    && Array.isArray(data.topProducts)
    && Array.isArray(data.lowProducts)
    && data.subscription?.hasAccess === true
  );
}

const google = await request("/api/auth/google/identity");
expect("Google Identity initialization", google, 200, (data) => typeof data.clientId === "string" && data.clientId.endsWith(".apps.googleusercontent.com") && typeof data.nonce === "string" && Boolean(google.cookie));

console.log(JSON.stringify({
  ok: checks.every((check) => check.passed),
  checks,
  created: {
    demo: { email: demo.email, phone: demo.phone, tenantId: demoTenantId },
    client: { email: client.email, phone: client.phone, tenantId: clientCreate.data.tenantId },
  },
  transactionId: sale.data.id,
  qrisTransactionId: qrisSale.data.id,
}, null, 2));
