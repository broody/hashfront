const HUD = () => (
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
  </div>
);

export default HUD;
