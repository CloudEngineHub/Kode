import { getGlobalConfig } from './config'
import type { ThemeNames } from '#config'

export interface Theme {
  bashBorder: string
  kode: string
  noting: string
  notingBorder: string
  permission: string
  autoAccept: string
  planMode: string
  secondaryBorder: string
  inputBorder: string
  text: string
  secondaryText: string
  suggestion: string
  success: string
  error: string
  warning: string
  primary: string
  secondary: string
  diff: {
    added: string
    removed: string
    addedDimmed: string
    removedDimmed: string
  }
}

// ============================================================================
// DARK THEMES
// ============================================================================

// Default dark theme - warm coral accent
const darkTheme: Theme = {
  bashBorder: '#f06060',
  kode: '#f06060',
  noting: '#202020',
  notingBorder: '#ff8080',
  permission: '#e0a050',
  autoAccept: '#d080e0',
  planMode: '#d05050',
  secondaryBorder: '#505050',
  inputBorder: '#f06060',
  text: '#b0b0b0',
  secondaryText: '#606060',
  suggestion: '#ff8080',
  success: '#60c060',
  error: '#f06060',
  warning: '#f0c060',
  primary: '#b0b0b0',
  secondary: '#606060',
  diff: {
    added: '#304030',
    removed: '#403030',
    addedDimmed: '#2a3a2a',
    removedDimmed: '#3a2a2a',
  },
}

// Dark daltonized - colorblind friendly
const darkDaltonizedTheme: Theme = {
  bashBorder: '#FF6E57',
  kode: '#FFC233',
  noting: '#222222',
  notingBorder: '#10b981',
  permission: '#99ccff',
  autoAccept: '#af87ff',
  planMode: '#48968c',
  secondaryBorder: '#888',
  inputBorder: '#7c8ff5',
  text: '#fff',
  secondaryText: '#999',
  suggestion: '#99ccff',
  success: '#3399ff',
  error: '#ff6666',
  warning: '#ffcc00',
  primary: '#fff',
  secondary: '#999',
  diff: {
    added: '#004466',
    removed: '#660000',
    addedDimmed: '#3e515b',
    removedDimmed: '#3e2c2c',
  },
}

// Dracula - popular dark theme with purple accent
// Based on https://draculatheme.com/
const draculaTheme: Theme = {
  bashBorder: '#ff79c6', // pink
  kode: '#bd93f9', // purple
  noting: '#282a36', // background
  notingBorder: '#50fa7b', // green
  permission: '#ffb86c', // orange
  autoAccept: '#ff79c6', // pink
  planMode: '#8be9fd', // cyan
  secondaryBorder: '#44475a', // current line
  inputBorder: '#bd93f9', // purple
  text: '#f8f8f2', // foreground
  secondaryText: '#6272a4', // comment
  suggestion: '#8be9fd', // cyan
  success: '#50fa7b', // green
  error: '#ff5555', // red
  warning: '#f1fa8c', // yellow
  primary: '#f8f8f2',
  secondary: '#6272a4',
  diff: {
    added: '#50fa7b33',
    removed: '#ff555533',
    addedDimmed: '#50fa7b1a',
    removedDimmed: '#ff55551a',
  },
}

// Nord - arctic, north-bluish color palette
// Based on https://www.nordtheme.com/
const nordTheme: Theme = {
  bashBorder: '#bf616a', // aurora red
  kode: '#88c0d0', // frost
  noting: '#2e3440', // polar night
  notingBorder: '#a3be8c', // aurora green
  permission: '#ebcb8b', // aurora yellow
  autoAccept: '#b48ead', // aurora purple
  planMode: '#81a1c1', // frost
  secondaryBorder: '#4c566a', // polar night
  inputBorder: '#88c0d0', // frost
  text: '#eceff4', // snow storm
  secondaryText: '#4c566a', // polar night
  suggestion: '#8fbcbb', // frost
  success: '#a3be8c', // aurora green
  error: '#bf616a', // aurora red
  warning: '#ebcb8b', // aurora yellow
  primary: '#eceff4',
  secondary: '#d8dee9',
  diff: {
    added: '#a3be8c33',
    removed: '#bf616a33',
    addedDimmed: '#a3be8c1a',
    removedDimmed: '#bf616a1a',
  },
}

// Monokai - classic editor theme
const monokaiTheme: Theme = {
  bashBorder: '#f92672', // magenta
  kode: '#a6e22e', // green
  noting: '#272822', // background
  notingBorder: '#a6e22e', // green
  permission: '#e6db74', // yellow
  autoAccept: '#ae81ff', // purple
  planMode: '#66d9ef', // cyan
  secondaryBorder: '#49483e', // comment bg
  inputBorder: '#f92672', // magenta
  text: '#f8f8f2', // foreground
  secondaryText: '#75715e', // comment
  suggestion: '#66d9ef', // cyan
  success: '#a6e22e', // green
  error: '#f92672', // magenta
  warning: '#e6db74', // yellow
  primary: '#f8f8f2',
  secondary: '#75715e',
  diff: {
    added: '#a6e22e33',
    removed: '#f9267233',
    addedDimmed: '#a6e22e1a',
    removedDimmed: '#f926721a',
  },
}

