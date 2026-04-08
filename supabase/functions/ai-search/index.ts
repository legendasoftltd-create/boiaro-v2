import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, userId } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 1) {
      return new Response(JSON.stringify({ error: "Query required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch books for context
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const booksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/books?select=id,title,title_en,slug,description,tags,category_id,author_id,rating,is_featured,is_bestseller,is_free,categories(name,name_bn)&submission_status=eq.approved&limit=200`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const books = await booksRes.json();

    // Build book catalog for AI
    const catalog = books
      .map(
        (b: any) =>
          `[${b.id}] "${b.title}"${b.title_en ? ` (${b.title_en})` : ""} | Category: ${b.categories?.name || "N/A"}${b.categories?.name_bn ? ` (${b.categories.name_bn})` : ""} | Rating: ${b.rating || 0} | Tags: ${(b.tags || []).join(", ")} | ${b.is_featured ? "Featured" : ""} ${b.is_bestseller ? "Bestseller" : ""} ${b.is_free ? "Free" : ""}`
      )
      .join("\n");

    // Ask AI to find relevant books
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a book search engine for BoiAro, a Bangla book platform. Given a user search query (which may be in Bangla or English, may contain typos), find the most relevant books from the catalog.

Rules:
- Understand semantic meaning, not just keyword matching
- Handle Bangla text, transliteration, and English queries
- Fix typos and understand intent (e.g. "love story" → romance books, "romoncho" → রোমাঞ্চ/thriller)
- Return book IDs ranked by relevance
- Return max 20 results
- If no good match, return empty array

Respond ONLY with a JSON array of book IDs, e.g. ["id1", "id2"]. No explanation.`,
          },
          {
            role: "user",
            content: `Search query: "${query.trim()}"\n\nBook catalog:\n${catalog}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    // Parse IDs from AI response
    let bookIds: string[] = [];
    try {
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      bookIds = JSON.parse(cleaned);
    } catch {
      // Try to extract IDs with regex
      const matches = content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
      bookIds = matches || [];
    }

    // Fetch full book details for matched IDs
    let results: any[] = [];
    if (bookIds.length > 0) {
      const idsParam = bookIds.map((id: string) => `"${id}"`).join(",");
      const detailRes = await fetch(
        `${SUPABASE_URL}/rest/v1/books?select=id,title,title_en,slug,cover_url,rating,is_free,is_featured,is_bestseller,description,authors(name),categories(name)&id=in.(${idsParam})&submission_status=eq.approved`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      const details = await detailRes.json();

      // Preserve AI ranking order
      const detailMap = new Map(details.map((d: any) => [d.id, d]));
      results = bookIds.filter((id: string) => detailMap.has(id)).map((id: string) => detailMap.get(id));
    }

    return new Response(JSON.stringify({ results, query: query.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
