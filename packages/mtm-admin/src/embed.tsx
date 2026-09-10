import { createRoot, type Root } from "react-dom/client";
import { OAuthClient } from "mtmharness/auth";
import { AdminApp, type AdminAppOptions } from "./index";
import "./styles.css";

const roots = new WeakMap<Element, Root>();

export function mount(element: Element, options: AdminAppOptions): () => void {
  const auth = options.auth ?? new OAuthClient(options.oauth);
  const created = options.auth === undefined;
  const root = roots.get(element) ?? createRoot(element);
  roots.set(element, root);
  root.render(<AdminApp {...options} auth={auth} />);
  return () => {
    root.unmount();
    roots.delete(element);
    if (created) auth.dispose({ preserveAuthorization: false });
  };
}
