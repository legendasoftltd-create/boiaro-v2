// Supabase stub — all files that import `supabase` from this module continue to
// compile unchanged. Every call returns an empty/no-op result so pages not yet
// migrated to tRPC degrade gracefully rather than crashing.

const EMPTY_RESULT = { data: null, error: null, count: 0, status: 200, statusText: "OK" };

function makeChain(): any {
  const handler: ProxyHandler<() => void> = {
    get(_target, prop: string | symbol): any {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return (resolve: (v: any) => any) => Promise.resolve(EMPTY_RESULT).then(resolve);
      if (prop === "catch") return (cb: any) => Promise.resolve(EMPTY_RESULT).catch(cb);
      if (prop === "finally") return (cb: any) => Promise.resolve(EMPTY_RESULT).finally(cb);
      if (prop === "getPublicUrl") return (_path: string) => ({ data: { publicUrl: "" }, error: null });
      if (prop === "onAuthStateChange") return (_cb: any) => ({ data: { subscription: { unsubscribe() {} } }, error: null });
      if (prop === "subscribe") return (_cb?: any) => makeChain();
      if (prop === "unsubscribe") return () => undefined;
      if (prop === "data") return null;
      if (prop === "error") return null;
      if (prop === "publicUrl") return "";
      if (prop === "count") return 0;
      return makeChain();
    },
    apply(): any { return makeChain(); },
  };
  return new Proxy(function () {} as () => void, handler);
}

export const supabase: any = makeChain();
