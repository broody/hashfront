import { Link } from "react-router-dom";
import { useAccount, useConnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useMemo, useState } from "react";
import { PixelButton } from "../components/PixelButton";
import { PixelPanel } from "../components/PixelPanel";
import { BlueprintContainer } from "../components/BlueprintContainer";

export default function Lobby() {
  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  return (
    <BlueprintContainer>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-[3px] border-white pb-5 mb-2">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-[2px] m-0">
            CHAIN_TACTICS
          </h1>
          <div className="text-sm mt-1 opacity-80">
            &gt; TACTICAL_OVERLAY_ACTIVE [HIGH_VISIBILITY_MODE]
          </div>
        </div>
        <div className="text-right mt-4 md:mt-0 flex flex-col items-end">
          {address ? (
            <PixelButton
              variant="gray"
              onClick={() => controllerConnector.controller.openProfile()}
              className="!py-3 !px-8 text-lg"
            >
              COMMANDER:{" "}
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </PixelButton>
          ) : (
            <PixelButton
              variant="blue"
              onClick={() => connect({ connector: controllerConnector })}
              className="!py-3 !px-10 text-lg"
            >
              CONNECT_SYSTEM
            </PixelButton>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-[2.5fr_1fr] gap-8 flex-1 overflow-hidden">
        <PixelPanel title="Deployment Queue" className="flex flex-col gap-0">
          <div className="space-y-0 overflow-y-auto pr-2 custom-scrollbar flex-1">
            <div className="border-b-2 border-dashed border-white py-5 grid grid-cols-[120px_1fr_180px] items-center gap-4 hover:bg-white/10 transition-colors">
              <div className="text-sm opacity-70">ID: 1024-X</div>
              <div>
                <div className="text-lg font-bold">PLATEAU_RECON</div>
                <div className="text-xs mt-1">
                  MAP: GRASSLANDS_A | SLOTS: 2/2
                </div>
              </div>
              <Link to="/game/test-game-1">
                <PixelButton className="w-full">WATCH_FEED</PixelButton>
              </Link>
            </div>

            <div className="border-b-2 border-dashed border-white py-5 grid grid-cols-[120px_1fr_180px] items-center gap-4 hover:bg-white/10 transition-colors">
              <div className="text-sm opacity-70">ID: 1025-Y</div>
              <div>
                <div className="text-lg font-bold">IRON_BRIDGE_ASSAULT</div>
                <div className="text-xs mt-1">
                  MAP: RIVER_VALLEY | SLOTS: 1/2
                </div>
              </div>
              <PixelButton
                onClick={() => alert("Joining...")}
                className="w-full"
              >
                JOIN
              </PixelButton>
            </div>

            <div className="border-b-2 border-dashed border-white py-5 grid grid-cols-[120px_1fr_180px] items-center gap-4 hover:bg-white/10 transition-colors">
              <div className="text-sm opacity-70">ID: 1026-Z</div>
              <div>
                <div className="text-lg font-bold">DELTA_DEFENSE</div>
                <div className="text-xs mt-1">
                  MAP: COASTAL_LINE | SLOTS: 3/4
                </div>
              </div>
              <PixelButton
                onClick={() => alert("Joining...")}
                className="w-full"
              >
                JOIN
              </PixelButton>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t-2 border-white/20">
            <PixelButton
              variant="green"
              onClick={() => alert("Create Game Logic Here")}
              className="w-full py-4 text-lg"
            >
              DEPLOY NEW OPERATION
            </PixelButton>
          </div>
        </PixelPanel>

        <div className="flex flex-col gap-8 overflow-y-auto">
          <PixelPanel title="System Nav">
            <div className="text-base flex flex-col gap-4">
              <Link
                to="/player/me"
                className="hover:translate-x-2 transition-transform"
              >
                &gt; PROFILE_DB
              </Link>
              <Link
                to="/leaderboard"
                className="hover:translate-x-2 transition-transform"
              >
                &gt; COMMANDER_LOG
              </Link>
              <a href="#" className="hover:translate-x-2 transition-transform">
                &gt; SCHEMATICS
              </a>
              <a href="#" className="hover:translate-x-2 transition-transform">
                &gt; SETTINGS_CFG
              </a>
            </div>
          </PixelPanel>

          <PixelPanel title="Core Status">
            <div className="text-base space-y-3">
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">WINS:</span>
                <span className="font-bold">450</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">LOSS:</span>
                <span className="font-bold">120</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">K/D:</span>
                <span className="font-bold">3.75</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">RANK:</span>
                <span className="font-bold text-blue-400">GENERAL</span>
              </div>
            </div>
          </PixelPanel>
        </div>
      </div>

      <footer className="flex justify-between border-t-[3px] border-white pt-5 mt-2 text-xs md:text-sm">
        <span>CHAIN_TACTICS // DOJO_NETWORK // 2026-02-19</span>
        <span className="hidden md:inline">
          COORDINATES: 42.124 N / 12.042 E
        </span>
      </footer>
    </BlueprintContainer>
  );
}
