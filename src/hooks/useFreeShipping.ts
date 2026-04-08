import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FreeShippingCampaign {
  id: string;
  name: string;
  is_active: boolean;
  min_order_amount: number;
  area_type: string;
  description: string | null;
}

export function useFreeShipping(subtotal: number, areaType: string) {
  const [campaign, setCampaign] = useState<FreeShippingCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("free_shipping_campaigns")
        .select("id, name, is_active, min_order_amount, area_type, description")
        .eq("is_active", true)
        .order("min_order_amount", { ascending: true });
      setCampaign(null);
      const campaigns = (data as any[] || []) as FreeShippingCampaign[];
      // Find the best matching active campaign
      for (const c of campaigns) {
        if (c.area_type !== "all" && c.area_type !== areaType) continue;
        if (subtotal >= c.min_order_amount) {
          setCampaign(c);
          break;
        }
      }
      setLoading(false);
    };
    load();
  }, [subtotal, areaType]);

  return { campaign, isFreeShipping: !!campaign, loading };
}
