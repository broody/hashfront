import { useState, useMemo } from "react";
import { useLocation, Navigate } from "react-router-dom";
import GameViewport from "../components/GameViewport";
import LocalHUD from "../components/LocalHUD";

import { useLocalGameState } from "../hooks/useLocalGameState";
import { ALL_MAPS } from "../game/local/maps";

export default function SoloGame() {
  const location = useLocation();
  const { mapName, difficulty } =
    (location.state as {
      mapName?: string;
      difficulty?: string;
    }) ?? {};

  const mapDef = useMemo(
    () => ALL_MAPS.find((m) => m.name === mapName) ?? ALL_MAPS[0],
    [mapName],
  );

  const resolvedDifficulty = difficulty ?? "normal";
  const { loading, restart } = useLocalGameState(mapDef, resolvedDifficulty);
  const [viewportLoaded, setViewportLoaded] = useState(false);
  const isFullyLoaded = !loading && viewportLoaded;

  if (!mapDef) {
    return <Navigate to="/solo" replace />;
  }

  const loadingMessage = useMemo(() => {
    const messages = [
      "INITIALIZING_SOLO_OP",
      "DEPLOYING_AI_TACTICIAN",
      "LOADING_TERRAIN_DATA",
      "CALIBRATING_OPPOSITION",
      "BOOTING_LOCAL_ENGINE",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }, []);

  return (
    <div className="crt-screen w-screen h-screen overflow-hidden relative bg-blueprint-dark">
      {/* Loading overlay */}
      <div
        className={`absolute inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-none ${
          isFullyLoaded ? "opacity-0" : "opacity-100"
        }`}
        style={{
          backgroundColor: "var(--bp-dark)",
          backgroundImage: `
            linear-gradient(var(--bp-grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--bp-grid) 1px, transparent 1px)
          `,
          backgroundSize: "30px 30px",
        }}
      >
        <div className="mb-8 flicker-text">
          <svg width="80" height="80" viewBox="0 0 40 40">
            <g
              transform="skewX(-15) skewY(5) scale(0.9)"
              transform-origin="center"
            >
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
              </g>
              <g
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                opacity="0.3"
                transform="translate(4,4)"
              >
                <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
              </g>
            </g>
            <path
              d="M2 2 H8 M2 2 V8 M32 2 H38 M38 2 V8 M2 38 H8 M2 38 V32 M32 38 H38 M38 38 V32"
              stroke="white"
              strokeWidth="0.5"
            />
          </svg>
        </div>
        <div className="text-2xl tracking-[0.5em] text-white font-mono flicker-text animate-pulse text-center px-4">
          {loadingMessage}
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="w-64 h-1 border border-white/20 relative overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 bg-white/40 ${isFullyLoaded ? "" : "transition-all duration-700 ease-out"}`}
              style={{
                width: viewportLoaded ? "100%" : loading ? "30%" : "70%",
              }}
            />
          </div>
          <div className="text-[10px] text-white/40 font-mono uppercase tracking-[0.3em]">
            Deploying_Local_Engine // {mapDef.name}
          </div>
        </div>
      </div>

      <div className="crt-vignette"></div>
      <div className="haze-bloom w-full h-full relative">
        <GameViewport onLoaded={() => setViewportLoaded(true)} />
        <LocalHUD onRestart={restart} difficulty={resolvedDifficulty} />
      </div>
    </div>
  );
}
