import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/contexts/CartContext";

export interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  area_type: string;
  base_charge: number;
  base_weight_kg: number;
  extra_charge_per_kg: number;
  delivery_time: string | null;
  is_active: boolean;
  sort_order: number;
  provider_code: string | null;
}

interface WeightInfo {
  bookId: string;
  weightPerCopy: number;
}

const DHAKA_DISTRICTS = [
  "dhaka", "ঢাকা",
];

export function useShippingCalculator(cartItems: CartItem[]) {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [weights, setWeights] = useState<WeightInfo[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [district, setDistrict] = useState("");
  const [loading, setLoading] = useState(true);

  const hardcopyItems = useMemo(
    () => cartItems.filter((i) => i.format === "hardcopy"),
    [cartItems]
  );

  // Load shipping methods
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("shipping_methods")
        .select("id, name, code, area_type, base_charge, base_weight_kg, extra_charge_per_kg, delivery_time, is_active, sort_order, provider_code")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setMethods((data as any[] || []) as ShippingMethod[]);
      setLoading(false);
    };
    load();
  }, []);

  // Load weights for hardcopy items
  useEffect(() => {
    if (hardcopyItems.length === 0) {
      setWeights([]);
      return;
    }
    const bookIds = hardcopyItems.map((i) => i.book.id);
    const load = async () => {
      const { data } = await supabase
        .from("book_formats")
        .select("book_id, weight_kg_per_copy")
        .in("book_id", bookIds)
        .eq("format", "hardcopy");
      setWeights(
        (data as any[] || []).map((d: any) => ({
          bookId: d.book_id,
          weightPerCopy: Number(d.weight_kg_per_copy) || 0.25,
        }))
      );
    };
    load();
  }, [hardcopyItems]);

  // Calculate total weight
  const totalWeight = useMemo(() => {
    return hardcopyItems.reduce((sum, item) => {
      const w = weights.find((ww) => ww.bookId === item.book.id);
      const perCopy = w?.weightPerCopy || 0.25;
      return sum + perCopy * item.quantity;
    }, 0);
  }, [hardcopyItems, weights]);

  // Determine area type from district
  const areaType = useMemo(() => {
    const d = district.trim().toLowerCase();
    return DHAKA_DISTRICTS.some((dd) => d.includes(dd)) ? "inside_dhaka" : "outside_dhaka";
  }, [district]);

  // Filter methods by area
  const availableMethods = useMemo(
    () => methods.filter((m) => m.area_type === areaType),
    [methods, areaType]
  );

  // Auto-select first available
  useEffect(() => {
    if (availableMethods.length > 0 && !availableMethods.find((m) => m.id === selectedMethodId)) {
      setSelectedMethodId(availableMethods[0].id);
    }
  }, [availableMethods, selectedMethodId]);

  const selectedMethod = availableMethods.find((m) => m.id === selectedMethodId) || null;

  // Calculate charge using ceil logic
  const shippingCharge = useMemo(() => {
    if (!selectedMethod || hardcopyItems.length === 0) return 0;
    const { base_charge, base_weight_kg, extra_charge_per_kg } = selectedMethod;
    if (totalWeight <= base_weight_kg) return base_charge;
    const extraWeight = Math.ceil(totalWeight - base_weight_kg);
    return base_charge + extraWeight * extra_charge_per_kg;
  }, [selectedMethod, totalWeight, hardcopyItems.length]);

  return {
    methods: availableMethods,
    allMethods: methods,
    selectedMethod,
    selectedMethodId,
    setSelectedMethodId,
    district,
    setDistrict,
    areaType,
    totalWeight,
    shippingCharge,
    hardcopyItems,
    hasHardcopy: hardcopyItems.length > 0,
    loading,
  };
}
