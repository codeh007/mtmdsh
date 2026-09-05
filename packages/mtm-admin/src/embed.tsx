import { createRoot, type Root } from "react-dom/client";
import { AdminApp, type AdminAppOptions } from "./index";
import "./styles.css";

const roots = new WeakMap<Element, Root>();

export function mount(element: Element, options: AdminAppOptions): () => void {
  const root = roots.get(element) ?? createRoot(element);
  roots.set(element, root);
  root.render(<AdminApp {...options} />);
  return () => {
    root.unmount();
    roots.delete(element);
  };
}
