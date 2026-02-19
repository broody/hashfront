import { BrowserRouter, Route, Routes } from "react-router-dom";
import StarknetProvider from "./StarknetProvider";
import Game from "./pages/Game";
import Leaderboard from "./pages/Leaderboard";
import Lobby from "./pages/Lobby";
import Profile from "./pages/Profile";
import { ToastProvider } from "./components/Toast";

export default function App() {
  return (
    <StarknetProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/game/:id" element={<Game />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/player/:address" element={<Profile />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </StarknetProvider>
  );
}
