import { BrowserRouter, Route, Routes } from "react-router-dom";
import StarknetProvider from "./StarknetProvider";
import GraphQLProvider from "./graphql/GraphQLProvider";
import { DojoProvider } from "./dojo/DojoProvider";
import Game from "./pages/Game";
import Replay from "./pages/Replay";
import Leaderboard from "./pages/Leaderboard";
import Lobby from "./pages/Lobby";
import Profile from "./pages/Profile";
import LogoGallery from "./pages/LogoGallery";
import MapEditor from "./pages/MapEditor";
import SoloLobby from "./pages/SoloLobby";
import SoloGame from "./pages/SoloGame";
import { ToastProvider } from "./components/Toast";

export default function App() {
  return (
    <StarknetProvider>
      <GraphQLProvider>
        <DojoProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Lobby />} />
                <Route path="/game/:id" element={<Game />} />
                <Route path="/replay/:id" element={<Replay />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/player/:address" element={<Profile />} />
                <Route path="/logo-gallery" element={<LogoGallery />} />
                <Route path="/editor" element={<MapEditor />} />
                <Route path="/solo" element={<SoloLobby />} />
                <Route path="/solo/play" element={<SoloGame />} />
              </Routes>
              {/* <MusicPlayer /> */}
            </BrowserRouter>
          </ToastProvider>
        </DojoProvider>
      </GraphQLProvider>
    </StarknetProvider>
  );
}
