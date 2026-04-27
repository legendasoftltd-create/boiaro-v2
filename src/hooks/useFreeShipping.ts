import { trpc } from "@/lib/trpc";

export interface FreeShippingCampaign {
  id: string;
  name: string;
  is_active: boolean;
  min_order_value: number;
}

export function useFreeShipping(subtotal: number, _areaType?: string) {
  const query = trpc.shipping.freeShipping.useQuery({ subtotal });
  const campaign = (query.data as any) as FreeShippingCampaign | null;

  return {
    campaign,
    isFreeShipping: !!campaign,
    loading: query.isLoading,
  };
}
