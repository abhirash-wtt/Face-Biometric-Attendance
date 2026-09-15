import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';

/** Minimum comfortable touch target, matching the Android/iOS accessibility guidance. */
export const TAP_TARGET = 48;

export type Layout = {
  width: number;
  height: number;
  /** Narrow handsets such as an iPhone SE or a 5" Android. */
  compact: boolean;
  /** Not enough vertical room to lay a screen out without scrolling. */
  short: boolean;
  landscape: boolean;
  tablet: boolean;
  /** Screen padding that shrinks on small phones so content keeps its width. */
  gutter: number;
  /** Caps line length on tablets and large phones in landscape. */
  maxContentWidth: number;
  cameraHeight: number;
  /** Roster switches from columns to stacked cards when there is no room for four columns. */
  stackRows: boolean;
  /** True when the user has dialled font size up far enough to break fixed-height rows. */
  largeText: boolean;
};

function clamp(min: number, value: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function useLayout(): Layout {
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const landscape = width > height;
    const compact = width < 360;
    const short = height < 640;
    const tablet = Math.min(width, height) >= 600;
    const largeText = fontScale >= 1.3 || PixelRatio.getFontScale() >= 1.3;

    return {
      width,
      height,
      compact,
      short,
      landscape,
      tablet,
      gutter: compact ? 12 : 16,
      maxContentWidth: tablet ? 620 : landscape ? 560 : width,
      cameraHeight: landscape ? clamp(150, height * 0.52, 280) : clamp(200, height * 0.4, 380),
      stackRows: width < 420 || largeText,
      largeText,
    };
  }, [width, height, fontScale]);
}
