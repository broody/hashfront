import { useParams, Link } from "react-router-dom";
import { PixelButton } from "../components/PixelButton";
import { PixelPanel } from "../components/PixelPanel";
import { BlueprintContainer } from "../components/BlueprintContainer";

export default function Profile() {
  const { address } = useParams<{ address: string }>();

  return (
    <BlueprintContainer>
      <header className="flex justify-between items-center border-b-[3px] border-white pb-3 md:pb-4 lg:pb-5 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-[2px] m-0 text-white">
            COMMANDER_PROFILE
          </h1>
          <div className="text-sm mt-1 opacity-80">
            &gt; SECTOR_01_IDENTITY [LOCKED]
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

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
        <PixelPanel title="Commander Identity" className="flex flex-col gap-8">
          <div className="pb-6 border-b-2 border-dashed border-white/20">
            <h2 className="text-xl font-bold mb-4 uppercase text-blue-400 border-l-4 border-blue-400 pl-4">
              Digital Signature
            </h2>
            <div className="bg-blueprint-blue/30 p-5 border-2 border-white/10 shadow-inner">
              <span className="text-xs text-white/50 block mb-2 uppercase tracking-widest">
                BLOCKCHAIN_ADDRESS:
              </span>
              <code className="text-sm break-all font-mono text-green-400 leading-relaxed">
                {address}
              </code>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 p-6 border-2 border-white/10 text-center hover:bg-white/10 transition-colors shadow-lg">
              <span className="block text-3xl font-bold mb-1">450</span>
              <span className="text-xs text-white/40 uppercase tracking-[2px]">
                OPS_TOTAL
              </span>
            </div>
            <div className="bg-green-500/5 p-6 border-2 border-green-500/30 text-center hover:bg-green-500/10 transition-colors shadow-lg shadow-green-500/10">
              <span className="block text-3xl font-bold text-green-400 mb-1">
                320
              </span>
              <span className="text-xs text-green-500/60 uppercase tracking-[2px]">
                VICTORIES
              </span>
            </div>
            <div className="bg-red-500/5 p-6 border-2 border-red-500/30 text-center hover:bg-red-500/10 transition-colors shadow-lg shadow-red-500/10">
              <span className="block text-3xl font-bold text-red-400 mb-1">
                130
              </span>
              <span className="text-xs text-red-500/60 uppercase tracking-[2px]">
                DEFEATS
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-6 text-white/60 uppercase tracking-[3px] border-b border-white/20 pb-2">
              OPERATIONAL_HISTORY_LOG
            </h3>
            <div className="bg-blueprint-blue/20 p-12 border-2 border-dashed border-white/10 text-center">
              <p className="text-xs text-white/30 uppercase italic tracking-widest">
                &gt;
                NO_COMBAT_RECORDS_FOUND_IN_THIS_SECTOR_SEARCHING_REMOTE_DB...
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <PixelButton variant="blue" className="!px-8 !py-3">
              EXPORT_LOGS_TO_LOCAL
            </PixelButton>
          </div>
        </PixelPanel>
      </div>

      <footer className="flex justify-between border-t-[3px] border-white pt-5 mt-2 text-xs md:text-sm">
        <span>COMMAND_DB_LINK // DOJO_NETWORK // 2026-02-19</span>
        <span>ACCESS_LEVEL: RESTRICTED</span>
      </footer>
    </BlueprintContainer>
  );
}
