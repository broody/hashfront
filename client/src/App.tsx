import GameViewport from "./components/GameViewport";
import HUD from "./components/HUD";
import StarknetProvider from "./StarknetProvider";

export default function App() {
  return (
    <StarknetProvider>
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
    </StarknetProvider>
  );
}
