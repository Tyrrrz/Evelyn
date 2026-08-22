import { Route, Routes } from "react-router-dom";
import Analytics from "./components/analytics.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LpStorePage } from "./pages/LpStorePage.tsx";

export function App() {
  return (
    <>
      <Analytics />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lp-store" element={<LpStorePage />} />
      </Routes>
    </>
  );
}
