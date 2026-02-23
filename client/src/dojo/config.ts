const DEFAULT_TORII_URL = "https://api.cartridge.gg/x/hashfront/torii";
const envToriiUrl = import.meta.env.VITE_TORII_URL?.trim();

if (!envToriiUrl) {
  console.warn(
    "VITE_TORII_URL is not set. Falling back to default Hashfront Torii endpoint.",
  );
}

export const TORII_URL = envToriiUrl || DEFAULT_TORII_URL;

export const WORLD_ADDRESS =
  "0x006eff1d6038059b7fdea330389ef93267a83cbbf0dce5343c8792b5d78d639b";
