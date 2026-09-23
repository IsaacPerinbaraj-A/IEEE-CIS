import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/unbounded/500.css";
import "@fontsource/unbounded/600.css";
import "@fontsource-variable/geist";
import "./index.css";
import App from "./App";
import { deviceTier } from "./lib/device";
import { preloadRoute, startRoutePreloading } from "./lib/routes";

// Low-power devices get lighter blur layers (see index.css) and fewer particles
document.documentElement.dataset.tier = deviceTier();

const root = createRoot(document.getElementById("root")!);
const render = () => root.render(<StrictMode><App /></StrictMode>);

// Opening the site on a page other than Home: that page's code was requested together with this bundle
// (vite.config.ts), so wait a moment for it and the page appears whole instead of header first. At most a second.
const firstPage = preloadRoute(window.location.pathname);
if (firstPage) Promise.race([firstPage, new Promise(r => setTimeout(r, 1000))]).then(render, render);
else render();

startRoutePreloading();
