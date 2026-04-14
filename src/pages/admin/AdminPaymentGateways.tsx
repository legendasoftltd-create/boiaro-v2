import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Settings, CreditCard, Wallet, Banknote, Globe, Save, ChevronDown, ChevronUp, Eye, EyeOff, FlaskConical } from "lucide-react";
import { useAdminLogger } from "@/hooks/useAdminLogger";

interface Gateway {
  id: string;
  gateway_key: string;
  label: string;
  is_enabled: boolean;
  mode: string;
  sort_priority: number;
  config: Record<string, any>;
  notes: string | null;
}

const gatewayIcons: Record<string, typeof CreditCard> = {
  cod: Banknote,
  bkash: Wallet,
  nagad: Wallet,
  sslcommerz: Globe,
  stripe: CreditCard,
  paypal: Globe,
  razorpay: CreditCard,
  demo: FlaskConical,
};

const gatewayConfigFields: Record<string, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  demo: [{ key: "description", label: "Description", placeholder: "Demo/test payment - no real charge" }],
  cod: [{ key: "note", label: "Note to customers", placeholder: "Pay when you receive your order" }],
  bkash: [{ key: "description", label: "Description" }],
  nagad: [{ key: "description", label: "Description" }],
  sslcommerz: [
    { key: "store_id", label: "Store ID", placeholder: "your_store_id" },
    { key: "store_password", label: "Store Password", secret: true, placeholder: "••••••••" },
    { key: "success_url", label: "Success URL", placeholder: "/checkout/success" },
    { key: "fail_url", label: "Fail URL", placeholder: "/checkout/fail" },
    { key: "cancel_url", label: "Cancel URL", placeholder: "/checkout/cancel" },
    { key: "ipn_url", label: "IPN / Webhook URL", placeholder: "https://..." },
  ],
  stripe: [
    { key: "publishable_key", label: "Publishable Key", placeholder: "pk_test_..." },
    { key: "secret_key", label: "Secret Key", secret: true, placeholder: "sk_test_..." },
    { key: "webhook_secret", label: "Webhook Secret", secret: true, placeholder: "whsec_..." },
  ],
  paypal: [
    { key: "client_id", label: "Client ID", placeholder: "AY..." },
    { key: "secret", label: "Secret", secret: true, placeholder: "••••••••" },
  ],
  razorpay: [
    { key: "key_id", label: "Key ID", placeholder: "rzp_test_..." },
    { key: "key_secret", label: "Key Secret", secret: true, placeholder: "••••••••" },
  ],
};

