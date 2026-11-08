import React from 'react';

interface CairnLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  inverted?: boolean;
  className?: string;
}

export const CairnLogo: React.FC<CairnLogoProps> = ({
  size = 'md',
  showText = false,
  inverted = false,
  className = ''
}) => {
  const dimensions = {
    sm: { box: 'w-6 h-6', svg: 24 },
    md: { box: 'w-8 h-8', svg: 32 },
    lg: { box: 'w-10 h-10', svg: 40 }
  }[size];

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Three Stacked Cairn Trail Marker Stones */}
      <div className={`relative ${dimensions.box} flex items-center justify-center flex-shrink-0`}>
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm"
        >
          {/* Base Foundation Stone (Wide, Solid) */}
          <ellipse
            cx="18"
            cy="27"
            rx="13"
            ry="5.5"
            fill={inverted ? '#48443E' : '#AFA18D'}
            className="transition-colors"
          />
          {/* Base stone highlight */}
          <ellipse
            cx="17"
            cy="25.5"
            rx="10"
            ry="3.2"
            fill={inverted ? '#5A5852' : '#C7BBA8'}
            opacity="0.6"
          />

          {/* Middle Balancing Stone (Tactile Ink Obsidian) */}
          <ellipse
            cx="18"
            cy="18.5"
            rx="9.5"
            ry="4.5"
            fill={inverted ? '#FAF7F2' : '#1A1816'}
            className="transition-colors"
          />
          {/* Middle stone subtle sheen */}
          <ellipse
            cx="17.2"
            cy="17.2"
            rx="7"
            ry="2.5"
            fill={inverted ? '#FFFFFF' : '#322F2B'}
            opacity="0.7"
          />

          {/* Summit Guiding Stone (Signature Burnt Orange Terracotta) */}
          <ellipse
            cx="18"
            cy="10"
            rx="6.5"
            ry="3.8"
            fill="#C85A17"
          />
          {/* Beacon light reflection on summit stone */}
          <ellipse
            cx="17"
            cy="8.8"
            rx="4.2"
            ry="1.8"
            fill="#DF6726"
            opacity="0.9"
          />
          <circle
            cx="15.5"
            cy="8.2"
            r="0.8"
            fill="#FAF7F2"
            opacity="0.8"
          />

          {/* Subtle trail guide spark atop the cairn */}
          <path
            d="M18 2.5 L18.8 4.2 L20.5 5 L18.8 5.8 L18 7.5 L17.2 5.8 L15.5 5 L17.2 4.2 Z"
            fill="#DF6726"
            opacity="0.85"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`font-bold font-serif tracking-tight ${size === 'lg' ? 'text-lg' : size === 'md' ? 'text-base' : 'text-sm'} ${inverted ? 'text-cream-50' : 'text-ink-950'}`}>
              Cairn
            </span>
            <span className="text-[9px] font-mono font-bold bg-orange-brand/10 text-orange-brand border border-orange-brand/30 px-1 py-0.2 rounded">
              2.0
            </span>
          </div>
          <span className={`text-[10px] font-mono tracking-wider uppercase mt-0.5 ${inverted ? 'text-cream-400' : 'text-ink-500'}`}>
            Continuity Intelligence
          </span>
        </div>
      )}
    </div>
  );
};

