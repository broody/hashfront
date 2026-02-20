import { Link } from "react-router-dom";
import { BlueprintContainer } from "../components/BlueprintContainer";
import { PixelPanel } from "../components/PixelPanel";

const LogoVariant = ({
  id,
  children,
  title,
}: {
  id: number;
  children: React.ReactNode;
  title: string;
}) => (
  <PixelPanel
    title={`VARIANT_${id}: ${title}`}
    className="flex flex-col items-center justify-center p-8 bg-blueprint-dark/40"
  >
    <div className="w-32 h-32 flex items-center justify-center border border-white/10 mb-4 bg-black/20 relative group hover:border-white/40 transition-colors">
      {/* Corner Brackets for the box */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/40" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/40" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/40" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/40" />

      {children}
    </div>
    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
      Render_Type: Vector_Path // ID: {id}
    </div>
  </PixelPanel>
);

export default function LogoGallery() {
  return (
    <BlueprintContainer>
      <header className="flex justify-between items-center border-b-[3px] border-white pb-3 md:pb-4 lg:pb-5 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-[4px] m-0 flicker-text">
            LOGO_R&D_LAB
          </h1>
          <div className="text-sm mt-1 opacity-80 font-mono">
            &gt; EXPERIMENTING_WITH_BRAND_VECTORS // ITERATION: 30
          </div>
        </div>
        <Link to="/">
          <button className="border-2 border-white px-4 py-2 hover:bg-white hover:text-blueprint-blue transition-colors font-bold uppercase text-sm">
            BACK_TO_LOBBY
          </button>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 pb-8">
          {/* 1. Classic Refined */}
          <LogoVariant id={1} title="REFINED_CLASSIC">
            <svg
              width="60"
              height="60"
              viewBox="0 0 40 40"
              className="flicker-text"
            >
              <g stroke="white" fill="none" strokeWidth="1.5">
                <path d="M14 6 L14 34 M26 6 L26 34 M6 14 L34 14 M6 26 L34 26" />
                <circle cx="20" cy="20" r="2" fill="white" stroke="none" />
              </g>
              <path
                d="M2 2 H8 M2 2 V8 M32 2 H38 M38 2 V8 M2 38 H8 M2 38 V32 M32 38 H38 M38 38 V32"
                stroke="white"
                strokeWidth="0.5"
                opacity="0.6"
              />
            </svg>
          </LogoVariant>

          {/* 2. Tactical Radar */}
          <LogoVariant id={2} title="RADAR_VECTOR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="white"
                strokeWidth="0.5"
                fill="none"
                strokeDasharray="2,2"
              />
              <circle
                cx="20"
                cy="20"
                r="12"
                stroke="white"
                strokeWidth="0.2"
                fill="none"
                opacity="0.3"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M16 10 L16 30 M24 10 L24 30 M10 16 L30 16 M10 24 L30 24" />
              </g>
              <line
                x1="20"
                y1="20"
                x2="20"
                y2="4"
                stroke="white"
                strokeWidth="1"
                className="origin-center animate-[spin_4s_linear_infinite]"
              />
            </svg>
          </LogoVariant>

          {/* 3. Crosshair Reticle */}
          <LogoVariant id={3} title="TARGETING_GRID">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="0.5">
                <circle cx="20" cy="20" r="15" />
                <path
                  d="M20 0 V40 M0 20 H40"
                  strokeDasharray="1,1"
                  opacity="0.4"
                />
              </g>
              <g stroke="white" fill="none" strokeWidth="2.5">
                <path d="M15 12 V28 M25 12 V28 M12 15 H28 M12 25 H28" />
              </g>
              <path
                d="M5 5 L10 10 M35 5 L30 10 M5 35 L10 30 M35 35 L30 30"
                stroke="white"
                strokeWidth="1"
              />
            </svg>
          </LogoVariant>

          {/* 4. Circuit Node */}
          <LogoVariant id={4} title="CIRCUIT_NODE">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="1.5">
                <path d="M14 8 V32 M26 8 V32 M8 14 H32 M8 26 H32" />
                <circle cx="14" cy="8" r="1.5" fill="white" />
                <circle cx="26" cy="32" r="1.5" fill="white" />
                <circle cx="8" cy="14" r="1.5" fill="white" />
                <circle cx="32" cy="26" r="1.5" fill="white" />
              </g>
              <rect
                x="18"
                y="18"
                width="4"
                height="4"
                stroke="white"
                strokeWidth="0.5"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 5. Dashed Technical */}
          <LogoVariant id={5} title="DASHED_VECTOR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g
                stroke="white"
                fill="none"
                strokeWidth="2"
                strokeDasharray="3,2"
              >
                <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
              </g>
              <g stroke="white" fill="none" strokeWidth="0.5" opacity="0.3">
                <path d="M13 6 V34 M27 6 V34 M6 13 H34 M6 27 H34" />
              </g>
              <text
                x="30"
                y="38"
                className="text-[4px] fill-white opacity-40 font-mono"
              >
                v1.2
              </text>
            </svg>
          </LogoVariant>

          {/* 6. Hex Shield */}
          <LogoVariant id={6} title="HEX_SHIELD">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <path
                d="M20 2 L36 11 V29 L20 38 L4 29 V11 Z"
                stroke="white"
                fill="none"
                strokeWidth="1"
              />
              <g stroke="white" fill="none" strokeWidth="1.8">
                <path d="M16 12 V28 M24 12 V28 M12 16 H28 M12 24 H28" />
              </g>
              <path
                d="M20 18 L20 22 M18 20 L22 20"
                stroke="white"
                strokeWidth="0.5"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 7. Isometric Wireframe */}
          <LogoVariant id={7} title="ISO_PERSPECTIVE">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g
                transform="skewX(-15) skewY(5) scale(0.9)"
                transform-origin="center"
              >
                <g stroke="white" fill="none" strokeWidth="2">
                  <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
                </g>
                <g
                  stroke="white"
                  fill="none"
                  strokeWidth="0.5"
                  opacity="0.3"
                  transform="translate(4,4)"
                >
                  <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
                </g>
              </g>
            </svg>
          </LogoVariant>

          {/* 8. Fragmented Vector */}
          <LogoVariant id={8} title="FRAGMENT_STREAM">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 6 V18 M15 22 V34" />
                <path d="M25 6 V12 M25 16 V34" />
                <path d="M6 15 H20 M24 15 H34" />
                <path d="M6 25 H10 M14 25 H34" />
              </g>
              <circle
                cx="22"
                cy="18"
                r="1"
                fill="white"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 9. Kinetic Stencil */}
          <LogoVariant id={9} title="KINETIC_STENCIL">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g fill="white" stroke="none">
                <rect x="13" y="6" width="3" height="10" />
                <rect x="13" y="18" width="3" height="10" />
                <rect x="13" y="30" width="3" height="4" />

                <rect x="24" y="6" width="3" height="28" />

                <rect x="6" y="13" width="28" height="3" />
                <rect x="6" y="24" width="28" height="3" />
              </g>
              <g stroke="white" fill="none" strokeWidth="0.5">
                <path d="M27 6 L32 6 M27 34 L32 34" />
              </g>
            </svg>
          </LogoVariant>

          {/* 10. Interference Glitch */}
          <LogoVariant id={10} title="GLITCH_STATIC">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g
                stroke="white"
                fill="none"
                strokeWidth="2"
                className="flicker-text"
              >
                <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
              </g>
              <g stroke="white" fill="none" strokeWidth="0.5" opacity="0.4">
                <line x1="0" y1="10" x2="40" y2="10" strokeDasharray="1,2" />
                <line x1="0" y1="30" x2="40" y2="30" strokeDasharray="1,2" />
              </g>
              <path
                d="M10 5 H30"
                stroke="white"
                strokeWidth="1"
                className="animate-pulse"
              />
              <path
                d="M10 35 H30"
                stroke="white"
                strokeWidth="1"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 11. Topographic Map */}
          <LogoVariant id={11} title="TOPO_LEVELS">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <path
                d="M5,10 Q15,5 25,15 T35,10 M5,20 Q15,15 25,25 T35,20 M5,30 Q15,25 25,35 T35,30"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                opacity="0.4"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M14 8 V32 M26 8 V32 M8 14 H32 M8 26 H32" />
              </g>
            </svg>
          </LogoVariant>

          {/* 12. Signal Pulse */}
          <LogoVariant id={12} title="SIGNAL_BURST">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                className="animate-pulse"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 10 V30 M25 10 V30 M10 15 H30 M10 25 H30" />
              </g>
              <path d="M0 20 H5 M35 20 H40" stroke="white" strokeWidth="1" />
            </svg>
          </LogoVariant>

          {/* 13. Orbital Mechanics */}
          <LogoVariant id={13} title="ORBIT_VECTOR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <ellipse
                cx="20"
                cy="20"
                rx="18"
                ry="6"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                transform="rotate(45 20 20)"
              />
              <ellipse
                cx="20"
                cy="20"
                rx="18"
                ry="6"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                transform="rotate(-45 20 20)"
              />
              <g stroke="white" fill="none" strokeWidth="2.2">
                <path d="M16 10 V30 M24 10 V30 M10 16 H30 M10 24 H30" />
              </g>
            </svg>
          </LogoVariant>

          {/* 14. Binary Stream */}
          <LogoVariant id={14} title="BINARY_STACK">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <text
                x="2"
                y="38"
                className="text-[3px] fill-white opacity-20 font-mono"
              >
                01101 10101 01110 11011
              </text>
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 8 V32 M25 8 V32 M8 15 H32 M8 25 H32" />
              </g>
              <rect
                x="18"
                y="18"
                width="4"
                height="4"
                fill="white"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 15. Command Compass */}
          <LogoVariant id={15} title="COMMAND_NORTH">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <path
                d="M20 2 L24 18 L40 20 L24 22 L20 38 L16 22 L0 20 L16 18 Z"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                opacity="0.3"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M14 12 V28 M26 12 V28 M12 14 H28 M12 26 H28" />
              </g>
            </svg>
          </LogoVariant>

          {/* 16. Neural Network */}
          <LogoVariant id={16} title="NEURAL_PATH">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <circle cx="8" cy="8" r="1.5" fill="white" />
              <circle cx="32" cy="32" r="1.5" fill="white" />
              <path
                d="M8 8 L20 20 L32 32"
                stroke="white"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 10 V30 M25 10 V30 M10 15 H30 M10 25 H30" />
              </g>
            </svg>
          </LogoVariant>

          {/* 17. Depth Scan */}
          <LogoVariant id={17} title="DEPTH_SONAR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <rect
                x="5"
                y="5"
                width="30"
                height="30"
                stroke="white"
                fill="none"
                strokeWidth="0.2"
                opacity="0.2"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M16 8 V32 M24 8 V32 M8 16 H32 M8 24 H32" />
              </g>
              <path
                d="M5 20 Q20 5 35 20"
                stroke="white"
                strokeWidth="0.5"
                fill="none"
                className="animate-pulse"
              />
            </svg>
          </LogoVariant>

          {/* 18. Secure Protocol */}
          <LogoVariant id={18} title="SECURE_GATE">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <rect
                x="12"
                y="12"
                width="16"
                height="16"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                strokeDasharray="2,1"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
              </g>
              <path
                d="M18 18 L22 22 M22 18 L18 22"
                stroke="white"
                strokeWidth="1"
              />
            </svg>
          </LogoVariant>

          {/* 19. Kinetic Shift */}
          <LogoVariant id={19} title="KINETIC_FLOW">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="2">
                <path
                  d="M14 6 L14 34 M26 6 L26 34 M6 14 L34 14 M6 26 L34 26"
                  className="animate-[bounce_2s_infinite]"
                />
              </g>
              <path
                d="M20 2 V8 M20 32 V38 M2 20 H8 M32 20 H38"
                stroke="white"
                strokeWidth="0.5"
              />
            </svg>
          </LogoVariant>

          {/* 20. Matrix Array */}
          <LogoVariant id={20} title="MATRIX_ARRAY">
            <svg width="60" height="60" viewBox="0 0 40 40">
              {[...Array(9)].map((_, i) => (
                <circle
                  key={i}
                  cx={10 + (i % 3) * 10}
                  cy={10 + Math.floor(i / 3) * 10}
                  r="1"
                  fill="white"
                  opacity="0.3"
                />
              ))}
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 8 V32 M25 8 V32 M8 15 H32 M8 25 H32" />
              </g>
            </svg>
          </LogoVariant>

          {/* 21. Shield Vector */}
          <LogoVariant id={21} title="SHIELD_VECTOR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <path
                d="M8 4 H32 L36 10 V30 L32 36 H8 L4 30 V10 Z"
                stroke="white"
                strokeWidth="0.5"
                fill="none"
                opacity="0.3"
              />
              <g stroke="white" fill="none" strokeWidth="2.5">
                <path d="M16 12 V28 M24 12 V28 M12 16 H28 M12 24 H28" />
              </g>
            </svg>
          </LogoVariant>

          {/* 22. Crosshair Zoom */}
          <LogoVariant id={22} title="TACTICAL_ZOOM">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="1">
                <path d="M4 4 L12 4 M4 4 L4 12 M36 4 L28 4 M36 4 L36 12 M4 36 L12 36 M4 36 L4 28 M36 36 L28 36 M36 36 L36 28" />
                <circle cx="20" cy="20" r="1" fill="white" />
              </g>
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M14 10 V30 M26 10 V30 M10 14 H30 M10 26 H30" />
              </g>
            </svg>
          </LogoVariant>

          {/* 23. Wireframe Core */}
          <LogoVariant id={23} title="CORE_WIREFRAME">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <rect
                x="8"
                y="8"
                width="24"
                height="24"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                transform="rotate(45 20 20)"
              />
              <g stroke="white" fill="none" strokeWidth="2.2">
                <path d="M15 10 V30 M25 10 V30 M10 15 H30 M10 25 H30" />
              </g>
            </svg>
          </LogoVariant>

          {/* 24. Signal Trace */}
          <LogoVariant id={24} title="SIGNAL_TRACE">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <polyline
                points="2,20 8,20 12,5 18,35 22,20 38,20"
                stroke="white"
                fill="none"
                strokeWidth="0.3"
                opacity="0.3"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M14 8 V32 M26 8 V32 M8 14 H32 M8 26 H32" />
              </g>
            </svg>
          </LogoVariant>

          {/* 25. Anchor Points */}
          <LogoVariant id={25} title="ANCHOR_GEOM">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g fill="white">
                <circle cx="20" cy="5" r="2" />
                <circle cx="20" cy="35" r="2" />
                <circle cx="5" cy="20" r="2" />
                <circle cx="35" cy="20" r="2" />
              </g>
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M15 10 V30 M25 10 V30 M10 15 H30 M10 25 H30" />
              </g>
            </svg>
          </LogoVariant>

          {/* 26. Data Packet */}
          <LogoVariant id={26} title="DATA_PACKET">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <rect
                x="6"
                y="6"
                width="28"
                height="28"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
              />
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M16 6 V34 M24 6 V34 M6 16 H34 M6 24 H34" />
              </g>
              <rect
                x="18"
                y="18"
                width="4"
                height="4"
                fill="white"
                opacity="0.4"
              />
            </svg>
          </LogoVariant>

          {/* 27. Vector Scope */}
          <LogoVariant id={27} title="VECTOR_SCOPE">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="white"
                fill="none"
                strokeWidth="0.2"
              />
              <path
                d="M4 20 L36 20 M20 4 L20 36"
                stroke="white"
                strokeWidth="0.2"
                strokeDasharray="1,1"
              />
              <g stroke="white" fill="none" strokeWidth="2.5">
                <path d="M15 12 V28 M25 12 V28 M12 15 H28 M12 25 H28" />
              </g>
            </svg>
          </LogoVariant>

          {/* 28. Pattern Block */}
          <LogoVariant id={28} title="PATTERN_BLOCK">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="2">
                <path d="M14 6 V34 M26 6 V34 M6 14 H34 M6 26 H34" />
              </g>
              <pattern
                id="diag"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                overflow="visible"
              >
                <line
                  x1="0"
                  y1="4"
                  x2="4"
                  y2="0"
                  stroke="white"
                  strokeWidth="0.5"
                  opacity="0.2"
                />
              </pattern>
              <rect x="14" y="14" width="12" height="12" fill="url(#diag)" />
            </svg>
          </LogoVariant>

          {/* 29. Command Array */}
          <LogoVariant id={29} title="COMMAND_ARRAY">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <g stroke="white" fill="none" strokeWidth="1.8">
                <path d="M12 8 V32 M20 8 V32 M28 8 V32" />
                <path d="M8 12 H32 M8 20 H32 M8 28 H32" />
              </g>
              <rect
                x="18"
                y="18"
                width="4"
                height="4"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
              />
            </svg>
          </LogoVariant>

          <LogoVariant id={30} title="ZENITH_VECTOR">
            <svg width="60" height="60" viewBox="0 0 40 40">
              <path
                d="M20 4 L34 32 L20 26 L6 32 Z"
                stroke="white"
                fill="none"
                strokeWidth="0.5"
                opacity="0.3"
              />
              <g stroke="white" fill="none" strokeWidth="2.2">
                <path d="M15 10 V30 M25 10 V30 M10 15 H30 M10 25 H30" />
              </g>
            </svg>
          </LogoVariant>
        </div>
      </div>

      <footer className="mt-12 border-t border-white/20 pt-6 text-center text-xs opacity-50 font-mono tracking-widest uppercase shrink-0">
        End_of_Transmission // Selection_Required
      </footer>
    </BlueprintContainer>
  );
}
