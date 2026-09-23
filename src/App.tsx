import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import ErrorBoundary from "./components/ErrorBoundary";
import { pageRoutes } from "./lib/routes";

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

/**
 * Stands in for a page while its code downloads (a direct visit on a slow connection): the plain page background,
 * a screen tall, so the footer doesn't jump. Links inside the site wait for the code instead (src/lib/pageTransitions.ts).
 */
function PageLoading() {
  return <div data-page-loading className="min-h-[100svh] bg-ink" role="status"><span className="sr-only">Loading the page…</span></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="admin/*" element={<ErrorBoundary fallback={adminError}><Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink text-mute">Loading admin…</div>}><AdminApp /></Suspense></ErrorBoundary>} />
        <Route element={<Layout />}>
          {/* Home is in the main bundle; every other page (src/lib/routeTable.ts) loads its own code */}
          <Route index element={<Home />} />
          {pageRoutes.map(({ path, page: { Page } }) => (
            <Route key={path} path={path} element={<Suspense fallback={<PageLoading />}><Page /></Suspense>} />
          ))}
          {/* The page was called Achievements until Sept 2026; links shared back then still open it */}
          <Route path="achievements" element={<Navigate to="/milestones" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
