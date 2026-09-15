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

// Loaded only when someone opens /admin, so visitors never download the admin code
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="admin/*" element={<Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink text-mute">Loading admin…</div>}><AdminApp /></Suspense>} />
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
