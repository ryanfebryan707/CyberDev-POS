export const paymentMethods = [
  { id: "bri", channel: "Bank", name: "BRI", account: "030601082652500", holder: "Moch Rizky Febryanto" },
  { id: "bni", channel: "Bank", name: "BNI", account: "1857111153", holder: "Moch Rizky Febryanto" },
  { id: "bca", channel: "Bank", name: "BCA", account: "0391598818", holder: "Moch Rizky Febryanto" },
  { id: "gopay", channel: "E-Wallet", name: "GoPay", account: "082244837977", holder: "Moch Rizky Febryanto" },
  { id: "dana", channel: "E-Wallet", name: "DANA", account: "082244837977", holder: "Moch Rizky Febryanto" },
] as const;

export const customerServiceContacts = [
  { label: "CS Utama", phone: "082244837977", wa: "6282244837977" },
  { label: "CS Alternatif", phone: "085234005206", wa: "6285234005206" },
] as const;

export function isPaymentMethod(value: string) {
  return paymentMethods.some((method) => method.id === value);
}

