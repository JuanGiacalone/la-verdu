import { Theme } from "@astryxdesign/core/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./layers.css";
import "./index.css";
import { App } from "./App.js";
import { defaultThemeSlug, themes } from "./astryx-themes";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Theme theme={themes[defaultThemeSlug]} mode="light">
        <App />
      </Theme>
    </StrictMode>,
  );
}
