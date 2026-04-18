// import { serve } from "https://deno.land/std/http/server.ts";
// import { homepageRoute } from "./routes/homepage.ts";
// import { booksRoute } from "./routes/books.ts";
// import { authorsRoute } from "./routes/authors.ts";

// serve(async (req) => {
//   const url = new URL(req.url);

//   try {
//     if (url.pathname === "/mobile-api/homepage1") {
//       return await homepageRoute(req);
//     }

//     if (url.pathname === "/mobile-api/books") {
//       return await booksRoute(req);
//     }

//     if (url.pathname === "/mobile-api/authors") {
//       return await authorsRoute(req);
//     }

//     return new Response(
//       JSON.stringify({ status: false, message: "Route not found" }),
//       { status: 404 }
//     );

//   } catch (error) {
//     return new Response(
//       JSON.stringify({
//         status: false,
//         message: "Internal Server Error",
//         error: error.message
//       }),
//       { status: 500 }
//     );
//   }
// });




import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { homepageRoute } from "./routes/homepage.ts";

serve(async (req) => {
  const url = new URL(req.url);

  // Simple Router
  if (url.pathname.endsWith("/homepage")) {
    return await homepageRoute(req);
  }

  return new Response(JSON.stringify({ message: "Route Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
});