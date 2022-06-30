import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, LayoutChangeEvent } from 'react-native'
import {
  Canvas,
  runSpring,
  SkPath,
  LinearGradient,
  Path,
  Skia,
  useValue,
  vec,
  Circle,
  Group,
  Shadow,
  PathCommand,
  useSharedValueEffect,
  useDerivedValue,
  mix,
} from '@shopify/react-native-skia'
import type { AnimatedLineGraphProps } from './LineGraphProps'
import {
  createGraphPath,
  getGraphPathRange,
  GraphPathRange,
  pixelFactorX,
} from './CreateGraphPath'
import Reanimated, {
  runOnJS,
  useAnimatedReaction,
  withRepeat,
  withTiming,
  useSharedValue,
  useDerivedValue as useDerivedValueREA,
  withSequence,
  cancelAnimation,
  withDelay,
} from 'react-native-reanimated'
import { getSixDigitHex } from './utils/getSixDigitHex'
import { GestureDetector } from 'react-native-gesture-handler'
import { useHoldOrPanGesture } from './hooks/useHoldOrPanGesture'
import { getYForX } from './GetYForX'
import { hexToRgba } from './utils/hexToRgba'

const CIRCLE_RADIUS = 5
const CIRCLE_RADIUS_MULTIPLIER = 6
const INDICATOR_RADIUS = 7
const INDICATOR_BORDER_MULTIPLIER = 1.3
const INDICATOR_PULSE_BLUR_RADIUS_SMALL =
  INDICATOR_RADIUS * INDICATOR_BORDER_MULTIPLIER
const INDICATOR_PULSE_BLUR_RADIUS_BIG =
  INDICATOR_RADIUS * INDICATOR_BORDER_MULTIPLIER + 20

// weird rea type bug
const ReanimatedView = Reanimated.View as any

