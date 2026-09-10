"use client";

import { useEffect, useRef } from "react";
import { AdminAuthGate } from "./admin-auth";
import { clearAdminApp, configureAdminApp } from "./admin-fetch";
import { validateAdminOAuthConfig, type AdminAppOptions, type AdminAuthClient } from "./config";

export function AdminApp(options: AdminAppOptions) {
  validateAdminOAuthConfig(options.oauth);
  if (options.auth === undefined) throw new Error("mtm-admin auth client is unavailable");
  const authRef = useRef<AdminAuthClient>(options.auth);
  const auth = authRef.current;
  configureAdminApp({ apiOrigin: options.apiOrigin, auth });

  useEffect(() => {
    return () => {
      clearAdminApp(auth);
    };
  }, [auth, options.apiOrigin]);

  return <AdminAuthGate auth={auth} />;
}

export type { AdminAppOptions, AdminAuthClient, AdminOAuthConfig } from "./config";
