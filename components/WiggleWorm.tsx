
import React from 'react';

const WiggleWorm: React.FC = () => {
  // Extended wave pattern to span wider and resemble a "line".
  // ViewBox 0 0 400 100
  // Standard sine wave repeating 4 times.
  
  // Phase A: Sine Wave
  const pathA = "M 0,50 C 25,10 75,10 100,50 C 125,90 175,90 200,50 C 225,10 275,10 300,50 C 325,90 375,90 400,50";

  // Phase B: Inverted Sine Wave
  const pathB = "M 0,50 C 25,90 75,90 100,50 C 125,10 175,10 200,50 C 225,90 275,90 300,50 C 325,10 375,10 400,50";
  
  // Phase C: Slightly flattened transition state for organic feel
  const pathC = "M 0,50 C 30,30 70,30 100,50 C 130,70 170,70 200,50 C 230,30 270,30 300,50 C 330,70 370,70 400,50";

  return (
    <div className="w-full flex items-center justify-center">
      <style>
        {`
          @keyframes worm-wiggle-long {
            0% { d: path("${pathA}"); }
            50% { d: path("${pathB}"); }
            100% { d: path("${pathA}"); }
          }
        `}
      </style>
      <div className="w-64 h-16">
        <svg viewBox="0 0 400 100" className="w-full h-full fill-none stroke-[#C4C7C5]" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
           <path 
             d={pathA} 
             style={{
               animation: 'worm-wiggle-long 4s ease-in-out infinite'
             }}
           />
        </svg>
      </div>
    </div>
  );
};

export default WiggleWorm;
