import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./index";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("mtm-admin root is missing");

const config = window.__MTM_ADMIN_CONFIG__;
if (!config) {
  root.textContent = "mtm-admin configuration is missing";
} else {
  createRoot(root).render(<StrictMode><AdminApp {...config} /></StrictMode>);
}
