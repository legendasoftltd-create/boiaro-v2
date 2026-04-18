export const homepageRoute = async () => {
  try {

    // const response = {
    //   status: true,
    //   data: {
    //     "Recommended For You": [
    //       {
    //         id: 1,
    //         title: "Atomic Habits",
    //         author: "James Clear",
    //         available_book_formats: ["pdf", "audio", "ebook"]
    //       }
    //     ],

    //     "Top 10 Most Read": [
    //       {
    //         id: 2,
    //         title: "Deep Work",
    //         author: "Cal Newport",
    //         available_book_formats: ["pdf"]
    //       }
    //     ],

    //     "Popular Audiobooks": [
    //       {
    //         id: 3,
    //         title: "Rich Dad Poor Dad",
    //         author: "Kiyosaki",
    //         available_book_formats: ["audio"]
    //       }
    //     ],

    //     "Popular Hard Copies": [
    //       {
    //         id: 4,
    //         title: "The Alchemist",
    //         author: "Paulo Coelho",
    //         available_book_formats: ["hardcopy"]
    //       }
    //     ]
    //   }
    // };


    const response = {
      status: true,
      message: "Hello Rakib! Your custom API is working perfectly.",
      timestamp: new Date().toISOString(),
      data: {
        user: {
          name: "Rakib Molla",
          role: "Web Developer",
          project: "NRB Residence"
        },
        system_info: {
          environment: "Supabase Edge Function",
          runtime: "Deno",
          docker_status: "Not Required (Testing Locally)"
        },
        test_features: [
          "Custom API Logic",
          "JSON Response",
          "Error Handling"
        ]
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        status: false,
        message: "Homepage error",
        error: error.message
      }),
      { status: 500 }
    );
  }
};