// Tokyo Night - modern VS Code theme
// Based on https://github.com/enkia/tokyo-night-vscode-theme
const tokyoNightTheme: Theme = {
  bashBorder: '#f7768e', // red
  kode: '#7aa2f7', // blue
  noting: '#1a1b26', // background
  notingBorder: '#9ece6a', // green
  permission: '#e0af68', // yellow
  autoAccept: '#bb9af7', // magenta
  planMode: '#7dcfff', // cyan
  secondaryBorder: '#414868', // terminal black
  inputBorder: '#7aa2f7', // blue
  text: '#c0caf5', // foreground
  secondaryText: '#565f89', // comment
  suggestion: '#7dcfff', // cyan
  success: '#9ece6a', // green
  error: '#f7768e', // red
  warning: '#e0af68', // yellow
  primary: '#c0caf5',
  secondary: '#565f89',
  diff: {
    added: '#9ece6a33',
    removed: '#f7768e33',
    addedDimmed: '#9ece6a1a',
    removedDimmed: '#f7768e1a',
  },
}

// Catppuccin Mocha - soothing pastel theme
// Based on https://github.com/catppuccin/catppuccin
const catppuccinTheme: Theme = {
  bashBorder: '#f38ba8', // red
  kode: '#cba6f7', // mauve
  noting: '#1e1e2e', // base
  notingBorder: '#a6e3a1', // green
  permission: '#f9e2af', // yellow
  autoAccept: '#f5c2e7', // pink
  planMode: '#89dceb', // sky
  secondaryBorder: '#45475a', // surface1
  inputBorder: '#cba6f7', // mauve
  text: '#cdd6f4', // text
  secondaryText: '#6c7086', // overlay0
  suggestion: '#94e2d5', // teal
  success: '#a6e3a1', // green
  error: '#f38ba8', // red
  warning: '#fab387', // peach
  primary: '#cdd6f4',
  secondary: '#a6adc8',
  diff: {
    added: '#a6e3a133',
    removed: '#f38ba833',
    addedDimmed: '#a6e3a11a',
    removedDimmed: '#f38ba81a',
  },
}

// Gruvbox Dark - retro groove
// Based on https://github.com/morhetz/gruvbox
const gruvboxTheme: Theme = {
  bashBorder: '#fb4934', // red
  kode: '#fabd2f', // yellow
  noting: '#282828', // bg
  notingBorder: '#b8bb26', // green
  permission: '#fe8019', // orange
  autoAccept: '#d3869b', // purple
  planMode: '#83a598', // aqua
  secondaryBorder: '#504945', // bg2
  inputBorder: '#fabd2f', // yellow
  text: '#ebdbb2', // fg
  secondaryText: '#928374', // gray
  suggestion: '#8ec07c', // aqua
  success: '#b8bb26', // green
  error: '#fb4934', // red
  warning: '#fe8019', // orange
  primary: '#ebdbb2',
  secondary: '#a89984',
  diff: {
    added: '#b8bb2633',
    removed: '#fb493433',
    addedDimmed: '#b8bb261a',
    removedDimmed: '#fb49341a',
  },
}

// One Dark - Atom editor theme
// Based on https://github.com/atom/one-dark-syntax
const oneDarkTheme: Theme = {
  bashBorder: '#e06c75', // red
  kode: '#61afef', // blue
  noting: '#282c34', // background
  notingBorder: '#98c379', // green
  permission: '#d19a66', // orange
  autoAccept: '#c678dd', // purple
  planMode: '#56b6c2', // cyan
  secondaryBorder: '#3e4451', // gutter
  inputBorder: '#61afef', // blue
  text: '#abb2bf', // foreground
  secondaryText: '#5c6370', // comment
  suggestion: '#56b6c2', // cyan
  success: '#98c379', // green
  error: '#e06c75', // red
  warning: '#e5c07b', // yellow
  primary: '#abb2bf',
  secondary: '#5c6370',
  diff: {
    added: '#98c37933',
    removed: '#e06c7533',
    addedDimmed: '#98c3791a',
    removedDimmed: '#e06c751a',
  },
}

// Solarized Dark - Ethan Schoonover's precision colors
// Based on https://ethanschoonover.com/solarized/
const solarizedDarkTheme: Theme = {
  bashBorder: '#dc322f', // red
  kode: '#268bd2', // blue
  noting: '#002b36', // base03
  notingBorder: '#859900', // green
  permission: '#b58900', // yellow
  autoAccept: '#6c71c4', // violet
  planMode: '#2aa198', // cyan
  secondaryBorder: '#073642', // base02
  inputBorder: '#268bd2', // blue
  text: '#839496', // base0
  secondaryText: '#586e75', // base01
  suggestion: '#2aa198', // cyan
  success: '#859900', // green
  error: '#dc322f', // red
  warning: '#cb4b16', // orange
  primary: '#93a1a1',
  secondary: '#657b83',
  diff: {
    added: '#85990033',
    removed: '#dc322f33',
    addedDimmed: '#8599001a',
    removedDimmed: '#dc322f1a',
  },
}

