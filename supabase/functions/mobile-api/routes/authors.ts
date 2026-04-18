export const authorsRoute = async (req: Request) => {
  try {

    const url = new URL(req.url);

    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);

    //  token from header
    const token = req.headers.get("Authorization");

    const currentUserId = token ? 1 : null; // mock user id

    let authors = [
      { id: 1, name: "James Clear", followers: [1, 2] },
      { id: 2, name: "Cal Newport", followers: [] }
    ];

    const paginated = authors.slice(offset, offset + limit);

    const response = {
      status: true,
      data: paginated.map(author => ({
        id: author.id,
        name: author.name,

        //  is_followed based on user
        is_followed: currentUserId
          ? author.followers.includes(currentUserId)
          : false
      }))
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        status: false,
        message: "Authors API error",
        error: error.message
      }),
      { status: 500 }
    );
  }
};