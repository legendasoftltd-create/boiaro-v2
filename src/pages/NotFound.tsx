import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-4">
      <div className="text-center animate-fade-in-up">
        <h1 className="text-7xl font-serif font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-foreground font-medium mb-2">Page not found</p>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild className="btn-gold gap-2">
            <Link to="/"><Home className="w-4 h-4" /> Go Home</Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2 rounded-xl">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
