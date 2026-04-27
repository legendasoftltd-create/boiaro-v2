import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { CartItem } from "@/contexts/CartContext";

export interface ShippingMethod {
  id: string;
  name: string;
  base_cost: number;
  per_kg_cost: number;
  zone: string | null;
  delivery_days: string | null;
  is_active: boolean;
  provider_code?: string | null;
  delivery_time?: string | null;
}

const DHAKA_DISTRICTS = ["dhaka", "ঢাকা"];

export function useShippingCalculator(cartItems: CartItem[]) {
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [district, setDistrict] = useState("");

  const hardcopyItems = useMemo(
    () => cartItems.filter((i) => i.format === "hardcopy"),
    [cartItems]
  );

  const methodsQuery = trpc.shipping.methods.useQuery({});
  const methods = ((methodsQuery.data as any[]) || []) as ShippingMethod[];

  const areaType = useMemo(() => {
    const d = district.trim().toLowerCase();
    return DHAKA_DISTRICTS.some((dd) => d.includes(dd)) ? "inside_dhaka" : "outside_dhaka";
  }, [district]);

  const availableMethods = useMemo(
    () => methods.filter((m) => !m.zone || m.zone === areaType || m.zone === "all"),
    [methods, areaType]
  );

  useEffect(() => {
    if (availableMethods.length > 0 && !availableMethods.find((m) => m.id === selectedMethodId)) {
      setSelectedMethodId(availableMethods[0].id);
    }
  }, [availableMethods, selectedMethodId]);

  const selectedMethod = availableMethods.find((m) => m.id === selectedMethodId) || null;

  const totalWeight = useMemo(
    () => hardcopyItems.reduce((sum, item) => sum + 0.5 * item.quantity, 0),
    [hardcopyItems]
  );

  const shippingCharge = useMemo(() => {
    if (!selectedMethod || hardcopyItems.length === 0) return 0;
    const extraWeight = Math.max(0, Math.ceil(totalWeight - 0.5));
    return selectedMethod.base_cost + extraWeight * selectedMethod.per_kg_cost;
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
    loading: methodsQuery.isLoading,
  };
}
