import { useParams } from "react-router-dom";
import { useState, useMemo } from "react";
import GameViewport from "../components/GameViewport";
import HUD from "../components/HUD";
import { useGameState } from "../hooks/useGameState";

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const { loading: dataLoading, error } = useGameState(id);
  const [viewportLoaded, setViewportLoaded] = useState(false);
  const isFullyLoaded = !dataLoading && viewportLoaded;

  const loadingMessage = useMemo(() => {
    const messages = [
      "ESTABLISHING_BATTLE_UPLINK",
      "MAPPING_ENGAGEMENT_ZONE",
      "DEPLOYING_TACTICAL_ASSETS",
      "SYNCING_SECTOR_COORDINATES",
      "LOADING_MISSION_PARAMETERS",
      "BOOTING_TACTICAL_OVERLAY",
      "CALIBRATING_COMMAND_CONSOLE",
      "INITIATING_HUD_OVERLAY",
      "VERIFYING_SECTOR_PROOF",
      "STREAMING_TACTICAL_DATA",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }, []);

  if (error) {
    return (
      <div className="crt-screen w-screen h-screen flex flex-col items-center justify-center bg-blueprint-dark text-red-500 font-mono gap-4">
        <div className="text-2xl tracking-[0.5em] flicker-text">
          SYSTEM_ERROR
        </div>
        <div className="text-sm border border-red-500/50 p-4 bg-red-500/10">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="crt-screen w-screen h-screen overflow-hidden relative bg-blueprint-dark">
      {/* Consistent Tactical Loading Overlay */}
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
                width: viewportLoaded ? "100%" : dataLoading ? "30%" : "70%",
              }}
            />
            <div className="absolute inset-0 bg-white/10 animate-[scanline_2s_linear_infinite]" />
          </div>
          <div className="text-[10px] text-white/40 font-mono uppercase tracking-[0.3em]">
            {dataLoading ? "Syncing_Dojo_State" : "Booting_Tactical_Display"} //
            Sector_{id}
          </div>
        </div>
      </div>

      <div className="crt-vignette"></div>
      <div className="haze-bloom w-full h-full relative">
        <GameViewport key={id} onLoaded={() => setViewportLoaded(true)} />
        <HUD />
      </div>
    </div>
  );
}
