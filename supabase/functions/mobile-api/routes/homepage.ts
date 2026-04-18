export const homepageRoute = async (req: Request) => {
  try {
    const response = {
      status: true,
      message: "Hello Rakib! API is now accessible.",
      timestamp: new Date().toISOString(),
      data: {
        user: "Rakib Molla",
        project: "NRB Residence",
        note: "Security key verification disabled for testing"
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: false, error: error.message }), { 
      status: 500 
    });
  }
};