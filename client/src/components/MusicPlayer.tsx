import { useState, useRef, useEffect, useCallback } from "react";

const TRACKS = [
  { name: "Track 1", src: "/audio/track1.mp3" },
  { name: "Track 2", src: "/audio/track2.mp3" },
  { name: "Track 3", src: "/audio/track3.mp3" },
];

const LS_KEY_MUTED = "music-muted";
const LS_KEY_VOLUME = "music-volume";

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(() => {
    const stored = localStorage.getItem(LS_KEY_MUTED);
    return stored === null ? true : stored === "true";
  });
  const [volume, setVolume] = useState(() => {
    const stored = localStorage.getItem(LS_KEY_VOLUME);
    return stored === null ? 0.5 : parseFloat(stored);
  });

  const track = TRACKS[trackIndex];

  // Sync volume/muted to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // Persist muted/volume
  useEffect(() => {
    localStorage.setItem(LS_KEY_MUTED, String(muted));
  }, [muted]);
  useEffect(() => {
    localStorage.setItem(LS_KEY_VOLUME, String(volume));
  }, [volume]);

  // Play/pause sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, trackIndex]);

  const nextTrack = useCallback(() => {
    setTrackIndex((i) => (i + 1) % TRACKS.length);
  }, []);

  const togglePlay = () => {
    setPlaying((p) => !p);
  };

  const toggleMute = () => {
    setMuted((m) => !m);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="blueprint-panel scanline-anim px-3 py-2 flex items-center gap-3 min-w-0">
        {/* Corner decorations */}
        <svg
          className="absolute top-0 right-0 p-0.5 opacity-20 pointer-events-none"
          width="24"
          height="24"
          viewBox="0 0 40 40"
          fill="none"
        >
          <path d="M0 1H39V40" stroke="white" strokeWidth="1" />
          <circle cx="39" cy="1" r="2" fill="white" />
        </svg>
        <svg
          className="absolute bottom-0 left-0 p-0.5 opacity-20 pointer-events-none"
          width="24"
          height="24"
          viewBox="0 0 40 40"
          fill="none"
        >
          <path d="M40 39H1V0" stroke="white" strokeWidth="1" />
          <circle cx="1" cy="39" r="2" fill="white" />
        </svg>

        <audio
          ref={audioRef}
          src={track.src}
          onEnded={nextTrack}
          preload="auto"
        />

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="text-white hover:text-white/80 transition-colors"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" />
              <rect x="9" y="2" width="4" height="12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="3,2 14,8 3,14" />
            </svg>
          )}
        </button>

        {/* Next Track */}
        <button
          onClick={nextTrack}
          className="text-white hover:text-white/80 transition-colors"
          aria-label="Next track"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="2,2 10,8 2,14" />
            <rect x="11" y="2" width="3" height="12" />
          </svg>
        </button>

        {/* Track Name */}
        <span className="flicker-text font-mono text-[10px] uppercase tracking-widest text-white/80 truncate max-w-[120px]">
          {track.name}
        </span>

        {/* Mute / Volume */}
        <button
          onClick={toggleMute}
          className="text-white hover:text-white/80 transition-colors"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,5 5,5 9,2 9,14 5,11 2,11" />
              <line
                x1="11"
                y1="5"
                x2="15"
                y2="11"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="15"
                y1="5"
                x2="11"
                y2="11"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,5 5,5 9,2 9,14 5,11 2,11" />
              <path
                d="M11,5 Q14,8 11,11"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          )}
        </button>

        {/* Volume Slider */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-16 h-1 accent-white opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
