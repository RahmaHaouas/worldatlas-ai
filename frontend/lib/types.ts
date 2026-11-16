export type CategoryId = "agriculture" | "industry" | "culture" | "technology" | "resources" | "tourism";
export type SpecialtyType = "cultural" | "production" | "export" | "characteristic";
export type View = "explore" | "specialties" | "compare" | "trade" | "assistant";
export type MapMode = "countries" | CategoryId | "trade";

export interface Category {
  category_id: CategoryId;
  category_name: string;
  description: string;
  icon: string;
  color: string;
}

export interface CountrySummary {
  iso3: string;
  iso2?: string | null;
  name: string;
  region?: string | null;
  capital?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  flag_url?: string | null;
  population?: number | null;
  population_year?: number | null;
  income_level?: string | null;
  specialty_counts?: Partial<Record<CategoryId, number>>;
}

export interface CountryProfile extends CountrySummary {
  official_name?: string;
  area_km2?: number | null;
  area_year?: number | null;
  data_source?: string;
  collected_at?: string;
}

export interface RcaCheck {
  hs_code: string;
  year: number;
  rca?: number | null;
  confirmed: boolean;
  source: string;
}

export interface SpecialtyLink {
  iso3: string;
  country_name: string;
  specialty_id: string;
  specialty_name: string;
  category: CategoryId;
  specialty_type: SpecialtyType;
  importance: "signature" | "major" | "notable";
  evidence_type: string;
  source_id: string;
  source_org: string;
  source_url: string;
  reference_year: number;
  verification_status: "verified" | "curated";
  note?: string;
  hs_code?: string | null;
  collected_at?: string;
  rca_check?: RcaCheck;
}

export interface TradeRow {
  iso3: string;
  hs_code: string;
  year: number;
  export_value: number;
  total_exports: number;
  share_of_world: number;
  share_of_country_exports: number;
  rca: number;
  specialized: boolean;
  rank_by_value: number;
  product_name?: string;
}

export interface CountryDetail {
  profile: CountryProfile;
  specialties: Record<CategoryId, SpecialtyLink[]>;
  specialty_total: number;
  trade: TradeRow[];
  related: { iso3: string; name: string; shared_specialties: number }[];
}

export interface Specialty {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  keywords: string[];
  hs_code?: string | null;
  country_count?: number;
}

export interface TradeWorld {
  status: "ok" | "insufficient_data";
  hs_code: string;
  name: string;
  year: number;
  world_total_exports: number;
  world_product_exports: number;
  reporters_with_totals: number;
  reporters_with_product: number;
  excluded_no_total?: string[];
}

export interface ProductTrade {
  hs_code?: string;
  year: number;
  world: TradeWorld;
  rows: TradeRow[];
  available_years?: number[];
}

export interface SpecialtyDetail {
  specialty: Specialty;
  countries: SpecialtyLink[];
  trade: ProductTrade | null;
}

export interface TradeProduct {
  hs_code: string;
  name: string;
  specialty_id?: string;
}

export interface TradeHistory {
  hs_code: string;
  series: {
    year: number;
    status?: string;
    world_product_exports?: number;
    countries: Record<string, { export_value: number; rca: number } | null>;
  }[];
}

export interface Indicator {
  id: string;
  label: string;
  unit: string;
  comparable: boolean;
  note: string | null;
  values: { iso3: string; value: number | null; year: number | null }[];
}

export interface Comparison {
  countries: { iso3: string; name: string; flag_url?: string; region?: string; capital?: string }[];
  indicators: Indicator[];
  dimensions: {
    category_id: CategoryId;
    category_name: string;
    values: { iso3: string; count: number; items: string[] }[];
  }[];
  shared_specialties: { specialty_id: string; name: string }[];
  unique_specialties: Record<string, { specialty_id: string; name: string }[]>;
  trade: {
    hs_code: string;
    product_name?: string;
    comparable: boolean;
    values: { iso3: string; year: number | null; export_value: number | null; share_of_world: number | null; rca: number | null }[];
  }[];
}

export interface AssistantAnswer {
  question: string;
  answer: string;
  mode: "rag" | "extractive-fallback" | "no-context";
  sources: { id: number; organization: string; url: string; excerpt: string }[];
  records: { id: number; kind: string; text: string; source_org: string; source_url: string }[];
  highlight_countries: string[];
  related_questions: string[];
  index_generated_at?: string;
}

export interface SyncMeta {
  sync: {
    last_sync: string;
    countries: number;
    specialties: number;
    links: number;
    trade_products_with_data: number;
  } | null;
  sources: { source_id: string; organization: string; source_url: string }[];
}
