export type Asset = {
  rank: number;
  base: string;
  name: string;
  price: number;
  change24h: number;
};

const STABLES = new Set([
  "USDT",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "USDS",
  "PYUSD",
  "USDD",
  "GUSD",
  "USD1",
  "RLUSD",
  "USDP",
  "FRAX",
  "LUSD",
  "CRVUSD",
  "USDG",
  "USDY",
  "GHO",
  "USDB",
  "EURC",
  "EURS",
  "USD0",
  "USDA",
  "SUSDS",
  "SUSDE",
  "UST",
  "USTC",
  "USDN",
  "BUSD",
  "USDX",
  "XAUT",
]);

const ALIAS: Record<string, string> = {
  MIOTA: "IOTA",
  MATIC: "POL",
  RNDR: "RENDER",
  XBT: "BTC",
};

const FA_NAMES: Record<string, string> = {
  BTC: "بیت‌کوین",
  ETH: "اتریوم",
  BNB: "بی‌ان‌بی",
  XRP: "ریپل",
  SOL: "سولانا",
  DOGE: "دوج‌کوین",
  TRX: "ترون",
  ADA: "کاردانو",
  AVAX: "آوالانچ",
  LINK: "چین‌لینک",
  DOT: "پولکادات",
  TON: "تون",
  SHIB: "شیبا",
  BCH: "بیت‌کوین کش",
  LTC: "لایت‌کوین",
  UNI: "یونی‌سواپ",
  ATOM: "کازماس",
  XLM: "استلار",
  NEAR: "نیر",
  APT: "آپتوس",
  SUI: "سویی",
  HBAR: "هدرا",
  PEPE: "پپه",
  ICP: "اینترنت کامپیوتر",
  FIL: "فایل‌کوین",
  ETC: "اتریوم کلاسیک",
  OP: "آپتیمیزم",
  ARB: "آربیتروم",
  INJ: "اینجکتیو",
  AAVE: "آوه",
  RENDER: "رندر",
  FET: "فچ",
  TAO: "بیت‌تنسور",
  SEI: "سِی",
  WLD: "ورلدکوین",
  JUP: "ژوپیتر",
  BONK: "بونک",
  FLOKI: "فلوکی",
  IMX: "ایمیوتبل",
  GRT: "گراف",
  ALGO: "الگورند",
  VET: "وی‌چین",
  THETA: "تتا",
  SAND: "سندباکس",
  MANA: "دیسنترالند",
  AXS: "اکسی اینفینیتی",
  CRV: "کرو",
  LDO: "لیدو",
  RUNE: "تورچین",
  XMR: "مونرو",
  ZEC: "زی‌کش",
  HYPE: "هایپرلیکویید",
  WIF: "داگ‌ویف‌هت",
  ENA: "اتنا",
  WBTC: "بیت‌کوین رپد",
  STETH: "اتریوم استیک لیدو",
  POL: "پالیگان",
  TIA: "سلستیا",
  KAS: "کسپا",
  BGB: "بیت‌گت",
  OKB: "اوکی‌بی",
  CRO: "کرونوس",
  MNT: "منتل",
  ATOM2: "کازماس",
};

type PaprikaRow = {
  rank?: number;
  name?: string;
  symbol?: string;
  quotes?: { USD?: { price?: number; percent_change_24h?: number } };
};

function isStable(base: string, name: string, price: number): boolean {
  if (STABLES.has(base)) return true;
  if (price > 0.9 && price < 1.1 && /stable|tether|usd coin|usdt|usdc/i.test(name)) return true;
  return false;
}

function resolveBase(symbol: string, listed: Set<string>): string | null {
  const upper = symbol.toUpperCase();
  if (listed.has(upper)) return upper;
  const alias = ALIAS[upper];
  if (alias && listed.has(alias)) return alias;
  return null;
}

export function displayName(base: string, english: string): string {
  return FA_NAMES[base] ?? english;
}

export function assembleUniverse(paprika: unknown, binanceSymbols: string[], limit = 100): Asset[] {
  if (!Array.isArray(paprika)) return [];
  const listed = new Set(
    binanceSymbols
      .filter((symbol) => symbol.endsWith("USDT"))
      .map((symbol) => symbol.slice(0, -4)),
  );
  const rows = (paprika as PaprikaRow[])
    .map((row) => {
      const rank = row.rank;
      const symbol = row.symbol?.trim() ?? "";
      const name = row.name?.trim() || symbol;
      const price = row.quotes?.USD?.price;
      const change = row.quotes?.USD?.percent_change_24h;
      if (!rank || rank < 1 || !symbol || price == null || !Number.isFinite(price) || price <= 0) {
        return null;
      }
      return {
        rank,
        symbol,
        name,
        price,
        change: typeof change === "number" && Number.isFinite(change) ? change : 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.rank - b.rank);

  const used = new Set<string>();
  const assets: Asset[] = [];
  for (const row of rows) {
    if (assets.length >= limit) break;
    const base = resolveBase(row.symbol, listed);
    if (!base || used.has(base)) continue;
    if (!/^[A-Z0-9]{2,20}$/.test(base)) continue;
    if (isStable(base, row.name, row.price)) continue;
    used.add(base);
    assets.push({
      rank: row.rank,
      base,
      name: displayName(base, row.name),
      price: row.price,
      change24h: row.change,
    });
  }
  return assets;
}
