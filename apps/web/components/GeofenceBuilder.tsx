"use client";

import { RULE_BOUNDS, type RoomRules } from "@hideseek/shared";
import {
  ArrowLeft,
  ChevronRight,
  Circle as CircleIcon,
  Crosshair,
  Hexagon,
  LocateFixed,
  Trash2,
  Undo2,
} from "lucide-react";
import { Marker, type MapMouseEvent } from "maplibre-gl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { centerElement, userDotElement, vertexElement } from "@/components/map/markers";
import { useMaplibre } from "@/components/map/useMaplibre";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/Notice";
import { formatDuration, Slider } from "@/components/ui/Slider";
import { friendlyError } from "@/lib/errors";
import {
  analyzeFence,
  bufferFence,
  CIRCLE_RADIUS,
  circlePolygon,
  formatArea,
  formatDistance,
  ISSUE_TEXT,
  MAX_VERTICES,
  polygonFromVertices,
  type LngLat,
} from "@/lib/geofence";
import { loadName } from "@/lib/player";
import { createRoom } from "@/lib/rpc";
import { useGeolocation } from "@/lib/useGeolocation";

type Mode = "polygon" | "circle";
type Step = "draw" | "rules";

const DEFAULT_RULES: RoomRules = {
  max_players: 8,
  seeker_count: 2,
  game_duration_mins: 45,
  head_start_secs: 300,
  ping_interval_min_secs: 120,
  ping_interval_max_secs: 300,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function GeofenceBuilder() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, error: mapError } = useMaplibre(containerRef);
  const { fix, status: geoStatus } = useGeolocation(true);

  const [name] = useState(loadName);
  const [mode, setMode] = useState<Mode>("polygon");
  const [step, setStep] = useState<Step>("draw");
  const [vertices, setVertices] = useState<LngLat[]>([]);
  const [center, setCenter] = useState<LngLat | null>(null);
  const [radiusM, setRadiusM] = useState<number>(CIRCLE_RADIUS.default);
  const [rules, setRules] = useState<RoomRules>(DEFAULT_RULES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Name comes from the landing page.
  useEffect(() => {
    if (!name.trim()) router.replace("/");
  }, [name, router]);

  // --- Derived geometry -------------------------------------------------------
  const geometry = useMemo(
    () => (mode === "polygon" ? polygonFromVertices(vertices) : center ? circlePolygon(center, radiusM) : null),
    [mode, vertices, center, radiusM],
  );
  const analysis = useMemo(
    () => analyzeFence(geometry, mode === "polygon" ? vertices.length : undefined),
    [geometry, mode, vertices.length],
  );
  const buffered = useMemo(
    () => (geometry && analysis.issue === null ? bufferFence(geometry) : null),
    [geometry, analysis.issue],
  );
  const valid = analysis.issue === null && buffered !== null;

  // --- Map wiring -------------------------------------------------------------
  const modeRef = useRef(mode);
  const stepRef = useRef(step);
  useEffect(() => {
    modeRef.current = mode;
    stepRef.current = step;
  }, [mode, step]);

  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    const onClick = (e: MapMouseEvent) => {
      if (stepRef.current !== "draw") return;
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (modeRef.current === "polygon") {
        setVertices((v) => (v.length >= MAX_VERTICES ? v : [...v, p]));
      } else {
        setCenter(p);
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  // Keep the map's logical center in the visible area above the bottom sheet.
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!map || !sheet) return;
    const apply = () => map.setPadding({ top: 72, bottom: sheet.offsetHeight, left: 0, right: 0 });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [map]);

  // Jump to the user's location once.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (!map || !fix || jumpedRef.current) return;
    jumpedRef.current = true;
    map.jumpTo({ center: [fix.lng, fix.lat], zoom: 16 });
  }, [map, fix]);

  // User location dot.
  const userMarker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !fix) return;
    userMarker.current ??= new Marker({ element: userDotElement() }).setLngLat([fix.lng, fix.lat]).addTo(map);
    userMarker.current.setLngLat([fix.lng, fix.lat]);
  }, [map, fix]);

  // Fence + buffer rendering.
  useEffect(() => {
    if (!map) return;
    const broken = analysis.issue !== null && analysis.issue !== "TOO_FEW_POINTS";
    const color = broken ? COLORS.seeker : COLORS.hider;
    if (geometry) {
      setGeoJson(map, "fence", feature(geometry, { color }));
    } else if (mode === "polygon" && vertices.length === 2) {
      setGeoJson(map, "fence", feature({ type: "LineString", coordinates: vertices }, { color }));
    } else {
      setGeoJson(map, "fence", null);
    }
    setGeoJson(map, "fence-buffer", buffered ? feature(buffered) : null);
  }, [map, geometry, buffered, analysis.issue, mode, vertices]);

  // Draggable vertex markers (pin-drop polygon mode).
  const vertexMarkers = useRef<Marker[]>([]);
  useEffect(() => {
    if (!map) return;
    const markers = vertexMarkers.current;
    const shown = mode === "polygon" ? vertices : [];
    while (markers.length > shown.length) markers.pop()!.remove();
    shown.forEach((v, i) => {
      const existing = markers[i];
      if (existing) {
        existing.setLngLat(v);
        return;
      }
      const m = new Marker({ element: vertexElement(String(i + 1), i === 0), draggable: true })
        .setLngLat(v)
        .addTo(map);
      m.on("drag", () => {
        const ll = m.getLngLat();
        setVertices((vs) => vs.map((x, j) => (j === i ? ([ll.lng, ll.lat] as LngLat) : x)));
      });
      markers[i] = m;
    });
  }, [map, vertices, mode]);

  // Draggable center marker (quick circle mode).
  const centerMarker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map) return;
    if (mode !== "circle" || !center) {
      centerMarker.current?.remove();
      centerMarker.current = null;
      return;
    }
    if (!centerMarker.current) {
      const m = new Marker({ element: centerElement(), draggable: true }).setLngLat(center).addTo(map);
      m.on("drag", () => {
        const ll = m.getLngLat();
        setCenter([ll.lng, ll.lat]);
      });
      centerMarker.current = m;
    } else {
      centerMarker.current.setLngLat(center);
    }
  }, [map, mode, center]);

  // Remove all markers when the map goes away.
  useEffect(() => {
    if (!map) return;
    const vm = vertexMarkers.current;
    return () => {
      vm.splice(0).forEach((m) => m.remove());
      centerMarker.current?.remove();
      centerMarker.current = null;
      userMarker.current?.remove();
      userMarker.current = null;
    };
  }, [map]);

  // --- Actions ----------------------------------------------------------------
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next === "circle" && !center && map) {
      const c = map.getCenter();
      setCenter([c.lng, c.lat]);
    }
  };

  const locate = () => {
    if (!map || !fix) return;
    map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 16) });
    if (mode === "circle") setCenter([fix.lng, fix.lat]);
  };

  const setRule = <K extends keyof RoomRules>(key: K, value: RoomRules[K]) => {
    setRules((r) => {
      const next = { ...r, [key]: value };
      next.seeker_count = clamp(next.seeker_count, 1, next.max_players - 1);
      if (key === "ping_interval_min_secs") {
        next.ping_interval_max_secs = Math.max(next.ping_interval_max_secs, next.ping_interval_min_secs);
      }
      if (key === "ping_interval_max_secs") {
        next.ping_interval_min_secs = Math.min(next.ping_interval_min_secs, next.ping_interval_max_secs);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!geometry || !buffered || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const room = await createRoom({
        ...rules,
        displayName: name.trim(),
        geofence: geometry,
        geofenceBuffered: buffered,
        areaM2: analysis.areaM2,
      });
      router.replace(`/room/${room.code}`);
    } catch (err) {
      setError(friendlyError(err));
      setSubmitting(false);
    }
  };

  const hiderSlots = rules.max_players - rules.seeker_count;

  // --- UI -----------------------------------------------------------------------
  return (
    <div className="hs-fullscreen-map relative flex-1 overflow-hidden">
      {/* .maplibregl-map forces position:relative, so size it via a wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" data-testid="geofence-map" />
      </div>

      {/* Top bar */}
      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3">
        <Link
          href="/"
          aria-label="Back"
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/80 ring-1 ring-neutral-700 backdrop-blur"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="rounded-full bg-black/80 px-4 py-2 text-sm font-semibold ring-1 ring-neutral-700 backdrop-blur">
          {step === "draw" ? "Draw the play zone" : "Match rules"}
        </div>
        <button
          type="button"
          aria-label="Center on my location"
          onClick={locate}
          disabled={!fix}
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/80 ring-1 ring-neutral-700 backdrop-blur disabled:opacity-40"
        >
          <LocateFixed className="size-5" />
        </button>
      </div>

      {mapError ? (
        <div className="absolute inset-x-4 top-20">
          <ErrorNotice>Map failed to load: {mapError}</ErrorNotice>
        </div>
      ) : null}

      {/* Bottom sheet */}
      <section
        ref={sheetRef}
        className={`pb-safe absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-3xl bg-black/90 px-4 pt-4 ring-1 ring-neutral-800 backdrop-blur-md ${
          step === "rules" ? "max-h-[78vh] overflow-y-auto" : ""
        }`}
      >
        {step === "draw" ? (
          <>
            <div role="tablist" aria-label="Zone mode" className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-900 p-1">
              {(
                [
                  ["polygon", "Pin-drop polygon", Hexagon],
                  ["circle", "Quick circle", CircleIcon],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${
                    mode === m ? "bg-white text-black" : "text-neutral-400"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <p className="text-sm text-neutral-400">
              {mode === "polygon"
                ? "Tap the map to drop pins around the play area. Drag a pin to adjust it."
                : "Tap the map (or drag the pin) to set the center, then size the circle."}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                data-testid="area-readout"
                className={`rounded-full px-3 py-1 font-mono font-semibold ring-1 ${
                  valid ? "text-hider ring-lime-900" : "text-neutral-300 ring-neutral-800"
                }`}
              >
                {analysis.areaM2 > 0 ? formatArea(analysis.areaM2) : "— m²"}
              </span>
              {mode === "polygon" ? (
                <span className="rounded-full px-3 py-1 text-neutral-400 ring-1 ring-neutral-800">
                  {vertices.length} pin{vertices.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="rounded-full px-3 py-1 text-neutral-400 ring-1 ring-neutral-800">
                  r = {formatDistance(radiusM)}
                </span>
              )}
              <span className="text-xs text-neutral-500">dashed line = 12 m GPS drift buffer</span>
            </div>

            {mode === "polygon" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  icon={<Undo2 className="size-4" aria-hidden />}
                  disabled={vertices.length === 0}
                  onClick={() => setVertices((v) => v.slice(0, -1))}
                >
                  Undo last pin
                </Button>
                <Button
                  variant="ghost"
                  icon={<Trash2 className="size-4" aria-hidden />}
                  disabled={vertices.length === 0}
                  onClick={() => setVertices([])}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <Slider
                label="Radius"
                value={radiusM}
                min={CIRCLE_RADIUS.min}
                max={CIRCLE_RADIUS.max}
                step={CIRCLE_RADIUS.step}
                format={formatDistance}
                onChange={setRadiusM}
              />
            )}

            {analysis.issue && (analysis.issue !== "TOO_FEW_POINTS" || vertices.length > 0) ? (
              <ErrorNotice>{ISSUE_TEXT[analysis.issue]}</ErrorNotice>
            ) : null}
            {geoStatus === "denied" ? (
              <p className="flex items-center gap-2 text-xs text-warn">
                <Crosshair className="size-4" aria-hidden /> Location is blocked — you can still draw, but
                you&apos;ll need it to play.
              </p>
            ) : null}

            <Button block disabled={!valid} onClick={() => setStep("rules")} icon={<ChevronRight className="size-5" />}>
              Next: match rules
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <Slider
                label="Max players"
                value={rules.max_players}
                min={RULE_BOUNDS.maxPlayers.min}
                max={RULE_BOUNDS.maxPlayers.max}
                onChange={(v) => setRule("max_players", v)}
              />
              <Slider
                label="Seekers"
                value={rules.seeker_count}
                min={1}
                max={rules.max_players - 1}
                onChange={(v) => setRule("seeker_count", v)}
                hint={`${hiderSlots} hider slot${hiderSlots === 1 ? "" : "s"}`}
              />
              <Slider
                label="Match length"
                value={rules.game_duration_mins}
                min={RULE_BOUNDS.gameDurationMins.min}
                max={RULE_BOUNDS.gameDurationMins.max}
                step={5}
                format={(v) => formatDuration(v * 60)}
                onChange={(v) => setRule("game_duration_mins", v)}
              />
              <Slider
                label="Hider head start"
                value={rules.head_start_secs}
                min={RULE_BOUNDS.headStartSecs.min}
                max={RULE_BOUNDS.headStartSecs.max}
                step={30}
                format={formatDuration}
                onChange={(v) => setRule("head_start_secs", v)}
              />
              <Slider
                label="Ping every — at least"
                value={rules.ping_interval_min_secs}
                min={RULE_BOUNDS.pingIntervalSecs.min}
                max={RULE_BOUNDS.pingIntervalSecs.max}
                step={15}
                format={formatDuration}
                onChange={(v) => setRule("ping_interval_min_secs", v)}
              />
              <Slider
                label="Ping every — at most"
                value={rules.ping_interval_max_secs}
                min={RULE_BOUNDS.pingIntervalSecs.min}
                max={RULE_BOUNDS.pingIntervalSecs.max}
                step={15}
                format={formatDuration}
                onChange={(v) => setRule("ping_interval_max_secs", v)}
                hint="Random gap between pings; 25% faster in the final 10 minutes."
              />
            </div>

            <ErrorNotice>{error}</ErrorNotice>

            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="secondary" onClick={() => setStep("draw")} disabled={submitting}>
                Back
              </Button>
              <Button onClick={submit} loading={submitting} disabled={!valid}>
                Create room
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
