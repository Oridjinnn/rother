"use client";

import * as React from "react";

import { useLocalStorageState } from "@/lib/use-external-store";

export type User = { name: string; email: string; avatar?: string };
export type BusinessProfile = {
  id: string;
  name: string;
  location: string;
  category?: string;
  categoryId?: string;
  /** P4 / geo-grid: business HQ coordinates (decimal degrees). */
  lat?: number;
  lng?: number;
  /** Canonical OSM anchor (`osm_type/osm_id`). */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; needed by the review collector. */
  gmaps_place_id?: string | null;
  city?: string;
  country?: string;
  postcode?: string;
  unverified?: boolean;
};
export type HubId = "insights" | "reputation" | "competitors" | "tools";

interface AppState {
  user: User | null;
  business: BusinessProfile | null;
  runStarted: boolean;
  hub: HubId | null;
  feature: string | null;
  paletteOpen: boolean;
  login: (u: User) => void;
  logout: () => void;
  setBusiness: (b: BusinessProfile) => void;
  setActiveBusiness: (b: BusinessProfile) => void;
  startRun: () => void;
  openHub: (h: HubId) => void;
  openFeature: (id: string) => void;
  back: () => void;
  setPaletteOpen: (v: boolean) => void;
}

const KEY_USER = "rother.user";
const KEY_BIZ = "rother.business";
const KEY_RUN = "rother.runStarted";

const Ctx = React.createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // B6 / C1: localStorage-backed state via useSyncExternalStore. No mount-time
  // `setState` effect, so there is no hydration flash and no
  // `set-state-in-effect` eslint-disable.
  const [user, setUser] = useLocalStorageState<User | null>(KEY_USER, null);
  const [business, setBusinessState] = useLocalStorageState<BusinessProfile | null>(KEY_BIZ, null);
  const [runStarted, setRunStarted] = useLocalStorageState<boolean>(KEY_RUN, false);
  const [hub, setHub] = React.useState<HubId | null>(null);
  const [feature, setFeature] = React.useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const login = React.useCallback((u: User) => {
    setUser(u);
  }, [setUser]);

  const logout = React.useCallback(() => {
    setUser(null);
    setBusinessState(null);
    setRunStarted(false);
    setHub(null);
    setFeature(null);
    setPaletteOpen(false);
  }, [setUser, setBusinessState, setRunStarted]);

  const setBusiness = React.useCallback((b: BusinessProfile) => {
    // Selecting (or re-selecting) a business resets the run gate — the user
    // must run a scrape for the new business before the hubs are revealed.
    setBusinessState(b);
    setRunStarted(false);
  }, [setBusinessState, setRunStarted]);

  const setActiveBusiness = setBusiness;

  const startRun = React.useCallback(() => {
    setRunStarted(true);
  }, [setRunStarted]);

  const openHub = React.useCallback((h: HubId) => {
    setHub(h);
    setFeature(null);
    setPaletteOpen(false);
  }, []);

  const openFeature = React.useCallback((id: string) => {
    setFeature(id);
    setPaletteOpen(false);
  }, []);

  const back = React.useCallback(() => {
    setFeature((f) => {
      if (f) return null;
      setHub(null);
      return null;
    });
  }, []);

  const value = React.useMemo<AppState>(
    () => ({
      user,
      business,
      runStarted,
      hub,
      feature,
      paletteOpen,
      login,
      logout,
      setBusiness,
      setActiveBusiness,
      startRun,
      openHub,
      openFeature,
      back,
      setPaletteOpen,
    }),
    [user, business, runStarted, hub, feature, paletteOpen, login, logout, setBusiness, setActiveBusiness, startRun, openHub, openFeature, back],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
