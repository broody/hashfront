import GameViewport from "./components/GameViewport";
import HUD from "./components/HUD";

export default function App() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <GameViewport />
      <HUD />
    </div>
  );
}
