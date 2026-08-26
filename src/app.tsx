import { Route, Routes } from "react-router-dom";
import Analytics from "./components/analytics.tsx";
import HomePage from "./pages/homePage.tsx";
import ItemAppraisalPage from "./pages/itemAppraisalPage.tsx";
import LpStorePage from "./pages/lpStorePage.tsx";
import MarketOpportunitiesPage from "./pages/marketOpportunitiesPage.tsx";
import MiningPricesPage from "./pages/miningPricesPage.tsx";

function App() {
  return (
    <>
      <Analytics />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lp" element={<LpStorePage />} />
        <Route path="/appraisal" element={<ItemAppraisalPage />} />
        <Route path="/mining" element={<MiningPricesPage />} />
        <Route path="/opportunities" element={<MarketOpportunitiesPage />} />
      </Routes>
    </>
  );
}

export default App;
