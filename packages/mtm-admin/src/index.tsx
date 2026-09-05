"use client";

import { OAuthClient } from "mtmharness/auth";
import { useEffect, useRef } from "react";
import { AdminAuthGate } from "./admin-auth";
import { clearAdminApp, configureAdminApp } from "./admin-fetch";
import { validateAdminOAuthConfig, type AdminAppOptions, type AdminAuthClient } from "./config";

export function AdminApp(options: AdminAppOptions) {
  validateAdminOAuthConfig(options.oauth);
  const authRef = useRef<AdminAuthClient | undefined>(undefined);
  const ownsAuthRef = useRef(false);
  if (authRef.current === undefined) {
    authRef.current = options.auth ?? new OAuthClient(options.oauth);
    ownsAuthRef.current = options.auth === undefined;
  }
  const auth = authRef.current;
  if (auth === undefined) throw new Error("mtm-admin auth client is unavailable");
  configureAdminApp({ apiOrigin: options.apiOrigin, auth });

  useEffect(() => {
    return () => {
      clearAdminApp(auth);
      if (ownsAuthRef.current) auth.dispose({ preserveAuthorization: false });
    };
  }, [auth, options.apiOrigin]);

  return <AdminAuthGate auth={auth} />;
}

export type { AdminAppOptions, AdminAuthClient, AdminOAuthConfig } from "./config";
