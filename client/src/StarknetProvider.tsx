import { sepolia, mainnet } from "@starknet-react/chains";
import type { Chain } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, voyager } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import type { SessionPolicies } from "@cartridge/presets";
import { shortString } from "starknet";

// TODO: set to deployed contract address
export const ACTIONS_ADDRESS =
  "0x0605d3a4a0e4f42898b22e250ba126ce7359b3a823b1ce8e6c2e4c9925458f5b";

const policies: SessionPolicies = {
  contracts: {
    [ACTIONS_ADDRESS]: {
      methods: [
        { name: "register_map", entrypoint: "register_map" },
        { name: "create_game", entrypoint: "create_game" },
        { name: "join_game", entrypoint: "join_game" },
        { name: "move_unit", entrypoint: "move_unit" },
        { name: "attack", entrypoint: "attack" },
        { name: "capture", entrypoint: "capture" },
        { name: "wait_unit", entrypoint: "wait_unit" },
        { name: "build_unit", entrypoint: "build_unit" },
        { name: "end_turn", entrypoint: "end_turn" },
      ],
    },
  },
};

const connector = new ControllerConnector({
  policies,
  defaultChainId: shortString.encodeShortString("SN_SEPOLIA"),
});

const provider = jsonRpcProvider({
  rpc: (chain: Chain) => {
    switch (chain) {
      case mainnet:
        return { nodeUrl: "https://api.cartridge.gg/x/starknet/mainnet" };
      case sepolia:
        return { nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" };
      default:
        return null;
    }
  },
});

export default function StarknetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StarknetConfig
      autoConnect
      defaultChainId={sepolia.id}
      chains={[mainnet, sepolia]}
      provider={provider}
      connectors={[connector]}
      explorer={voyager}
    >
      {children}
    </StarknetConfig>
  );
}
