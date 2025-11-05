'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@openauthjs/openauth/client";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ?? "web";

if (!AUTH_URL) {
  throw new Error("NEXT_PUBLIC_AUTH_URL is not defined");
}

const client = createClient({
  clientID: AUTH_CLIENT_ID,
  issuer: AUTH_URL,
});

type AuthContextValue = {
  userId?: string;
  loaded: boolean;
  loggedIn: boolean;
  login: () => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | undefined>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initializing = useRef(true);
  const [loaded, setLoaded] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const tokenRef = useRef<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!initializing.current) {
      return;
    }

    initializing.current = false;

    if (code && state) {
      void callback(code, state);
      return;
    }

    void authenticate();
  }, []);

  async function authenticate() {
    const token = await refreshTokens();
    if (token) {
      await fetchUser();
    }
    setLoaded(true);
  }

  async function refreshTokens() {
    const refresh = localStorage.getItem("refresh");
    if (!refresh) return;

    const next = await client.refresh(refresh, {
      access: tokenRef.current,
    });

    if (next.err) return;
    if (!next.tokens) return tokenRef.current;

    localStorage.setItem("refresh", next.tokens.refresh);
    tokenRef.current = next.tokens.access;

    return next.tokens.access;
  }

  async function getToken() {
    const token = await refreshTokens();

    if (!token) {
      await login();
      return;
    }

    return token;
  }

  async function login() {
    const { challenge, url } = await client.authorize(
      window.location.origin,
      "code",
      {
        pkce: true,
      },
    );
    sessionStorage.setItem("challenge", JSON.stringify(challenge));
    window.location.href = url;
  }

  async function callback(code: string, state: string) {
    const challenge = sessionStorage.getItem("challenge");
    if (!challenge) {
      window.location.replace("/");
      return;
    }

    const parsed = JSON.parse(challenge);
    if (state !== parsed.state || !parsed.verifier) {
      window.location.replace("/");
      return;
    }

    const exchanged = await client.exchange(
      code,
      window.location.origin,
      parsed.verifier,
    );

    if (!exchanged.err && exchanged.tokens) {
      tokenRef.current = exchanged.tokens.access;
      localStorage.setItem("refresh", exchanged.tokens.refresh);
      await fetchUser();
    }

    window.location.replace("/");
  }

  async function fetchUser() {
    try {
      if (!tokenRef.current) {
        throw new Error("Missing access token");
      }

      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(`Unable to fetch user info (${res.status})`);
      }

      const user = (await res.json()) as { userId?: string };
      setUserId(user.userId);
      setLoggedIn(true);
    } catch (err) {
      console.error("Failed to fetch user information", err);
    }
  }

  function logout() {
    localStorage.removeItem("refresh");
    tokenRef.current = undefined;
    setLoggedIn(false);
    setUserId(undefined);
    window.location.replace("/");
  }

  return (
    <AuthContext.Provider
      value={{
        userId,
        loaded,
        loggedIn,
        login,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
