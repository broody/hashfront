import { useAccount, useConnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useClient } from "urql";
import { PixelButton } from "./PixelButton";
import { PixelPanel } from "./PixelPanel";

const LEGEND: { label: string; color: string }[] = [
  { label: "Grass", color: "#4a7c59" },
  { label: "Mountain", color: "#8b7355" },
  { label: "City", color: "#708090" },
  { label: "Factory", color: "#696969" },
  { label: "HQ", color: "#daa520" },
  { label: "Road", color: "#9e9e9e" },
];

interface GraphEdge<T> {
  node: T;
}

interface TurnStatusQueryResult {
  chainTacticsGameModels: {
    edges: GraphEdge<{ current_player: string | number }>[];
  };
  chainTacticsPlayerStateModels: {
    edges: GraphEdge<{ player_id: string | number; address: string }>[];
  };
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function normalizeAddressHex(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return BigInt(value).toString(16);
  } catch {
    return value.toLowerCase().replace(/^0x/, "");
  }
}

const HUD = () => {
  const { id } = useParams<{ id: string }>();
  const gameId = parseInt(id || "1", 10) || 1;
  const graphqlClient = useClient();

  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const [username, setUsername] = useState<string>();
  const [currentPlayer, setCurrentPlayer] = useState<number | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  useEffect(() => {
    let active = true;

    async function loadTurnStatus() {
      try {
        const query = `
          query {
            chainTacticsGameModels(where: {game_idEQ: ${gameId}}) {
              edges {
                node {
                  current_player
                }
              }
            }
            chainTacticsPlayerStateModels(where: {game_idEQ: ${gameId}}) {
              edges {
                node {
                  player_id
                  address
                }
              }
            }
          }
        `;

        const result = await graphqlClient
          .query<TurnStatusQueryResult>(query, undefined, {
            requestPolicy: "network-only",
          })
          .toPromise();

        if (!active || result.error || !result.data) return;

        const nextCurrentPlayer = toNumber(
          result.data.chainTacticsGameModels.edges[0]?.node.current_player,
        );
        setCurrentPlayer(nextCurrentPlayer > 0 ? nextCurrentPlayer : null);

        if (!address) {
          setMyPlayerId(null);
          return;
        }

        const normalizedAddress = normalizeAddressHex(address);
        const myPlayer = result.data.chainTacticsPlayerStateModels.edges.find(
          (edge) =>
            normalizeAddressHex(edge.node.address) === normalizedAddress,
        )?.node;
        setMyPlayerId(myPlayer ? toNumber(myPlayer.player_id) : null);
      } catch (error) {
        console.error("Failed to load turn status:", error);
      }
    }

    void loadTurnStatus();
    const intervalId = window.setInterval(() => {
      void loadTurnStatus();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [address, gameId, graphqlClient]);

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
        <PixelPanel title="COMMAND_STATUS" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-2 mt-2 text-xs uppercase tracking-widest">
            <div>
              CURRENT TURN:{" "}
              <span className="font-bold">
                {currentPlayer === null ? "UNKNOWN" : `P${currentPlayer}`}
              </span>
            </div>
            <div>
              MY PLAYER ID:{" "}
              <span className="font-bold">
                {myPlayerId === null ? "NOT JOINED" : `P${myPlayerId}`}
              </span>
            </div>
          </div>
        </PixelPanel>
      </div>
    </>
  );
};

export default HUD;
