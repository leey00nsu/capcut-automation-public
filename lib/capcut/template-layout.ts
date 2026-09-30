/** Shared geometry for the browser preview and the generated CapCut canvas. */
export const TEMPLATE_COVER_WIDTH = 432;

export const TEMPLATE_STYLE = {
  highlightFontPx: 30,
  generalFontPx: 30,
  channelFontPx: 30,
  titleFontPx: 15.53,
  profileSizePx: 47,
  channelGapRatio: 0.016,
  highlightStrokePx: 2.1,
} as const;

export const TEMPLATE_LAYOUT = {
  title: { x: 0, y: -0.79 },
  channelGroup: { x: -0.0600657301704371, y: -0.57, widthRatio: 0.44 },
  topGeneral: { x: 0, y: 0.4322200392927308 },
  topHighlight: { x: 0, y: 0.5893909626719056 },
  videoOffsetY: 0.045454545454545414,
} as const;
