import { buildThemeRoles, colorRgb, contrastRatio, shiftLightness } from "./colorMath";

export type PlayerThemeId = "graphite" | "oled" | "sapphire" | "emerald" | "amethyst" | "nord" | "discord" | "pine" | "mint" | "ruby" | "bordeaux" | "coffee" | "abyss" | "slate" | "indigo";

export interface PlayerThemeTokens {
  bgPrimary: string;
  bgSurface: string;
  bgGlassRgb: string;
  bgPillRgb: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderHover: string;
}

export interface PlayerThemeConfig {
  id: PlayerThemeId;
  name: string;
  badge?: string;
  desc: string;
  dotColor: string;
  surfaceColor: string;
  tokens: PlayerThemeTokens;
  recommendedAccents: string[];
}

// The four requested accents retain their exact values and positions.
export const PASTEL_PRESETS = [
  "#7fc7ff", "#e8a236", "#f9a8d4", "#c7b5ec",
  "#91cbb7", "#e5d2a3", "#dca9a1", "#a6c7d2",
  "#e8baa1", "#9bc9bf", "#d2b3ce", "#c6c99c",
  "#a7f3d0", "#d8c9b7", "#aebcdd", "#c3c8d0",
];

// Deliberately vivid pigments: saturation belongs to swatches and fills.
// Text and focus use their independently contrast-corrected tonal variants.
export const STANDARD_PRESETS = [
  "#00c98d", "#00bed6", "#3978f6", "#7c4dff",
  "#c52bdb", "#e52d79", "#f05a28", "#f5ad18",
  "#a5c916", "#008f80", "#d146a3", "#5558dc",
  "#d53d4f", "#007cab", "#b58416", "#168b58",
];

const PAIRINGS: Record<PlayerThemeId, string[]> = {
  graphite: ["#7fc7ff", "#e8a236", "#f9a8d4", "#a7f3d0", "#3978f6", "#7c4dff", "#00c98d", "#f5ad18"],
  oled: ["#7fc7ff", "#f9a8d4", "#a7f3d0", "#c3c8d0", "#00bed6", "#e52d79", "#00c98d", "#f5ad18"],
  sapphire: ["#7fc7ff", "#e8a236", "#aebcdd", "#e5d2a3", "#3978f6", "#00bed6", "#f5ad18"],
  emerald: ["#a7f3d0", "#91cbb7", "#e8a236", "#e5d2a3", "#00c98d", "#a5c916", "#f5ad18"],
  amethyst: ["#f9a8d4", "#c7b5ec", "#d2b3ce", "#c3c8d0", "#c52bdb", "#7c4dff", "#e52d79"],
  nord: ["#7fc7ff", "#a6c7d2", "#c3c8d0", "#e8baa1", "#00bed6", "#3978f6", "#f05a28"],
  discord: ["#7fc7ff", "#e8a236", "#f9a8d4", "#a7f3d0", "#00c98d", "#00bed6", "#f5ad18"],
  pine: ["#a7f3d0", "#91cbb7", "#e8a236", "#d8c9b7", "#00c98d", "#a5c916", "#f5ad18"],
  mint: ["#a7f3d0", "#9bc9bf", "#e8a236", "#a6c7d2", "#00bed6", "#00c98d", "#f5ad18"],
  ruby: ["#e8baa1", "#dca9a1", "#e5d2a3", "#d8c9b7", "#f05a28", "#f5ad18", "#d53d4f"],
  bordeaux: ["#f9a8d4", "#d2b3ce", "#c7b5ec", "#e8a236", "#d146a3", "#c52bdb", "#e52d79"],
  coffee: ["#e8a236", "#e5d2a3", "#d8c9b7", "#c6c99c", "#f5ad18", "#a5c916", "#f05a28"],
  abyss: ["#7fc7ff", "#a7f3d0", "#a6c7d2", "#e8baa1", "#00bed6", "#00c98d", "#f05a28"],
  slate: ["#c3c8d0", "#d8c9b7", "#e8a236", "#7fc7ff", "#f5ad18", "#f05a28", "#00c98d"],
  indigo: ["#c7b5ec", "#aebcdd", "#f9a8d4", "#a7f3d0", "#7c4dff", "#5558dc", "#e52d79"],
};

interface ThemeDefinition {
  id: PlayerThemeId;
  name: string;
  desc: string;
  base: string;
  surface: string;
  glass?: string;
  dot?: string;
  badge?: string;
}

