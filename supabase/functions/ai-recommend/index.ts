import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bookId, userId, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

    let prompt = "";
    let catalog = "";

    // Fetch book catalog
    const booksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/books?select=id,title,title_en,slug,cover_url,rating,tags,category_id,author_id,is_featured,is_bestseller,is_free,categories(name)&submission_status=eq.approved&limit=200`,
      { headers }
    );
    const booksRaw = await booksRes.json();
    const books = Array.isArray(booksRaw) ? booksRaw : [];
    catalog = books.map((b: any) =>
      `[${b.id}] "${b.title}" | Cat: ${b.categories?.name || "N/A"} | Rating: ${b.rating || 0} | Tags: ${(b.tags || []).join(",")} | ${b.is_featured ? "★" : ""}`
    ).join("\n");

    if (type === "similar" && bookId) {
      // Similar books
      const book = books.find((b: any) => b.id === bookId);
      if (!book) {
        return new Response(JSON.stringify({ recommendations: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      prompt = `Given this book: "${book.title}" (Category: ${book.categories?.name}, Tags: ${(book.tags || []).join(",")})

Find the 8 most similar books from the catalog. Consider category, tags, themes, and title similarity. Exclude the source book itself.

Respond ONLY with a JSON array of book IDs.`;

    } else if (type === "personalized" && userId) {
      // Personalized: fetch user activity
      const actRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_activity_logs?select=event_type,book_id,metadata&user_id=eq.${userId}&order=created_at.desc&limit=50`,
        { headers }
      );
      const activityRaw = await actRes.json();
      const activity = Array.isArray(activityRaw) ? activityRaw : [];

      const viewedBooks = [...new Set(activity.filter((a: any) => a.book_id).map((a: any) => a.book_id))];
      const searches = activity.filter((a: any) => a.event_type === "search").map((a: any) => a.metadata?.query).filter(Boolean);

      prompt = `User behavior:
- Recently viewed book IDs: ${viewedBooks.slice(0, 10).join(", ") || "none"}
- Recent searches: ${searches.slice(0, 5).join(", ") || "none"}

Based on this behavior, recommend 10 books they'd enjoy. Exclude books they already viewed. Consider category patterns, similar themes, and search intent.

Respond ONLY with a JSON array of book IDs.`;

    } else {
      // Trending: just pick popular/featured
      prompt = `From the catalog, pick the 10 books most likely to be trending right now. Prioritize: high rating, featured, bestseller status.

Respond ONLY with a JSON array of book IDs.`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a book recommendation engine. Respond only with a JSON array of book IDs. No explanation." },
          { role: "user", content: `${prompt}\n\nCatalog:\n${catalog}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429 || status === 402) {
        return new Response(JSON.stringify({ error: status === 429 ? "Rate limited" : "Credits exhausted" }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    let bookIds: string[] = [];
    try {
      bookIds = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      const matches = content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
      bookIds = matches || [];
    }

    // Fetch details
    let recommendations: any[] = [];
    if (bookIds.length > 0) {
      const idsParam = bookIds.map((id: string) => `"${id}"`).join(",");
      const detailRes = await fetch(
        `${SUPABASE_URL}/rest/v1/books?select=id,title,title_en,slug,cover_url,rating,is_free,is_featured,authors(name),categories(name)&id=in.(${idsParam})`,
        { headers }
      );
      const details = await detailRes.json();
      if (Array.isArray(details)) {
        const detailMap = new Map(details.map((d: any) => [d.id, d]));
        recommendations = bookIds.filter((id: string) => detailMap.has(id)).map((id: string) => detailMap.get(id));
      } else {
        console.error("ai-recommend: book details query returned non-array:", JSON.stringify(details));
      }
    }

    return new Response(JSON.stringify({ recommendations, type: type || "trending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-recommend error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Recommendation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