export function AnimatedLineGraph({
  points,
  color,
  lineThickness = 3,
  range,
  enableFadeInMask,
  enablePanGesture,
  onPointSelected,
  onGestureStart,
  onGestureEnd,
  alwaysShowIndicator = false,
  indicatorPulsating = false,
  horizontalPadding = CIRCLE_RADIUS * CIRCLE_RADIUS_MULTIPLIER,
  verticalPadding = lineThickness + CIRCLE_RADIUS * CIRCLE_RADIUS_MULTIPLIER,
  TopAxisLabel,
  BottomAxisLabel,
  selectionDotShadowColor,
  ...props
}: AnimatedLineGraphProps): React.ReactElement {
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const interpolateProgress = useValue(0)

  const { gesture, isActive, x } = useHoldOrPanGesture({ holdDuration: 300 })
  const circleX = useValue(0)
  const circleY = useValue(0)
  const pathEnd = useValue(0)
  const circleRadius = useValue(0)
  const circleStrokeRadius = useDerivedValue(
    () => circleRadius.current * CIRCLE_RADIUS_MULTIPLIER,
    [circleRadius]
  )
  const indicatorRadius = useValue(alwaysShowIndicator ? INDICATOR_RADIUS : 0)
  const indicatorBorderRadius = useDerivedValue(
    () => indicatorRadius.current * INDICATOR_BORDER_MULTIPLIER,
    [indicatorRadius]
  )

  const isActiveNumber = useDerivedValueREA(() => {
    'worklet'
    return isActive.value ? 1 : 0
  }, [])
  const indicatorPulseAnimation = useSharedValue(0)
  const indicatorPulseRadius = useValue(INDICATOR_PULSE_BLUR_RADIUS_SMALL)
  const indicatorPulseOpacity = useValue(1)

  const positions = useDerivedValue(
    () => [
      0,
      Math.min(0.15, pathEnd.current),
      pathEnd.current,
      pathEnd.current,
      1,
    ],
    [pathEnd]
  )

  const onLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setWidth(Math.round(layout.width))
      setHeight(Math.round(layout.height))
    },
    []
  )

  const straightLine = useMemo(() => {
    const path = Skia.Path.Make()
    path.moveTo(0, height / 2)
    for (let i = 0; i < width - 1; i += 2) {
      const x = i
      const y = height / 2
      path.cubicTo(x, y, x, y, x, y)
    }

    return path
  }, [height, width])

  const paths = useValue<{ from?: SkPath; to?: SkPath }>({})
  const commands = useRef<PathCommand[]>([])
  const [commandsChanged, setCommandsChanged] = useState(0)

  const pathRange: GraphPathRange = useMemo(
    () => getGraphPathRange(points, range),
    [points, range]
  )

  const drawingWidth = useMemo(() => {
    const lastPoint = points[points.length - 1]!

    return Math.max(
      Math.floor(
        (width - 2 * horizontalPadding) *
          pixelFactorX(lastPoint.date, pathRange.x.min, pathRange.x.max)
      ),
      0
    )
  }, [horizontalPadding, pathRange.x.max, pathRange.x.min, points, width])

  const indicatorX = useMemo(
    () =>
      commandsChanged >= 0
        ? Math.floor(drawingWidth) + horizontalPadding
        : undefined,
    [commandsChanged, drawingWidth, horizontalPadding]
  )
  const indicatorY = useMemo(
    () =>
      commandsChanged >= 0 && indicatorX != null
        ? getYForX(commands.current, indicatorX)
        : undefined,
    [commandsChanged, indicatorX]
  )

  const indicatorPulseColor = useMemo(() => hexToRgba(color, 0.4), [color])

  useEffect(() => {
    if (height < 1 || width < 1) {
      // view is not yet measured!
      return
    }
    if (points.length < 1) {
      // points are still empty!
      return
    }

    const path = createGraphPath({
      points: points,
      range: pathRange,
      horizontalPadding: horizontalPadding,
      verticalPadding: verticalPadding,
      canvasHeight: height,
      canvasWidth: width,
    })

    commands.current = path.toCmds()

    const previous = paths.current
    let from: SkPath = previous.to ?? straightLine
    if (previous.from != null && interpolateProgress.current < 1)
      from = from.interpolate(previous.from, interpolateProgress.current)

    if (path.isInterpolatable(from)) {
      paths.current = {
        from: from,
        to: path,
      }
    } else {
      paths.current = {
        from: path,
        to: path,
      }
    }

    setCommandsChanged(commandsChanged + 1)

    runSpring(
      interpolateProgress,
      { from: 0, to: 1 },
      {
        mass: 1,
        stiffness: 500,
        damping: 400,
        velocity: 0,
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    height,
    horizontalPadding,
    interpolateProgress,
    pathRange,
    paths,
    points,
    straightLine,
    verticalPadding,
    width,
  ])

  const gradientColors = useMemo(() => {
    if (enableFadeInMask) {
      return [
        `${getSixDigitHex(color)}00`,
        `${getSixDigitHex(color)}ff`,
        `${getSixDigitHex(color)}ff`,
        `${getSixDigitHex(color)}33`,
        `${getSixDigitHex(color)}33`,
      ]
    } else {
      return [
        color,
        color,
        color,
        `${getSixDigitHex(color)}33`,
        `${getSixDigitHex(color)}33`,
      ]
    }
  }, [color, enableFadeInMask])

  const path = useDerivedValue(
    () => {
      const from = paths.current.from ?? straightLine
      const to = paths.current.to ?? straightLine

      return to.interpolate(from, interpolateProgress.current)
    },
    // RN Skia deals with deps differently. They are actually the required SkiaValues that the derived value listens to, not react values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interpolateProgress]
  )

  const stopPulsating = useCallback(() => {
    cancelAnimation(indicatorPulseAnimation)
    indicatorPulseAnimation.value = 0
  }, [indicatorPulseAnimation])

  const startPulsating = useCallback(() => {
    stopPulsating()
    indicatorPulseAnimation.value = withRepeat(
      withDelay(
        1000,
        withSequence(
          withTiming(1, { duration: 1100 }),
          withTiming(0, { duration: 0 }), // revert to 0
          withTiming(0, { duration: 1200 }), // delay between pulses
          withTiming(1, { duration: 1100 }),
          withTiming(1, { duration: 2000 }) // delay after both pulses
        )
      ),
      -1
    )
  }, [indicatorPulseAnimation, stopPulsating])

  const setFingerX = useCallback(
    (fingerX: number) => {
      const fingerXInRange = Math.min(
        Math.max(fingerX, horizontalPadding + 1),
        drawingWidth + horizontalPadding - 1
      )
      const y = getYForX(commands.current, fingerXInRange)

      if (y != null) {
        circleY.current = y
        circleX.current = fingerXInRange
      }

      if (
        fingerX > horizontalPadding &&
        fingerX < drawingWidth + horizontalPadding
      )
        pathEnd.current = fingerX / width

      const actualFingerX = fingerX - 2 * horizontalPadding + horizontalPadding

      const index = Math.round(
        (actualFingerX / (drawingWidth + horizontalPadding)) * points.length
      )
      const pointIndex = Math.min(Math.max(index, 0), points.length - 1)
      const dataPoint = points[pointIndex]
      if (dataPoint != null) onPointSelected?.(dataPoint)
    },
    [
      circleX,
      circleY,
      commands,
      drawingWidth,
      horizontalPadding,
      onPointSelected,
      pathEnd,
      points,
      width,
    ]
  )

  const setIsActive = useCallback(
    (active: boolean) => {
      runSpring(circleRadius, active ? CIRCLE_RADIUS : 0, {
        mass: 1,
        stiffness: 1000,
        damping: 50,
        velocity: 0,
      })

      runSpring(indicatorRadius, !active ? INDICATOR_RADIUS : 0, {
        mass: 1,
        stiffness: 1000,
        damping: 50,
        velocity: 0,
      })

      if (!active) {
        pathEnd.current = 1

        startPulsating()
      }

      if (active) {
        onGestureStart?.()

        stopPulsating()
      } else onGestureEnd?.()
    },
    [
      circleRadius,
      indicatorRadius,
      onGestureEnd,
      onGestureStart,
      pathEnd,
      startPulsating,
      stopPulsating,
    ]
  )

  useAnimatedReaction(
    () => x.value,
    (fingerX) => {
      runOnJS(setFingerX)(fingerX)
    },
    [isActive, setFingerX, width, x]
  )

  useAnimatedReaction(
    () => isActive.value,
    (active) => {
      runOnJS(setIsActive)(active)
    },
    [isActive, setIsActive]
  )

  useEffect(() => {
    if (points.length !== 0 && commands.current.length !== 0)
      pathEnd.current = 1
  }, [commands, pathEnd, points.length])

  useEffect(() => {
    if (indicatorPulsating) {
      startPulsating()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorPulsating])

  useSharedValueEffect(
    () => {
      if (isActiveNumber.value === 0) {
        indicatorPulseRadius.current = mix(
          indicatorPulseAnimation.value,
          INDICATOR_PULSE_BLUR_RADIUS_SMALL,
          INDICATOR_PULSE_BLUR_RADIUS_BIG
        )
        indicatorPulseOpacity.current = mix(indicatorPulseAnimation.value, 1, 0)
      } else {
        indicatorPulseRadius.current = 0
      }
    },
    indicatorPulseAnimation,
    isActiveNumber
  )

  return (
    <View {...props}>
      <GestureDetector gesture={enablePanGesture ? gesture : undefined}>
        <ReanimatedView style={[styles.container, styles.axisLabelContainer]}>
          {/* Top Label (max price) */}
          {TopAxisLabel != null && (
            <View style={styles.axisRow}>
              <TopAxisLabel />
            </View>
          )}

          {/* Actual Skia Graph */}
          <View style={styles.container} onLayout={onLayout}>
            <Canvas style={styles.svg}>
              <Group>
                <Path
                  path={path}
                  strokeWidth={lineThickness}
                  style="stroke"
                  strokeJoin="round"
                  strokeCap="round"
                >
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(width, 0)}
                    colors={gradientColors}
                    positions={positions}
                  />
                </Path>
              </Group>

              {enablePanGesture && (
                <Group>
                  <Circle
                    opacity={0.05}
                    cx={circleX}
                    cy={circleY}
                    r={circleStrokeRadius}
                    color={selectionDotShadowColor}
                  />
                  <Circle
                    cx={circleX}
                    cy={circleY}
                    r={circleRadius}
                    color={color}
                  >
                    <Shadow dx={0} dy={0} color="rgba(0,0,0,0.5)" blur={4} />
                  </Circle>
                </Group>
              )}

              {alwaysShowIndicator && (
                <Group>
                  {indicatorPulsating && (
                    <Circle
                      cx={indicatorX}
                      cy={indicatorY}
                      r={indicatorPulseRadius}
                      opacity={indicatorPulseOpacity}
                      color={indicatorPulseColor}
                      style="fill"
                    />
                  )}

                  <Circle
                    cx={indicatorX}
                    cy={indicatorY}
                    r={indicatorBorderRadius}
                    color={'#ffffff'}
                  >
                    <Shadow dx={2} dy={2} color="rgba(0,0,0,0.2)" blur={4} />
                  </Circle>
                  <Circle
                    cx={indicatorX}
                    cy={indicatorY}
                    r={indicatorRadius}
                    color={color}
                  />
                </Group>
              )}
            </Canvas>
          </View>

          {/* Bottom Label (min price) */}
          {BottomAxisLabel != null && (
            <View style={styles.axisRow}>
              <BottomAxisLabel />
            </View>
          )}
        </ReanimatedView>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  svg: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  axisLabelContainer: {
    paddingVertical: 20,
  },
  axisRow: {
    height: 17,
  },
})
