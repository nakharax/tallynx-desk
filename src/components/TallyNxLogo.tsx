import React, { useId } from 'react';
import { deskText, type DeskLanguage } from '../utils/deskI18n';

export type TallyNxLogoVariant = 'mark' | 'lockup';
export type TallyNxLogoTone = 'light' | 'dark' | 'mono';

export interface TallyNxLogoProps {
  className?: string;
  size?: number;
  variant?: TallyNxLogoVariant;
  tone?: TallyNxLogoTone;
  lang?: DeskLanguage;
}

const WAVE_TOP_PATH =
  'M7.55 38.48 C8.31 37.57 9.04 36.56 10.01 35.80 C10.87 35.06 11.78 34.44 12.77 33.99 C14.44 33.09 16.31 32.65 18.20 32.25 C21.80 31.74 25.51 31.49 29.07 30.88 C30.94 30.46 32.83 30.09 34.57 29.36 C35.53 29.01 36.45 28.59 37.32 28.05 C38.28 27.53 39.17 26.83 40.01 26.02 C40.88 25.16 41.65 24.25 42.25 23.27 C42.88 22.42 43.41 21.52 43.84 20.59 C44.42 19.72 44.77 18.76 45.22 17.84 C45.51 16.95 46.17 16.06 46.16 15.16 C45.11 14.11 44.01 12.97 42.98 12.04 C42.51 11.54 42.02 11.06 41.53 10.59 C41.00 10.06 40.46 9.53 39.93 9.00 C38.84 7.95 37.80 6.78 36.67 5.81 C36.14 5.41 35.60 5.04 35.01 4.80 C34.49 4.62 33.99 4.39 33.41 4.36 C32.41 4.10 31.13 4.17 30.15 4.43 C29.55 4.51 29.03 4.80 28.49 5.01 C27.95 5.38 27.37 5.66 26.89 6.17 C24.73 8.36 22.52 10.42 20.37 12.62 C16.05 17.00 11.66 21.22 7.33 25.59 C6.78 26.14 6.22 26.70 5.67 27.25 C5.34 27.78 4.92 28.27 4.72 28.85 C4.21 29.82 3.98 30.91 4.00 32.11 C3.97 33.32 4.30 34.38 4.80 35.37 C5.09 35.96 5.49 36.51 5.96 37.03 C6.50 37.49 6.93 38.20 7.55 38.48 Z';

const WAVE_RIGHT_PATH =
  'M48.41 17.84 C48.11 19.69 47.52 21.41 46.89 23.13 C46.19 24.94 45.34 26.70 44.21 28.34 C43.64 29.28 42.95 30.17 42.18 31.02 C41.51 31.94 40.62 32.75 39.86 33.63 C38.17 35.33 36.54 37.05 35.08 38.85 C34.45 39.72 33.82 40.59 33.34 41.53 C32.86 42.35 32.55 43.24 32.25 44.13 C31.75 45.74 31.68 47.53 31.67 49.35 C31.67 51.09 31.67 52.83 31.67 54.57 C31.67 55.44 31.67 56.31 31.67 57.17 C31.76 58.03 31.49 59.03 31.82 59.78 C32.86 59.81 33.80 59.61 34.72 59.35 C35.20 59.11 35.71 58.94 36.17 58.62 C36.66 58.34 37.12 57.98 37.54 57.54 C39.45 55.63 41.36 53.72 43.27 51.81 C47.08 48.00 50.90 44.18 54.71 40.37 C55.68 39.40 56.64 38.44 57.61 37.47 C58.11 37.02 58.47 36.52 58.84 36.02 C59.06 35.56 59.40 35.16 59.49 34.64 C60.26 32.92 60.11 30.60 59.35 28.92 C59.09 28.42 58.81 27.94 58.48 27.47 C58.08 26.96 57.57 26.50 57.10 26.02 C56.16 25.08 55.22 24.14 54.28 23.20 C52.41 21.28 50.57 19.60 48.70 17.69 L48.41 17.84 Z';

const WAVE_LEFT_PATH =
  'M13.27 44.21 C13.37 44.79 14.09 45.11 14.43 45.58 C14.91 46.03 15.31 46.50 15.74 46.96 C16.65 47.88 17.57 48.80 18.49 49.71 C20.28 51.56 22.13 53.25 23.92 55.07 L24.14 55.00 C24.14 53.24 24.14 51.48 24.14 49.71 C24.16 48.81 24.07 47.86 24.28 47.03 C24.36 46.11 24.60 45.26 24.86 44.42 C25.14 43.49 25.61 42.63 26.02 41.74 C26.59 40.85 27.16 39.95 27.91 39.14 C28.65 38.22 29.58 37.46 30.44 36.67 C31.25 36.02 32.24 35.52 32.98 34.86 C29.60 35.63 26.11 36.15 22.84 37.18 C21.98 37.50 21.12 37.80 20.30 38.19 C19.43 38.62 18.57 39.07 17.76 39.64 C16.01 40.79 14.42 42.48 13.27 44.21 Z';

export const TallyNxLogo: React.FC<TallyNxLogoProps> = ({
  className,
  size = 38,
  variant = 'mark',
  tone = 'dark',
  lang = 'en',
}) => {
  const id = useId();
  const gradId = `tnx-blue-${id}`;
  const isLight = tone === 'light';
  const isMono = tone === 'mono';

  const mark = (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={variant === 'mark' ? className : undefined}
      aria-hidden="true"
    >
      {isMono ? (
        <g fill="currentColor">
          <path d={WAVE_TOP_PATH} />
          <path d={WAVE_RIGHT_PATH} />
          <path d={WAVE_LEFT_PATH} />
        </g>
      ) : (
        <>
          <defs>
            <linearGradient id={gradId} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={isLight ? '#1D63FF' : '#3B82F6'} />
              <stop offset="1" stopColor="#0752E8" />
            </linearGradient>
          </defs>
          <g fill={`url(#${gradId})`}>
            <path d={WAVE_TOP_PATH} />
            <path d={WAVE_RIGHT_PATH} />
            <path d={WAVE_LEFT_PATH} />
          </g>
        </>
      )}
    </svg>
  );

  if (variant === 'mark') return mark;

  return (
    <span
      className={className}
      role="img"
      aria-label={deskText(
        lang,
        'TallyNX, Quant Risk OS',
        'แทลลีน็อกซ์ ระบบบริหารความเสี่ยงเชิงปริมาณ',
      )}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {mark}
      <span style={{ display: 'grid', gap: '4px', textAlign: 'left', lineHeight: 1 }}>
        <svg
          viewBox="0 0 133 20"
          width="96"
          height="15"
          fill={isMono ? 'currentColor' : 'var(--text-primary, currentColor)'}
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          <path
            d="M0 0H16V4H10V20H6V4H0Z M17 20L24 0H29L36 20H31.5L30.3 16H22.7L21.5 20Z M24 12H29L26.5 4.6Z M40 0H44.5V16H53V20H40Z M57 0H61.5V16H70V20H57Z M71 0H76L80 7.5L84 0H89L82.25 12V20H77.75V12Z"
            fillRule="evenodd"
          />
          <path
            d="M95 20V0H99L107 12V0H111V20H107L99 8V20Z M115 0H120L124 6.5L128 0H133L126.5 10L133 20H128L124 13.5L120 20H115L121.5 10Z"
            fill={isMono ? 'currentColor' : 'var(--brand-wordmark-accent, #0752E8)'}
          />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '8.5px',
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: isMono ? 'currentColor' : 'var(--text-muted, currentColor)',
          }}
        >
          QUANT RISK OS
        </span>
      </span>
    </span>
  );
};
