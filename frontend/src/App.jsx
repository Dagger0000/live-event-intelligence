import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { Layout } from "./components/layout/Layout.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import EventBrowser from "./pages/EventBrowser.jsx";
import LiveEventView from "./pages/LiveEventView.jsx";
import { AnalysisPanel, PredictionBoard, AlertManager, PostEventReport, AdminDashboard } from "./pages/OtherPages.jsx";

function ProtectedRoute({ children, analystOnly = false }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (analystOnly && user?.role !== "analyst") return <Navigate to="/events" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { token } = useAuthStore();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/events" /> : <AuthPage />} />
        <Route path="/" element={<Navigate to={token ? "/events" : "/login"} />} />

        <Route path="/events" element={<ProtectedRoute><EventBrowser /></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><LiveEventView /></ProtectedRoute>} />
        <Route path="/events/:id/analysis" element={<ProtectedRoute><AnalysisPanel /></ProtectedRoute>} />
        <Route path="/events/:id/report" element={<ProtectedRoute analystOnly><PostEventReport /></ProtectedRoute>} />

        <Route path="/predictions" element={<ProtectedRoute><PredictionBoard /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute analystOnly><AlertManager /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute analystOnly><AdminDashboard /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
