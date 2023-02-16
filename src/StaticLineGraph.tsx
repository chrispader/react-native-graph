import { Canvas, LinearGradient, Path, vec } from '@shopify/react-native-skia'
import { getSixDigitHex } from './utils/getSixDigitHex'
import React, { useCallback, useMemo, useState } from 'react'
import { View, StyleSheet, LayoutChangeEvent } from 'react-native'
import {
  createGraphPath,
  getGraphPathRange,
  GraphPathRange,
} from './CreateGraphPath'
import type { StaticLineGraphProps } from './LineGraphProps'

export function StaticLineGraph({
  points,
  range,
  color,
  smoothing = 0.2,
  lineThickness = 3,
  enableFadeInMask,
  style,
  ...props
}: StaticLineGraphProps): React.ReactElement {
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  const onLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setWidth(Math.round(layout.width))
      setHeight(Math.round(layout.height))
    },
    []
  )

  const pathRange: GraphPathRange = useMemo(
    () => getGraphPathRange(points, range),
    [points, range]
  )

  const path = useMemo(
    () =>
      createGraphPath({
        points: points,
        range: pathRange,
        smoothing: smoothing,
        canvasHeight: height,
        canvasWidth: width,
        horizontalPadding: lineThickness,
        verticalPadding: lineThickness,
      }),
    [height, lineThickness, pathRange, points, smoothing, width]
  )

  const primaryColor = useMemo(() => {
    if (typeof color === 'string') return color
    return color[0] ?? '#FFF'
  }, [color])

  const gradientColors = useMemo(
    () =>
      typeof color === 'string'
        ? [`${getSixDigitHex(color)}00`, `${getSixDigitHex(color)}ff`]
        : color,
    [color]
  )
  const gradientFrom = useMemo(() => vec(0, 0), [])
  const gradientTo = useMemo(
    () => vec(typeof color === 'string' ? width * 0.15 : width, 0),
    [width, color]
  )

  return (
    <View {...props} style={style} onLayout={onLayout}>
      {/* Fix for react-native-skia's incorrect type declarations */}
      <Canvas
        style={styles.svg}
        onPointerEnter={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeave={undefined}
        onPointerLeaveCapture={undefined}
        onPointerMove={undefined}
        onPointerMoveCapture={undefined}
        onPointerCancel={undefined}
        onPointerCancelCapture={undefined}
        onPointerDown={undefined}
        onPointerDownCapture={undefined}
        onPointerUp={undefined}
        onPointerUpCapture={undefined}
        accessibilityLabelledBy={undefined}
        accessibilityLanguage={undefined}
      >
        <Path
          path={path}
          strokeWidth={lineThickness}
          color={enableFadeInMask ? undefined : primaryColor}
          style="stroke"
          strokeJoin="round"
          strokeCap="round"
        >
          {(enableFadeInMask || typeof color !== 'string') && (
            <LinearGradient
              start={gradientFrom}
              end={gradientTo}
              colors={gradientColors}
            />
          )}
        </Path>
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create({
  svg: {
    flex: 1,
  },
})
