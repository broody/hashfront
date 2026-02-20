import { Link } from "react-router-dom";
import { PixelButton } from "../components/PixelButton";
import { PixelPanel } from "../components/PixelPanel";
import { BlueprintContainer } from "../components/BlueprintContainer";

export default function Leaderboard() {
  return (
    <BlueprintContainer>
      <header className="flex justify-between items-center border-b-[3px] border-white pb-3 md:pb-4 lg:pb-5 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-[2px] m-0 text-white">
            GLOBAL_RANKINGS
          </h1>
          <div className="text-sm mt-1 opacity-80">
            &gt; ELITE_COMMANDERS_DB [SECTOR_01]
          </div>
        </div>
        <div>
          <Link to="/">
            <PixelButton variant="gray" className="!py-1 !px-4">
              &lt; RETURN_TO_LOBBY
            </PixelButton>
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <PixelPanel title="Top Commanders" className="h-full flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse font-mono">
              <thead>
                <tr className="border-b-2 border-white/30">
                  <th className="px-6 py-4 text-sm uppercase font-bold text-white/60">
                    RANK
                  </th>
                  <th className="px-6 py-4 text-sm uppercase font-bold text-white/60">
                    COMMANDER_ID
                  </th>
                  <th className="px-6 py-4 text-sm uppercase font-bold text-white/60 text-right">
                    WINS
                  </th>
                  <th className="px-6 py-4 text-sm uppercase font-bold text-white/60 text-right">
                    LOSS
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white/10 border-b border-white/10 hover:bg-white/20 transition-colors cursor-pointer">
                  <td className="px-6 py-4 text-sm text-yellow-400 font-bold">
                    [001]
                  </td>
                  <td className="px-6 py-4 text-sm">BRD_404</td>
                  <td className="px-6 py-4 text-sm text-right text-green-400 font-bold">
                    450
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-red-400 font-bold">
                    120
                  </td>
                </tr>
                <tr className="border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <td className="px-6 py-4 text-sm text-white/40">[002]</td>
                  <td className="px-6 py-4 text-sm">GHOST_SHELL</td>
                  <td className="px-6 py-4 text-sm text-right text-green-400">
                    380
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-red-400">
                    145
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-6 p-4 border-t-2 border-dashed border-white/20 text-center text-xs text-white/40 uppercase tracking-[3px] italic">
            &gt; GATHERING_REALTIME_INTELLIGENCE...
          </div>
        </PixelPanel>
      </div>

      <footer className="flex justify-between border-t-[3px] border-white pt-5 mt-2 text-xs md:text-sm">
        <span>GLOBAL_RANKINGS // DOJO_NETWORK // 2026-02-19</span>
        <span>STATUS: SYNCHRONIZED</span>
      </footer>
    </BlueprintContainer>
  );
}
