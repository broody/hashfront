import { RpcProvider } from "starknet";
const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
const ACTIONS_ADDRESS = "0x0605d3a4a0e4f42898b22e250ba126ce7359b3a823b1ce8e6c2e4c9925458f5b";

async function run() {
  const res = await provider.callContract({
    contractAddress: ACTIONS_ADDRESS,
    entrypoint: "get_units",
    calldata: ["1"]
  });
  console.log(res);
}
run();
