import { Route, Routes } from "react-router-dom";
import Analytics from "./components/analytics.tsx";
import HomePage from "./pages/homePage.tsx";
import ItemAppraisalPage from "./pages/itemAppraisalPage.tsx";
import LpStorePage from "./pages/lpStorePage.tsx";

function App() {
  return (
    <>
      <Analytics />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lp" element={<LpStorePage />} />
        <Route path="/appraisal" element={<ItemAppraisalPage />} />
      </Routes>
    </>
  );
}

export default App;
