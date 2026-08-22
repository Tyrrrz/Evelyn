import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app.tsx";
import { restoreRedirectedPath } from "./spaRedirect.ts";

restoreRedirectedPath();

const base = import.meta.env.BASE_URL ?? "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={base}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
