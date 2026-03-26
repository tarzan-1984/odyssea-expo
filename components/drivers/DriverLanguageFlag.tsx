import React, { useMemo } from 'react';
import type { SvgProps } from 'react-native-svg';
import FlagEn from '@/icons/flags/flag-en.svg';
import FlagSp from '@/icons/flags/flag-sp.svg';
import FlagAr from '@/icons/flags/flag-ar.svg';
import FlagUa from '@/icons/flags/flag-ua.svg';
import FlagPt from '@/icons/flags/flag-pt.svg';
import FlagFr from '@/icons/flags/flag-fr.svg';
import FlagRu from '@/icons/flags/flag-ru.svg';

/** Same mapping as Next.js LanguageFlagIcon.tsx */
const FLAG_MAP: Record<string, React.FC<SvgProps>> = {
  en: FlagEn,
  es: FlagSp,
  sp: FlagSp,
  ar: FlagAr,
  uk: FlagUa,
  ua: FlagUa,
  pt: FlagPt,
  fr: FlagFr,
  ru: FlagRu,
};

function resolveLangCode(language: string): string | null {
  const first = language.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  // "en-GB", "en_US" → "en" (matches Next short codes)
  const primary = first.split(/[-_]/)[0]?.trim();
  return primary || null;
}

export interface DriverLanguageFlagProps {
  language: string | null | undefined;
  size: number;
}

/**
 * Driver language flag — same logic and assets as Odyssea-backend-ui LanguageFlagIcon.
 */
export default function DriverLanguageFlag({ language, size }: DriverLanguageFlagProps) {
  const code = useMemo(() => {
    if (!language || typeof language !== 'string') return null;
    return resolveLangCode(language);
  }, [language]);

  if (!code) return null;
  const Flag = FLAG_MAP[code];
  if (!Flag) return null;

  return (
    <Flag
      width={size}
      height={size}
      accessibilityIgnoresInvertColors
      accessibilityLabel={`Driver language: ${code}`}
    />
  );
}
