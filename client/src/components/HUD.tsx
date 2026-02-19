import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useState } from "react";

const LEGEND: { label: string; color: string }[] = [
  { label: "Grass", color: "#4a7c59" },
  { label: "Mountain", color: "#8b7355" },
  { label: "City", color: "#708090" },
  { label: "Factory", color: "#696969" },
  { label: "HQ", color: "#daa520" },
  { label: "Road", color: "#9e9e9e" },
];

const HUD = () => {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  const controller = connectors[0] as ControllerConnector;
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    if (!address) return;
    controller.username()?.then(setUsername);
  }, [address, controller]);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: "rgba(0,0,0,0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          gap: 24,
          zIndex: 10,
          color: "#fff",
          fontFamily: "monospace",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 1 }}>
          CHAIN TACTICS
        </span>
        {address ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13 }}>
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </span>
            <button
              onClick={() => disconnect()}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 4,
                color: "#fff",
                padding: "4px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => connect({ connector: controller })}
            style={{
              background: "#daa520",
              border: "none",
              borderRadius: 4,
              color: "#000",
              padding: "6px 16px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: "bold",
            }}
          >
            Connect
          </button>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: 56,
          right: 12,
          background: "rgba(0,0,0,0.75)",
          borderRadius: 6,
          padding: "10px 14px",
          zIndex: 10,
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {LEGEND.map((item) => (
          <div
            key={item.label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: item.color,
                display: "inline-block",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
};

export default HUD;
