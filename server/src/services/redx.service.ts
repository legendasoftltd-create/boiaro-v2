const IS_DEV = process.env.REDX_ENV === "development";
const BASE_URL = IS_DEV
  ? "https://sandbox.redx.com.bd/v1.0.0-beta"
  : process.env.REDX_BASE_URL!;
const TOKEN = IS_DEV
  ? process.env.REDX_SANDBOX_TOKEN!
  : process.env.REDX_API_TOKEN!;

async function redxFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "API-ACCESS-TOKEN": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RedX API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RedxArea {
  id: number;
  name: string;
  post_code: number;
  district_name?: string;
  division_name: string;
  zone_id: number;
}

export interface RedxParcelTrackingEvent {
  message_en: string;
  message_bn: string;
  time: string;
}

export interface RedxParcel {
  tracking_id: string;
  customer_address: string;
  delivery_area: string;
  delivery_area_id: number;
  charge: number;
  customer_name: string;
  customer_phone: string;
  cash_collection_amount: number;
  parcel_weight: number;
  merchant_invoice_id: string;
  status: string;
  instruction: string;
  created_at: string;
  delivery_type: string;
  value: string;
  pickup_location: {
    id: number;
    name: string;
    address: string;
    area_name: string;
    area_id: number;
  };
}

export interface RedxPickupStore {
  id: number;
  name: string;
  address: string;
  area_name: string;
  area_id: number;
  phone: string;
  created_at?: string;
}

export interface RedxCharge {
  deliveryCharge: number;
  codCharge: number;
}

export interface RedxCreateParcelPayload {
  customer_name: string;
  customer_phone: string;
  delivery_area: string;
  delivery_area_id: number;
  customer_address: string;
  cash_collection_amount: string;
  parcel_weight: string;
  merchant_invoice_id?: string;
  instruction?: string;
  value: string;
  pickup_store_id?: number;
  parcel_details_json?: Array<{ name: string; category: string; value: number }>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getAreas(filters?: { post_code?: string; district_name?: string }): Promise<{ areas: RedxArea[] }> {
  const params = new URLSearchParams();
  if (filters?.post_code) params.set("post_code", filters.post_code);
  if (filters?.district_name) params.set("district_name", filters.district_name);
  const qs = params.size ? `?${params}` : "";
  try {
    return await redxFetch<{ areas: RedxArea[] }>(`/areas${qs}`);
  } catch {
    return { areas: [] };
  }
}

export function trackParcel(parcel_id: string) {
  return redxFetch<{ tracking: RedxParcelTrackingEvent[] }>(`/parcel/track/${parcel_id}`);
}

export function getParcelInfo(tracking_id: string) {
  return redxFetch<{ parcel: RedxParcel }>(`/parcel/info/${tracking_id}`);
}

export function createParcel(payload: RedxCreateParcelPayload) {
  return redxFetch<{ tracking_id: string }>("/parcel", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelParcel(tracking_id: string, reason?: string) {
  return redxFetch<{ success: boolean; message: string }>("/parcels", {
    method: "PATCH",
    body: JSON.stringify({
      entity_type: "parcel-tracking-id",
      entity_id: tracking_id,
      update_details: { property_name: "status", new_value: "cancelled", reason },
    }),
  });
}

export function getPickupStores() {
  return redxFetch<{ pickup_stores: RedxPickupStore[] }>("/pickup/stores");
}

export function getPickupStore(pickup_store_id: number) {
  return redxFetch<{ pickup_store: RedxPickupStore }>(`/pickup/store/info/${pickup_store_id}`);
}

export function createPickupStore(payload: { name: string; phone: string; address: string; area_id: number }) {
  return redxFetch<RedxPickupStore>("/pickup/store", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function calculateCharge(params: {
  delivery_area_id: number;
  pickup_area_id: number;
  cash_collection_amount: number;
  weight: number;
}) {
  const qs = new URLSearchParams({
    delivery_area_id: String(params.delivery_area_id),
    pickup_area_id: String(params.pickup_area_id),
    cash_collection_amount: String(params.cash_collection_amount),
    weight: String(params.weight),
  });
  return redxFetch<RedxCharge>(`/charge/charge_calculator?${qs}`);
}
