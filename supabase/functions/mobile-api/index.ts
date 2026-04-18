import { serve } from "https://deno.land/std/http/server.ts";
import { homepageRoute } from "./routes/homepage.ts";
import { booksRoute } from "./routes/books.ts";
import { authorsRoute } from "./routes/authors.ts";

serve(async (req) => {
  const url = new URL(req.url);

  try {
    if (url.pathname === "/mobile-api/homepage") {
      return await homepageRoute(req);
    }

    if (url.pathname === "/mobile-api/books") {
      return await booksRoute(req);
    }

    if (url.pathname === "/mobile-api/authors") {
      return await authorsRoute(req);
    }

    return new Response(
      JSON.stringify({ status: false, message: "Route not found" }),
      { status: 404 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        status: false,
        message: "Internal Server Error",
        error: error.message
      }),
      { status: 500 }
    );
  }
});