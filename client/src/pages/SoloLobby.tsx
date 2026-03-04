import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PixelButton } from "../components/PixelButton";
import { PixelPanel } from "../components/PixelPanel";
import { BlueprintContainer } from "../components/BlueprintContainer";
import { ALL_MAPS } from "../game/local/maps";

const DIFFICULTIES = ["easy", "normal", "hard"] as const;

const DIFFICULTY_DESCRIPTIONS: Record<string, string> = {
  easy: "AI makes mistakes and skips some attacks",
  normal: "Balanced AI with adaptive strategy",
  hard: "Aggressive AI with optimal targeting",
};

export default function SoloLobby() {
  const navigate = useNavigate();
  const [selectedMap, setSelectedMap] = useState(ALL_MAPS[0].name);
  const [difficulty, setDifficulty] = useState<string>("normal");

  function handleLaunch() {
    navigate("/solo/play", {
      state: { mapName: selectedMap, difficulty },
    });
  }

  return (
    <BlueprintContainer>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-4 hover:opacity-80 transition-opacity"
          >
            <div className="flicker-text scale-75">
              <svg width="40" height="40" viewBox="0 0 40 40">
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
            <span className="text-xl font-bold tracking-[4px] uppercase">
              HASHFRONT
            </span>
          </Link>
        </div>
        <Link to="/">
          <PixelButton variant="gray" className="!py-1 !px-4">
            BACK_TO_LOBBY
          </PixelButton>
        </Link>
      </div>

      {/* Title */}
      <div className="text-center shrink-0">
        <h2 className="text-2xl font-bold tracking-[6px] uppercase">
          SOLO_OPERATIONS
        </h2>
        <p className="text-xs text-white/40 tracking-[3px] mt-1 uppercase">
          ENGAGE AI OPPOSITION // NO WALLET REQUIRED
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-auto">
        {/* Map Selection */}
        <div className="flex-1">
          <PixelPanel title="SELECT_THEATER" className="!p-4 h-full">
            <div className="flex flex-col gap-3 mt-2">
              {ALL_MAPS.map((map) => (
                <button
                  key={map.name}
                  onClick={() => setSelectedMap(map.name)}
                  className={`w-full text-left p-4 border transition-all ${
                    selectedMap === map.name
                      ? "border-white bg-white/10"
                      : "border-white/20 hover:border-white/50 bg-white/5"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-[2px]">
                      {map.name}
                    </span>
                    <span className="text-[10px] text-white/40 tracking-widest">
                      {map.width}x{map.height}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1 tracking-widest uppercase">
                    {map.startingUnits.filter((u) => u.playerId === 1).length}{" "}
                    UNITS PER SIDE // {map.buildings.length} STRUCTURES
                  </div>
                </button>
              ))}
            </div>
          </PixelPanel>
        </div>

        {/* Difficulty + Launch */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <PixelPanel title="DIFFICULTY" className="!p-4">
            <div className="flex flex-col gap-2 mt-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`w-full text-left p-3 border transition-all ${
                    difficulty === d
                      ? "border-white bg-white/10"
                      : "border-white/20 hover:border-white/50 bg-white/5"
                  }`}
                >
                  <span className="text-sm font-bold uppercase tracking-[2px]">
                    {d.toUpperCase()}
                  </span>
                  <div className="text-[10px] text-white/30 mt-1 tracking-widest">
                    {DIFFICULTY_DESCRIPTIONS[d]}
                  </div>
                </button>
              ))}
            </div>
          </PixelPanel>

          <PixelPanel title="MISSION_BRIEF" className="!p-4">
            <div className="flex flex-col gap-2 mt-2 text-xs tracking-widest uppercase text-white/50">
              <div className="flex justify-between">
                <span>MAP</span>
                <span className="text-white">{selectedMap}</span>
              </div>
              <div className="flex justify-between">
                <span>DIFFICULTY</span>
                <span className="text-white">{difficulty.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>MODE</span>
                <span className="text-white">LOCAL_AI</span>
              </div>
            </div>
          </PixelPanel>

          <PixelButton
            variant="blue"
            onClick={handleLaunch}
            className="w-full !py-4 text-lg"
          >
            LAUNCH_MISSION
          </PixelButton>
        </div>
      </div>
    </BlueprintContainer>
  );
}
