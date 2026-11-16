import type {
  AssistantAnswer,
  Category,
  Comparison,
  CountryDetail,
  CountrySummary,
  ProductTrade,
  Specialty,
  SpecialtyDetail,
  SyncMeta,
  TradeHistory,
  TradeProduct,
  TradeRow,
} from "./types";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export class ApiFailure extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const cache = new Map<string, Promise<unknown>>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) throw new ApiFailure("NEXT_PUBLIC_API_URL is not configured. Copy .env.example to .env.local.", 0);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiFailure(msg, res.status);
  }
  return body as T;
}

/** GET with in-memory memoisation (data changes at most once per sync). */
function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = request<T>(path).catch((e) => {
      cache.delete(path);
      throw e;
    });
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const api = {
  countries: () => get<{ countries: CountrySummary[] }>("/countries").then((r) => r.countries),
  country: (iso3: string) => get<CountryDetail>(`/countries/${encodeURIComponent(iso3)}`),
  categories: () => get<{ categories: Category[] }>("/categories").then((r) => r.categories),
  meta: () => get<SyncMeta>("/meta"),
  searchSpecialties: (q: string, category?: string) =>
    get<{ results: Specialty[] }>(
      `/specialties?q=${encodeURIComponent(q)}${category ? `&category=${encodeURIComponent(category)}` : ""}`,
    ).then((r) => r.results),
  specialty: (id: string) => get<SpecialtyDetail>(`/specialties/${encodeURIComponent(id)}`),
  compare: (codes: string[]) => get<Comparison>(`/compare?countries=${codes.join(",")}`),
  tradeProducts: () => get<{ years: number[]; products: TradeProduct[] }>("/trade/products"),
  tradeProduct: (hs: string, year?: number) =>
    get<ProductTrade>(`/trade/products/${encodeURIComponent(hs)}${year ? `?year=${year}` : ""}`),
  tradeHistory: (hs: string, countries: string[]) =>
    get<TradeHistory>(`/trade/products/${encodeURIComponent(hs)}/history?countries=${countries.join(",")}`),
  tradeCountry: (iso3: string) => get<{ iso3: string; products: TradeRow[] }>(`/trade/countries/${iso3}`),
  ask: (question: string) =>
    request<AssistantAnswer>("/assistant", { method: "POST", body: JSON.stringify({ question }) }),
};
