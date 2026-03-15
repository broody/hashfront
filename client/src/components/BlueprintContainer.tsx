import React from "react";
import { ToastContainer } from "./Toast";

interface BlueprintContainerProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export const BlueprintContainer: React.FC<BlueprintContainerProps> = ({
  children,
  fullWidth = false,
}) => {
  return (
    <div className="crt-screen h-screen flex items-center justify-center p-0 min-[1600px]:p-6 box-border overflow-hidden relative">
      <ToastContainer />
      <div className="crt-vignette"></div>
      <div
        className={`blueprint-container haze-bloom w-full h-full ${fullWidth ? "" : "max-w-[1600px]"} border-0 min-[1600px]:border-[3px] border-white p-4 md:p-4 lg:p-6 flex flex-col gap-3 md:gap-4 lg:gap-5 relative bg-blueprint-blue/30 min-[1600px]:shadow-[0_0_20px_rgba(255,255,255,0.1)] box-border overflow-hidden`}
      >
        {/* Decorative Technical Labels */}
        <div className="absolute top-2 left-10 text-[10px] opacity-30 font-mono tracking-widest hidden min-[1600px]:block">
          REF_ID: 0x8829-HF // AREA: {Math.floor(Math.random() * 1000)}
        </div>
        <div className="absolute bottom-2 right-10 text-[10px] opacity-30 font-mono tracking-widest hidden min-[1600px]:block">
          LONG: 157.8583 W // LAT: 21.3069 N
        </div>

        {/* Corner Markers */}
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white top-[-4px] left-[-4px] border-r-0 border-b-0 hidden min-[1600px]:block"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white top-[-4px] right-[-4px] border-l-0 border-b-0 hidden min-[1600px]:block"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white bottom-[-4px] left-[-4px] border-r-0 border-t-0 hidden min-[1600px]:block"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white bottom-[-4px] right-[-4px] border-l-0 border-t-0 hidden min-[1600px]:block"></div>

        {children}
      </div>
    </div>
  );
};
