
import { HERO_COLORS } from './resources/colors';

export interface Note {
  id: string;
  content: string;
  originalContent?: string;
  timestamp: number;
  aiStatus: 'idle' | 'processing' | 'completed' | 'error';
  category: string;
  headline: string;
  tags: string[];
  embedding?: number[];
}

export interface AIReponse {
  category: string;
  headline: string;
  tags: string[];
  embedding?: number[];
}

export type ModelTier = 'flash' | 'pro';

export interface ThemeColors {
  key: ModelTier;
  bg: string; // hex
  surface: string; // class
  surfaceHover: string; // class
  surfaceBorder: string; // class
  primaryText: string; // class
  primaryBg: string; // class
  onPrimaryText: string; // class
  secondaryBg: string; // class
  secondaryHover: string; // class
  secondaryText: string; // class
  accentHex: string;
  focusRing: string; // class
  border: string; // class
  subtleText: string; // class
}

/**
 * Maps categories to vibrant styles using the Hero Colors palette.
 * Style format: [Tailwind Background Class] [Hex Text Style]
 */
interface CategoryStyle {
  bg: string;
  text: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  writing: { bg: HERO_COLORS.ELECTRIC_BLUE, text: HERO_COLORS.CHARCOAL },
  shopping: { bg: HERO_COLORS.LIME, text: HERO_COLORS.CHARCOAL },
  tech: { bg: HERO_COLORS.BRIGHT_YELLOW, text: HERO_COLORS.CHARCOAL },
  ideas: { bg: HERO_COLORS.BRIGHT_PINK, text: HERO_COLORS.CHARCOAL },
  character: { bg: HERO_COLORS.CORAL, text: HERO_COLORS.CHARCOAL },
  lore: { bg: HERO_COLORS.BRIGHT_PURPLE, text: HERO_COLORS.CHARCOAL },
  mission: { bg: HERO_COLORS.PURE_ORANGE, text: HERO_COLORS.CHARCOAL },
  transit: { bg: HERO_COLORS.PERIWINKLE, text: HERO_COLORS.CHARCOAL },
  personal: { bg: HERO_COLORS.CYAN, text: HERO_COLORS.CHARCOAL },
  default: { bg: HERO_COLORS.SILVER, text: HERO_COLORS.CHARCOAL }
};

export const getCategoryStyle = (category: string = 'default'): CategoryStyle => {
  const cat = category.toLowerCase();
  return CATEGORY_STYLES[cat] || CATEGORY_STYLES.default;
};
