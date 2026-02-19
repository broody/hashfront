import {
  useAccount,
  useConnect,
  useProvider,
  useSendTransaction,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { PixelButton } from "./PixelButton";
import { PixelPanel } from "./PixelPanel";
import { useToast } from "./Toast";
import { ACTIONS_ADDRESS } from "../StarknetProvider";

const LEGEND: { label: string; color: string }[] = [
  { label: "Grass", color: "#4a7c59" },
  { label: "Mountain", color: "#8b7355" },
  { label: "City", color: "#708090" },
  { label: "Factory", color: "#696969" },
  { label: "HQ", color: "#daa520" },
  { label: "Road", color: "#9e9e9e" },
];

const HUD = () => {
  const { id } = useParams<{ id: string }>();
  const gameId = parseInt(id || "1", 10) || 1;
  const { provider } = useProvider();

  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const [username, setUsername] = useState<string>();
  const { toast } = useToast();
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );

  const [isJoining, setIsJoining] = useState(false);
  const { sendAsync: sendJoin } = useSendTransaction({
    calls: [
      {
        contractAddress: ACTIONS_ADDRESS,
        entrypoint: "join_game",
        calldata: [gameId.toString(), "2"],
      },
    ],
  });

  const handleJoin = async () => {
    try {
      setIsJoining(true);
      const res = await sendJoin();
      if (res && res.transaction_hash) {
        toast("Joining game... please wait", "info");
        await provider.waitForTransaction(res.transaction_hash);
        toast("You joined the game!", "success");
      }
    } catch (e) {
      toast("Failed to join game.", "error");
      console.error(e);
    } finally {
      setIsJoining(false);
    }
  };

  const [isEnding, setIsEnding] = useState(false);
  const { sendAsync: sendEndTurn } = useSendTransaction({
    calls: [
      {
        contractAddress: ACTIONS_ADDRESS,
        entrypoint: "end_turn",
        calldata: [gameId.toString()],
      },
    ],
  });

  const handleEndTurn = async () => {
    try {
      setIsEnding(true);
      const res = await sendEndTurn();
      if (res && res.transaction_hash) {
        toast("Ending turn... please wait", "info");
        await provider.waitForTransaction(res.transaction_hash);
        toast("You ended your turn.", "warning");
      }
    } catch (e) {
      toast("Failed to end turn.", "error");
      console.error(e);
    } finally {
      setIsEnding(false);
    }
  };

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 h-16 bg-blueprint-blue/60 flex items-center justify-between px-8 z-10 border-b-2 border-white backdrop-blur-sm">
        <span className="text-base font-bold tracking-[2px] uppercase">
          &gt; TACTICAL_DISPLAY
        </span>

        {address ? (
          <div className="flex items-center gap-6">
            <PixelButton
              variant="gray"
              onClick={() => controllerConnector.controller.openProfile()}
              className="!py-1 !px-4"
            >
              COMMANDER:{" "}
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </PixelButton>
          </div>
        ) : (
          <PixelButton
            variant="blue"
            onClick={() => connect({ connector: controllerConnector })}
            className="!py-1 !px-4"
          >
            CONNECT_SYSTEM
          </PixelButton>
        )}
      </div>

      <div className="absolute top-24 left-8 z-10">
        <PixelPanel title="TERRAIN_INTEL" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-3 mt-2">
            {LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span
                  className="w-4 h-4 border border-white"
                  style={{ background: item.color }}
                />
                <span className="text-xs uppercase tracking-widest">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </PixelPanel>
      </div>

      <div className="absolute top-24 right-8 z-10">
        <PixelPanel title="TEST_MODE" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-4 mt-2">
            <PixelButton
              variant="blue"
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full justify-center flex items-center gap-2"
            >
              {isJoining && (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              {isJoining ? "JOINING..." : "JOIN GAME"}
            </PixelButton>
            <PixelButton
              variant="gray"
              onClick={handleEndTurn}
              disabled={isEnding}
              className="w-full justify-center flex items-center gap-2"
            >
              {isEnding && (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              {isEnding ? "ENDING..." : "END TURN"}
            </PixelButton>
          </div>
        </PixelPanel>
      </div>
    </>
  );
};

export default HUD;
