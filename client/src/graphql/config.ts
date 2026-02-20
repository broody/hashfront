const DEFAULT_TORII_GRAPHQL_URL =
  "https://api.cartridge.gg/x/hashfront/torii/graphql";
const envToriiGraphqlUrl = import.meta.env.VITE_TORII_GRAPHQL_URL?.trim();

if (!envToriiGraphqlUrl) {
  console.warn(
    "VITE_TORII_GRAPHQL_URL is not set. Falling back to default Hashfront Torii endpoint.",
  );
}

export const TORII_GRAPHQL_URL =
  envToriiGraphqlUrl || DEFAULT_TORII_GRAPHQL_URL;
