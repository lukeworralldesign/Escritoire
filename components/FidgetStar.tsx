
import React, { useMemo } from 'react';

interface FidgetStarProps {
  sizeClass?: string;
  colorClass?: string;
}

/**
 * Helper to generate polygon path data with extremely high resolution for "super smooth" morphing.
 * 512 points ensures that even at large sizes or high-DPI displays, the polygonal segments
 * are invisible to the naked eye, creating the illusion of perfect curves.
 */
const generatePath = (type: 'circle' | 'star16round' | 'star8round') => {
  const points = 512; // Increased for super-smoothness
  const center = 50;
  let d = "";

  for (let i = 0; i <= points; i++) {
    // Normalize t from 0 to 2PI
    const t = (i / points) * Math.PI * 2;
    let r = 50; // default radius

    switch (type) {
      case 'circle':
        r = 50;
        break;
      case 'star16round':
        // 16-Point Star (Rounded/Flower)
        r = 42 + 8 * Math.cos(16 * t);
        break;
      case 'star8round':
        // 8-Point Rounded
        r = 38 + 12 * Math.cos(8 * t);
        break;
    }

    // Convert polar to cartesian (0 is Top)
    const x = center + r * Math.sin(t);
    const y = center - r * Math.cos(t);

    // Using 3 decimal places for extra precision
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)} `;
  }
  
  d += "Z";
  return d;
};

const FidgetStar: React.FC<FidgetStarProps> = ({ 
  sizeClass = "w-32 h-32", 
  colorClass = "text-[#C1CC94]" 
}) => {
  // Memoize paths so we don't recalculate on render
  const paths = useMemo(() => ({
    circle: generatePath('circle'),
    star16round: generatePath('star16round'),
    star8round: generatePath('star8round'),
  }), []);

  return (
    <div className={`relative flex items-center justify-center select-none pointer-events-none ${sizeClass}`}>
      <style>
        {`
          @keyframes rotate-slow {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes morph-sequence {
            0% { d: path("${paths.circle}"); }
            33.3% { d: path("${paths.star8round}"); }
            66.6% { d: path("${paths.star16round}"); }
            100% { d: path("${paths.circle}"); }
          }
        `}
      </style>
      
      {/* Container for Rotation */}
      <div 
        className={`w-full h-full transition-colors duration-500 ${colorClass}`}
        style={{
          animation: 'rotate-slow 13.33s linear infinite',
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full fill-current overflow-visible">
            <path 
                d={paths.circle} // Initial render state
                style={{
                    animation: 'morph-sequence 10s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    transformOrigin: 'center'
                }}
            />
        </svg>
      </div>
    </div>
  );
};

export default FidgetStar;
