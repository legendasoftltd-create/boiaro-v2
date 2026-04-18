export const booksRoute = async (req: Request) => {
  try {

    const url = new URL(req.url);

    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);

    // 👉 raw params (string)
    const featured = url.searchParams.get("featured");
    const audiobook = url.searchParams.get("audiobook");
    const ebook = url.searchParams.get("ebook");
    const hardcopy = url.searchParams.get("hardcopy");

    console.log(featured, audiobook, ebook, hardcopy);
    
    return;

    let books = [
      {
        id: 1,
        title: "Atomic Habits",
        featured: true,
        audiobook: true,
        ebook: true,
        hardcopy: false
      },
      {
        id: 2,
        title: "Deep Work",
        featured: false,
        audiobook: false,
        ebook: true,
        hardcopy: true
      }
    ];

    // =========================
    // 🔥 DYNAMIC FILTER LOGIC
    // =========================

    if (featured !== null) {
      books = books.filter(b => b.featured === (featured === "true"));
    }

    if (audiobook !== null) {
      books = books.filter(b => b.audiobook === (audiobook === "true"));
    }

    if (ebook !== null) {
      books = books.filter(b => b.ebook === (ebook === "true"));
    }

    if (hardcopy !== null) {
      books = books.filter(b => b.hardcopy === (hardcopy === "true"));
    }

    // =========================
    // 📦 PAGINATION
    // =========================
    const paginated = books.slice(offset, offset + limit);

    // =========================
    // 📤 RESPONSE FORMAT
    // =========================
    const response = {
      status: true,
      limit,
      offset,
      total: books.length,

      data: paginated.map(book => ({
        ...book,

        // 👉 dynamic format generate
        available_book_formats: [
          book.audiobook ? "audio" : null,
          book.ebook ? "ebook" : null,
          book.hardcopy ? "hardcopy" : null
        ].filter(Boolean)
      }))
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({
        status: false,
        message: "Books API error",
        error: error.message
      }),
      { status: 500 }
    );
  }
};