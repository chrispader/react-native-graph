import {
  SkPath,
  Skia,
  Vector,
  cartesian2Polar,
} from '@shopify/react-native-skia'
import type { GraphPoint } from './LineGraphProps'

export interface GraphPathRange {
  x?: {
    min: Date
    max: Date
  }
  y?: {
    min: number
    max: number
  }
}

interface GraphPathConfig {
  /**
   * Graph Points to use for the Path. Will be normalized and centered.
   */
  points: GraphPoint[]
  /**
   * Optional Padding (left, right) for the Graph to correctly round the Path.
   */
  horizontalPadding: number
  /**
   * Optional Padding (top, bottom) for the Graph to correctly round the Path.
   */
  verticalPadding: number
  /**
   * Height of the Canvas (Measured with onLayout)
   */
  canvasHeight: number
  /**
   * Width of the Canvas (Measured with onLayout)
   */
  canvasWidth: number

  smoothing?: number
  strategy: 'complex' | 'bezier' | 'simple'

  range?: GraphPathRange
}

export const controlPoint = (
  reverse: boolean,
  smoothing: number,
  current: Vector,
  previous?: Vector,
  next?: Vector
) => {
  const p = previous ?? current
  const n = next ?? current
  // Properties of the opposed-line
  const lengthX = n.x - p.x
  const lengthY = n.y - p.y

  const o = cartesian2Polar({ x: lengthX, y: lengthY })
  // If is end-control-point, add PI to the angle to go backward
  const angle = o.theta + (reverse ? Math.PI : 0)
  const length = o.radius * smoothing
  // The control point position is relative to the current point
  const x = current.x + Math.cos(angle) * length
  const y = current.y + Math.sin(angle) * length
  return { x, y }
}

export function createGraphPath({
  points,
  smoothing = 0,
  range,
  horizontalPadding,
  verticalPadding,
  canvasHeight: height,
  canvasWidth: width,
  strategy,
}: GraphPathConfig): SkPath {
  const minValueX = range?.x?.min ?? points[0]?.date
  const maxValueX = range?.x?.max ?? points[points.length - 1]?.date

  const path = Skia.Path.Make()

  if (minValueX == null || maxValueX == null) return path

  const minValueY =
    range?.y != null
      ? range.y.min
      : points.reduce(
          (prev, curr) => (curr.value < prev ? curr.value : prev),
          Number.MAX_SAFE_INTEGER
        )

  const maxValueY =
    range?.y != null
      ? range.y.max
      : points.reduce(
          (prev, curr) => (curr.value > prev ? curr.value : prev),
          Number.MIN_SAFE_INTEGER
        )

  if (points[0] == null) return path

  const pixelFactorX = (point: GraphPoint): number => {
    const diff = maxValueX.getTime() - minValueX.getTime()
    const x = point.date.getTime()

    if (x < minValueX.getTime() || x > maxValueX.getTime()) return 0
    return (x - minValueX.getTime()) / diff
  }

  const pixelFactorY = (point: GraphPoint): number => {
    const diff = maxValueY - minValueY
    const y = point.value

    if (y < minValueY || y > maxValueY) return 0
    return y / diff
  }

  const actualWidth = width - 2 * horizontalPadding
  const actualHeight = height - 2 * verticalPadding

  path.moveTo(
    pixelFactorX(points[0]),
    actualHeight - pixelFactorY(points[0]) + verticalPadding
  )

  points.forEach((point, i) => {
    if (i === 0) {
      return
    }

    const prev = points[i - 1]

    if (prev == null) return
    const prevPrev = points[i - 1] ?? prev
    const next = points[i + 1] ?? point

    const currentX = actualWidth * pixelFactorX(point) + horizontalPadding
    const currentY =
      actualHeight - (actualHeight * pixelFactorY(point) + verticalPadding)
    const currentVector = { x: currentX, y: currentX }

    const prevX = actualWidth * pixelFactorX(prev) + horizontalPadding
    const prevY = height - (actualHeight * pixelFactorY(prev) + verticalPadding)
    const prevVector = { x: prevX, y: prevY }

    const prevPrevX = actualWidth * pixelFactorX(prevPrev) + horizontalPadding
    const prevPrevY =
      actualHeight - (actualHeight * pixelFactorY(prevPrev) + verticalPadding)
    const prevPrevVector = { x: prevPrevX, y: prevPrevY }

    const nextX = actualWidth * pixelFactorX(next) + horizontalPadding
    const nextY =
      actualHeight - (actualHeight * pixelFactorY(next) + verticalPadding)
    const nextVector =
      nextX != null && nextY != null ? { x: nextX, y: nextY } : currentVector

    // const currentX = width * pixelFactorX(point)
    // const currentY = height * pixelFactorY(point)
    // const currentVector = { x: currentX, y: currentX }

    // const prevX = width * pixelFactorX(prev)
    // const prevY = height * pixelFactorY(prev)
    // const prevVector = { x: prevX, y: prevY }

    // const prevPrevX = width * pixelFactorX(prevPrev)
    // const prevPrevY = height * pixelFactorY(prevPrev)
    // const prevPrevVector = { x: prevPrevX, y: prevPrevY }

    // const nextX = width * pixelFactorX(next)
    // const nextY = height * pixelFactorY(next)
    // const nextVector =
    //   nextX != null && nextY != null ? { x: nextX, y: nextY } : currentVector

    const cps = controlPoint(
      false,
      smoothing,
      prevVector,
      prevPrevVector,
      currentVector
    )
    const cpe = controlPoint(
      true,
      smoothing,
      currentVector,
      prevVector,
      nextVector
    )

    if (point.date < minValueX || point.date > maxValueX) return
    if (point.value < minValueY || point.value > maxValueY) return

    switch (strategy) {
      case 'simple':
        const cp = {
          x: (cps.x + cpe.x) / 2,
          y: (cps.y + cpe.y) / 2,
        }
        path.quadTo(cp.x, cp.y, currentX, currentY)
        break
      case 'bezier':
        const cp1x = (2 * prevPrevX + prevX) / 3
        const cp1y = (2 * prevPrevY + prevY) / 3
        const cp2x = (prevPrevX + 2 * prevX) / 3
        const cp2y = (prevPrevY + 2 * prevY) / 3
        const cp3x = (prevPrevX + 4 * prevX + currentX) / 6
        const cp3y = (prevPrevY + 4 * prevY + currentX) / 6
        path.cubicTo(cp1x, cp1y, cp2x, cp2y, cp3x, cp3y)
        if (i === points.length - 1) {
          path.cubicTo(
            currentX,
            currentY,
            currentX,
            currentY,
            currentX,
            currentY
          )
        }
        break
      case 'complex':
        path.cubicTo(cps.x, cps.y, cpe.x, cpe.y, currentX, currentY)
        break
    }
  })

  return path
}

