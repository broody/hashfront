import { BrowserRouter, Route, Routes } from "react-router-dom";
import StarknetProvider from "./StarknetProvider";
import GraphQLProvider from "./graphql/GraphQLProvider";
import { DojoProvider } from "./dojo/DojoProvider";
import Game from "./pages/Game";
import Leaderboard from "./pages/Leaderboard";
import Lobby from "./pages/Lobby";
import Profile from "./pages/Profile";
import LogoGallery from "./pages/LogoGallery";
import { ToastProvider } from "./components/Toast";
import MusicPlayer from "./components/MusicPlayer";

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
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/player/:address" element={<Profile />} />
                <Route path="/logo-gallery" element={<LogoGallery />} />
              </Routes>
              {/* <MusicPlayer /> */}
            </BrowserRouter>
          </ToastProvider>
        </DojoProvider>
      </GraphQLProvider>
    </StarknetProvider>
  );
}
