import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Render first, then initialize Sentry after first paint
createRoot(document.getElementById("root")!).render(<App />);

// Defer Sentry init to avoid blocking first paint
requestIdleCallback(() => {
  import("./lib/sentry").then(({ initSentry }) => initSentry());
}, { timeout: 3000 });