// ============================================================================
// LIGHT THEMES
// ============================================================================

// Default light theme
const lightTheme: Theme = {
  bashBorder: '#FF6E57',
  kode: '#FFC233',
  noting: '#222222',
  notingBorder: '#10b981',
  permission: '#e9c61aff',
  autoAccept: '#8700ff',
  planMode: '#006666',
  secondaryBorder: '#999',
  inputBorder: '#a5b4fc',
  text: '#000',
  secondaryText: '#666',
  suggestion: '#32e98aff',
  success: '#2c7a39',
  error: '#ab2b3f',
  warning: '#966c1e',
  primary: '#000',
  secondary: '#666',
  diff: {
    added: '#69db7c',
    removed: '#ffa8b4',
    addedDimmed: '#c7e1cb',
    removedDimmed: '#fdd2d8',
  },
}

// Light daltonized - colorblind friendly
const lightDaltonizedTheme: Theme = {
  bashBorder: '#FF6E57',
  kode: '#FFC233',
  noting: '#222222',
  notingBorder: '#059669',
  permission: '#3366ff',
  autoAccept: '#8700ff',
  planMode: '#006666',
  secondaryBorder: '#999',
  inputBorder: '#93a5f5',
  text: '#000',
  secondaryText: '#666',
  suggestion: '#3366ff',
  success: '#006699',
  error: '#cc0000',
  warning: '#ff9900',
  primary: '#000',
  secondary: '#666',
  diff: {
    added: '#99ccff',
    removed: '#ffcccc',
    addedDimmed: '#d1e7fd',
    removedDimmed: '#ffe9e9',
  },
}

// Solarized Light
const solarizedLightTheme: Theme = {
  bashBorder: '#dc322f', // red
  kode: '#268bd2', // blue
  noting: '#fdf6e3', // base3
  notingBorder: '#859900', // green
  permission: '#b58900', // yellow
  autoAccept: '#6c71c4', // violet
  planMode: '#2aa198', // cyan
  secondaryBorder: '#eee8d5', // base2
  inputBorder: '#268bd2', // blue
  text: '#657b83', // base00
  secondaryText: '#93a1a1', // base1
  suggestion: '#2aa198', // cyan
  success: '#859900', // green
  error: '#dc322f', // red
  warning: '#cb4b16', // orange
  primary: '#586e75',
  secondary: '#839496',
  diff: {
    added: '#85990044',
    removed: '#dc322f44',
    addedDimmed: '#85990022',
    removedDimmed: '#dc322f22',
  },
}

// GitHub Light
const githubLightTheme: Theme = {
  bashBorder: '#cf222e', // red
  kode: '#0969da', // blue
  noting: '#f6f8fa', // canvas subtle
  notingBorder: '#1a7f37', // green
  permission: '#9a6700', // yellow
  autoAccept: '#8250df', // purple
  planMode: '#0969da', // blue
  secondaryBorder: '#d0d7de', // border default
  inputBorder: '#0969da', // blue
  text: '#1f2328', // fg default
  secondaryText: '#656d76', // fg muted
  suggestion: '#0550ae', // accent fg
  success: '#1a7f37', // success fg
  error: '#cf222e', // danger fg
  warning: '#9a6700', // attention fg
  primary: '#1f2328',
  secondary: '#656d76',
  diff: {
    added: '#dafbe1',
    removed: '#ffebe9',
    addedDimmed: '#aceebb',
    removedDimmed: '#ffcecb',
  },
}

// ============================================================================
// THEME REGISTRY
// ============================================================================

const themes: Record<ThemeNames, Theme> = {
  // Light themes
  light: lightTheme,
  'light-daltonized': lightDaltonizedTheme,
  'solarized-light': solarizedLightTheme,
  'github-light': githubLightTheme,
  // Dark themes
  dark: darkTheme,
  'dark-daltonized': darkDaltonizedTheme,
  dracula: draculaTheme,
  nord: nordTheme,
  monokai: monokaiTheme,
  'tokyo-night': tokyoNightTheme,
  catppuccin: catppuccinTheme,
  gruvbox: gruvboxTheme,
  'one-dark': oneDarkTheme,
  'solarized-dark': solarizedDarkTheme,
}

export type { ThemeNames } from '#config'

export function getTheme(overrideTheme?: ThemeNames): Theme {
  const config = getGlobalConfig()
  const themeName = overrideTheme ?? config.theme
  return themes[themeName] ?? darkTheme
}

export function getAvailableThemes(): ThemeNames[] {
  return Object.keys(themes) as ThemeNames[]
}