// A Graph Point will be drawn every second "pixel"
// const PIXEL_RATIO = 2

// export function createGraphPath({
//   points: graphData,
//   range,
//   horizontalPadding,
//   verticalPadding,
//   canvasHeight: height,
//   canvasWidth: width,
// }: GraphPathConfig): SkPath {
//   const firstGraphPoint = graphData[0]!
//   const lastGraphPoint = graphData[graphData.length - 1]!

//   const minValueY =
//     range?.y != null
//       ? range.y.min
//       : graphData.reduce(
//           (prev, curr) => (curr.value < prev ? curr.value : prev),
//           Number.MAX_SAFE_INTEGER
//         )

//   const maxValueY =
//     range?.y != null
//       ? range.y.max
//       : graphData.reduce(
//           (prev, curr) => (curr.value > prev ? curr.value : prev),
//           Number.MIN_SAFE_INTEGER
//         )

//   let leftBoundary = 0
//   let rightBoundary = width

//   const minValueX = range?.x?.min
//   const maxValueX = range?.x?.max

//   if (minValueX != null && maxValueX != null) {
//     console.log('test')

//     const timeDifference = maxValueX.getTime() - minValueX.getTime()

//     const leftmostPointTime = Math.max(
//       firstGraphPoint.date.getTime() - minValueX.getTime(),
//       0
//     )

//     const rightmostPointTime = Math.min(
//       lastGraphPoint.date.getTime() - minValueX.getTime(),
//       timeDifference
//     )

//     leftBoundary = width * (leftmostPointTime / timeDifference)
//     rightBoundary = width * (rightmostPointTime / timeDifference)
//   }

//   // const pixelFactorX = (point: GraphPoint): number | undefined => {
//   //   const diff = maxValueX.getTime() - minValueX.getTime()
//   //   const x = point.date.getTime()

//   //   if (x < minValueX.getTime() || x > maxValueX.getTime()) return
//   //   return (x - minValueX.getTime()) / diff
//   // }

//   // const pixelFactorY = (point: GraphPoint): number | undefined => {
//   //   const diff = maxValueY - minValueY
//   //   const y = point.value

//   //   if (y < minValueY || y > maxValueY) return
//   //   return y / diff
//   // }

//   // for (const point of graphData) {
//   //   const px = pixelFactorX(point)
//   //   const py = pixelFactorY(point)

//   //   console.log('point', point.value)
//   //   console.log('px', px)
//   //   console.log('py', py)

//   //   if (px == null || py == null) continue

//   //   const x = (width - 2 * graphPadding) * px + graphPadding
//   //   const y = height - ((height - 2 * graphPadding) * py + graphPadding)

//   //   points.push({ x: x, y: y })
//   // }

//   const points: SkPoint[] = []

//   const actualWidth = rightBoundary - leftBoundary

//   for (let pixel = leftBoundary; pixel < rightBoundary; pixel += PIXEL_RATIO) {
//     const index = Math.floor((pixel / actualWidth) * graphData.length)
//     const point = graphData[index]!
//     const value = point.value

//     if (value < minValueY || value > maxValueY) continue

//     const x =
//       (pixel / actualWidth) * (actualWidth - 2 * horizontalPadding) +
//       horizontalPadding

//     const y =
//       height -
//       (((value - minValueY) / (maxValueY - minValueY)) *
//         (height - 2 * verticalPadding) +
//         verticalPadding)

//     points.push({ x: x, y: y })
//   }

//   const path = Skia.Path.Make()

//   for (let i = 0; i < points.length; i++) {
//     const point = points[i]!

//     // first point needs to start the path
//     if (i === 0) path.moveTo(point.x, point.y)

//     const prev = points[i - 1]
//     const prevPrev = points[i - 2]

//     if (prev == null) continue

//     const p0 = prevPrev ?? prev
//     const p1 = prev
//     const cp1x = (2 * p0.x + p1.x) / 3
//     const cp1y = (2 * p0.y + p1.y) / 3
//     const cp2x = (p0.x + 2 * p1.x) / 3
//     const cp2y = (p0.y + 2 * p1.y) / 3
//     const cp3x = (p0.x + 4 * p1.x + point.x) / 6
//     const cp3y = (p0.y + 4 * p1.y + point.y) / 6

//     path.cubicTo(cp1x, cp1y, cp2x, cp2y, cp3x, cp3y)
//   }

//   return path
// }
