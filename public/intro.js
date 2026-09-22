// The landing intro plays on every load of the home page: hide the page chrome before first paint and start at the top.
// Loaded by index.html as a classic blocking script at the start of <body> (it needs document.body). Keep in sync with
// src/components/particles/ParticleStory.tsx and the body[data-intro] rules in src/index.css.
try {
  if (location.pathname === "/" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.dataset.intro = "on";
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }
} catch (e) {}
