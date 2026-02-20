import React from "react";

interface BlueprintContainerProps {
  children: React.ReactNode;
}

export const BlueprintContainer: React.FC<BlueprintContainerProps> = ({
  children,
}) => {
  return (
    <div className="crt-screen h-screen flex items-start justify-center p-4 lg:p-6 box-border overflow-hidden">
      <div className="crt-vignette"></div>
      <div className="blueprint-container haze-bloom w-full max-h-full max-w-[1400px] border-[3px] border-white p-3 lg:p-5 flex flex-col gap-2 lg:gap-3 relative bg-blueprint-blue/30 shadow-[0_0_20px_rgba(255,255,255,0.1)] box-border overflow-hidden">
        <div className="absolute bottom-2 right-10 text-[10px] opacity-30 font-mono tracking-widest hidden md:block">
          LONG: 157.8583 W // LAT: 21.3069 N
        </div>

        {/* Corner Markers */}
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white top-[-4px] left-[-4px] border-r-0 border-b-0"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white top-[-4px] right-[-4px] border-l-0 border-b-0"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white bottom-[-4px] left-[-4px] border-r-0 border-t-0"></div>
        <div className="absolute w-[25px] h-[25px] border-[4px] border-white bottom-[-4px] right-[-4px] border-l-0 border-t-0"></div>

        {children}
      </div>
    </div>
  );
};
