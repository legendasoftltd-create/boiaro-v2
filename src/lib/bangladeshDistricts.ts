const BASE_DISTRICTS = [
  "Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh",
  "Comilla", "Gazipur", "Narayanganj", "Tangail", "Narsingdi", "Manikganj", "Munshiganj",
  "Faridpur", "Gopalganj", "Madaripur", "Rajbari", "Shariatpur", "Kishoreganj", "Netrokona",
  "Sherpur", "Jamalpur", "Brahmanbaria", "Chandpur", "Lakshmipur", "Noakhali", "Feni",
  "Coxs Bazar", "Rangamati", "Bandarban", "Khagrachhari", "Bogra", "Chapainawabganj",
  "Joypurhat", "Naogaon", "Natore", "Nawabganj", "Pabna", "Sirajganj", "Bagerhat",
  "Chuadanga", "Jessore", "Jhenaidah", "Kushtia", "Magura", "Meherpur", "Narail",
  "Satkhira", "Barguna", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur",
  "Habiganj", "Moulvibazar", "Sunamganj", "Dinajpur", "Gaibandha", "Kurigram",
  "Lalmonirhat", "Nilphamari", "Panchagarh", "Thakurgaon",
];

export const DISTRICTS = import.meta.env.VITE_REDX_ENV === "development"
  ? ["Test District", ...BASE_DISTRICTS]
  : BASE_DISTRICTS;

export const DHAKA_DISTRICTS = ["Dhaka", "Gazipur", "Narayanganj", "Manikganj", "Munshiganj", "Narsingdi"];

export function isDhakaArea(district: string): boolean {
  return DHAKA_DISTRICTS.some(d => d.toLowerCase() === district.trim().toLowerCase());
}

// Maps our district names to the spellings RedX production API recognises
const REDX_DISTRICT_MAP: Record<string, string> = {
  "Chattogram":       "Chittagong",
  "Barishal":         "Barisal",
  "Narsingdi":        "Norshingdi",
  "Lakshmipur":       "Laksmipur",
  "Coxs Bazar":       "Cox's Bazar",
  "Khagrachhari":     "Khagrachari",
  "Chapainawabganj":  "Chapai Nawabganj",
  "Jhalokati":        "Jhalokathi",
  "Pirojpur":         "Perojpur",
};

export function toRedxDistrictName(district: string): string {
  return REDX_DISTRICT_MAP[district] ?? district;
}
