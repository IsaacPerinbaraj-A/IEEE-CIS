import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/unbounded/500.css";
import "@fontsource/unbounded/600.css";
import "@fontsource-variable/geist";
import "./index.css";
import App from "./App";
import { deviceTier } from "./lib/device";

// Low-power devices get lighter blur layers (see index.css) and fewer particles
document.documentElement.dataset.tier = deviceTier();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