function defineTheme(d: ThemeDefinition): PlayerThemeConfig {
  const glass = d.glass || d.surface;
  const glassRgb = colorRgb(glass).join(", ");
  const roles = buildThemeRoles(d.surface, glassRgb, "#7fc7ff");
  return {
    id: d.id, name: d.name, desc: d.desc, badge: d.badge,
    dotColor: d.dot || shiftLightness(glass, 0.13), surfaceColor: glass,
    tokens: {
      bgPrimary: d.base, bgSurface: d.surface, bgGlassRgb: glassRgb, bgPillRgb: glassRgb,
      textPrimary: roles.primary, textSecondary: roles.secondary, textMuted: roles.muted,
      border: "rgba(255, 255, 255, 0.13)", borderHover: "rgba(255, 255, 255, 0.24)",
    },
    // Dots mark harmonious choices whose raw fill is distinguishable; labels
    // use the readable accent role, so vivid pigments need not become pastels.
    recommendedAccents: PAIRINGS[d.id].filter(c => contrastRatio(c, d.surface) >= 3),
  };
}

export const PLAYER_THEMES: Record<PlayerThemeId, PlayerThemeConfig> = {
  graphite: defineTheme({id:"graphite",name:"Тёмный графит",desc:"Нейтральный фирменный графит L-MPV",base:"#0b0d12",surface:"#13161d",dot:"#383f4c",badge:"Стандарт"}),
  oled: defineTheme({id:"oled",name:"Глубокий OLED",desc:"Настоящий чёрный и отдельные тёмные островки интерфейса",base:"#000000",surface:"#09090b",dot:"#08080a"}),
  sapphire: defineTheme({id:"sapphire",name:"Ночной кобальт",desc:"Чернильная глубина с чистым синим подтоном",base:"#060d1d",surface:"#101e38"}),
  emerald: defineTheme({id:"emerald",name:"Тёмный изумруд",desc:"Глубокий хвойно-нефритовый фон",base:"#06130e",surface:"#0a1d15",glass:"#0b1f17",dot:"#1b5844"}),
  amethyst: defineTheme({id:"amethyst",name:"Чёрная орхидея",desc:"Приглушённый баклажановый фон для розовых и фиолетовых акцентов",base:"#160e1b",surface:"#281b30"}),
  nord: defineTheme({id:"nord",name:"Северный туман",desc:"Матовый стальной сине-серый тон с отчётливыми слоями",base:"#141b22",surface:"#25323d"}),
  discord: defineTheme({id:"discord",name:"Discord Gray",desc:"Знакомый матовый серый Discord",base:"#202225",surface:"#2e3035",dot:"#4e535e"}),
  pine: defineTheme({id:"pine",name:"Лесной шалфей",desc:"Спокойная шалфейно-хвойная палитра",base:"#14261f",surface:"#1c352b",dot:"#335e4c"}),
  mint: defineTheme({id:"mint",name:"Мятный нефрит",desc:"Прохладная тёмная мята с бирюзовым подтоном",base:"#122827",surface:"#1a3837",dot:"#2c6563"}),
  ruby: defineTheme({id:"ruby",name:"Терракота",desc:"Тёплая обожжённая глина и глубокие медные тени",base:"#201311",surface:"#38241f"}),
  bordeaux: defineTheme({id:"bordeaux",name:"Сливовый бархат",desc:"Сдержанный винно-сливовый фон с мягкой глубиной",base:"#1a101b",surface:"#302031"}),
  coffee: defineTheme({id:"coffee",name:"Тёмная бронза",desc:"Тёплый бронзовый тон для золотых и оливковых акцентов",base:"#19150d",surface:"#2c2518"}),
  abyss: defineTheme({id:"abyss",name:"Чернильный океан",desc:"Глубокий петрольный фон с сине-зелёными переходами",base:"#07191f",surface:"#102e36"}),
  slate: defineTheme({id:"slate",name:"Тёплый титан",desc:"Нейтральный минеральный серый с тёплым подтоном",base:"#1a1917",surface:"#2d2c28"}),
  indigo: defineTheme({id:"indigo",name:"Сумеречный ирис",desc:"Прохладный чернильный индиго с фиолетовой глубиной",base:"#121329",surface:"#222644"}),
};
