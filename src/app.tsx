import { Route, Routes } from "react-router-dom";
import Analytics from "./components/analytics.tsx";
import HomePage from "./pages/homePage.tsx";
import LpStorePage from "./pages/lpStorePage.tsx";

function App() {
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

export default App;