export default function AdminPaymentGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const { log } = useAdminLogger();

  const load = async () => {
    const { data } = await supabase.rpc("admin_get_payment_gateways" as any);
    setGateways((data as any[]) || []);
  };

  useEffect(() => { load(); }, []);

  const updateGateway = async (gw: Gateway) => {
    setSaving(gw.id);
    const { error } = await supabase
      .from("payment_gateways")
      .update({
        label: gw.label,
        is_enabled: gw.is_enabled,
        mode: gw.mode,
        sort_priority: gw.sort_priority,
        config: gw.config,
        notes: gw.notes,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", gw.id);
    setSaving(null);
    if (error) { toast.error("Failed to save"); return; }
    await log({ module: "payments", action: `Gateway ${gw.label} updated`, actionType: "update", targetType: "payment_gateway", targetId: gw.id, details: `Updated gateway: ${gw.gateway_key} (${gw.is_enabled ? "enabled" : "disabled"}, ${gw.mode})`, riskLevel: "high" });
    toast.success(`${gw.label} settings saved`);
  };

  const toggleEnabled = async (gw: Gateway) => {
    const updated = { ...gw, is_enabled: !gw.is_enabled };
    setGateways(prev => prev.map(g => g.id === gw.id ? updated : g));
    await updateGateway(updated);
  };

  const updateField = (id: string, field: keyof Gateway, value: any) => {
    setGateways(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const updateConfig = (id: string, key: string, value: string) => {
    setGateways(prev => prev.map(g =>
      g.id === id ? { ...g, config: { ...g.config, [key]: value } } : g
    ));
  };

  const hasMode = (key: string) => !["cod", "bkash", "nagad"].includes(key);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold  text-black">
             Payment Gateways
          </h1>
         
        </div>
        <Badge variant="outline" className="text-xs text-black">
          {gateways.filter(g => g.is_enabled).length} active
        </Badge>
      </div>

      <div className="space-y-3">
        {gateways.map(gw => {
          const Icon = gatewayIcons[gw.gateway_key] || CreditCard;
          const expanded = expandedId === gw.id;
          const fields = gatewayConfigFields[gw.gateway_key] || [];

          return (
            <Card key={gw.id} className={`border transition-colors  ${gw.is_enabled ? "border-primary/30" : "border-primary/30"}`}>
              <CardHeader className="p-4 pb-0 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10  rounded-lg flex items-center justify-center ${gw.is_enabled ? "bg-white" : "bg-[#EF4444]"}`}>
                      <Icon className={`w-5 h-5 ${gw.is_enabled ? "text-primary" : "text-white"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{gw.label}</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-[10px] ${gw.is_enabled ? "bg-white text-green-500" : "bg-white text-black"}`}>
                          {gw.is_enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {hasMode(gw.gateway_key) && (
                          <Badge variant="outline" className="text-[10px] text-white border border-white">
                            {gw.mode === "live" ? "Live" : "Test"}
                          </Badge>
                        )}
                        <span className="text-[10px] text-white">Priority: {gw.sort_priority}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={gw.is_enabled} onCheckedChange={() => toggleEnabled(gw)} />
                    <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : gw.id)}>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expanded && (
                <CardContent className="p-4 pt-4 space-y-4 border-t border-border/40 mt-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Display Label</Label>
                      <Input
                        value={gw.label}
                        onChange={e => updateField(gw.id, "label", e.target.value)}
                        className="mt-1 "
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Sort Priority</Label>
                      <Input
                        type="number"
                        value={gw.sort_priority}
                        onChange={e => updateField(gw.id, "sort_priority", parseInt(e.target.value) || 0)}
                        className="mt-1 "
                      />
                    </div>
                    {hasMode(gw.gateway_key) && (
                      <div>
                        <Label className="text-xs">Mode</Label>
                        <Select value={gw.mode} onValueChange={v => updateField(gw.id, "mode", v)}>
                          <SelectTrigger className="mt-1 ">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="test">Test / Sandbox</SelectItem>
                            <SelectItem value="live">Live / Production</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {fields.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {fields.map(f => (
                          <div key={f.key}>
                            <Label className="text-xs flex items-center gap-1.5">
                              {f.label}
                              {f.secret && (
                                <button
                                  onClick={() => setShowSecrets(prev => ({ ...prev, [`${gw.id}-${f.key}`]: !prev[`${gw.id}-${f.key}`] }))}
                                  className=""
                                >
                                  {showSecrets[`${gw.id}-${f.key}`] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                              )}
                            </Label>
                            <Input
                              type={f.secret && !showSecrets[`${gw.id}-${f.key}`] ? "password" : "text"}
                              value={gw.config[f.key] || ""}
                              onChange={e => updateConfig(gw.id, f.key, e.target.value)}
                              placeholder={f.placeholder}
                              className="mt-1  font-mono text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Admin Notes</Label>
                    <Textarea
                      value={gw.notes || ""}
                      onChange={e => updateField(gw.id, "notes", e.target.value)}
                      placeholder="Internal notes..."
                      className="mt-1  text-xs"
                      rows={2}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => updateGateway(gw)} disabled={saving === gw.id} className="gap-2">
                      <Save className="w-4 h-4" />
                      {saving === gw.id ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
