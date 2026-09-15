import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Team from "./pages/Team";
import About from "./pages/About";
import Resources from "./pages/Resources";
import Join from "./pages/Join";
import Contact from "./pages/Contact";
import Achievements from "./pages/Achievements";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";

// Loaded only when someone opens /admin, so visitors never download the admin code
const AdminApp = lazy(() => import("./admin/AdminApp"));

// If the admin code fails to load (often right after the site was redeployed), offer a reload instead of a blank page
const adminError = () => (
  <div className="grid min-h-screen place-items-center bg-ink p-6 text-center" role="alert">
    <div>
      <p className="text-lg text-cream">The admin couldn't load.</p>
      <p className="mt-2 text-mute">The site may have just been updated. Reloading usually fixes it.</p>
      <button className="btn-gold mt-6" onClick={() => window.location.reload()}>Reload</button>
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="admin/*" element={<ErrorBoundary fallback={adminError}><Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink text-mute">Loading admin…</div>}><AdminApp /></Suspense></ErrorBoundary>} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:slug" element={<EventDetail />} />
          <Route path="team" element={<Team />} />
          <Route path="about" element={<About />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="resources" element={<Resources />} />
          <Route path="join" element={<Join />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
