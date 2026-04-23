/**
 * PulseWave — ECG-inspired "coding vitals" animation for active sessions.
 *
 * Visual metaphor: each spike = a tool invocation / reasoning step.
 * The waveform scrolls continuously left, suggesting live ongoing work.
 * Flat sections = Claude thinking. Sharp QRS spike = action taken.
 */

interface Props {
  color?: string
  width?: number
  height?: number
  /** ms per full cycle scroll. Lower = faster/more urgent. */
  speed?: number
}

// Build one cycle of the waveform as SVG polyline points.
// One cycle is `cycleW` px wide, centered at `mid`.
function buildCycle(offsetX: number, cycleW: number, mid: number, amp: number): string {
  const x = (n: number) => offsetX + n
  const y = (n: number) => mid + n

  // Proportional positions within the cycle
  const w = cycleW
  return [
    `${x(0)},${y(0)}`,                    // baseline start
    `${x(w * 0.12)},${y(0)}`,             // flat lead-in
    `${x(w * 0.14)},${y(-amp * 0.15)}`,   // P wave (small pre-bump)
    `${x(w * 0.17)},${y(0)}`,             // back to baseline
    `${x(w * 0.22)},${y(0)}`,             // flat
    `${x(w * 0.24)},${y(-amp * 0.2)}`,    // Q wave dip up
    `${x(w * 0.265)},${y(-amp)}`,         // R wave — main spike (peak)
    `${x(w * 0.29)},${y(amp * 0.45)}`,    // S wave — undershoot
    `${x(w * 0.32)},${y(0)}`,             // return to baseline
    `${x(w * 0.45)},${y(0)}`,             // flat (ST segment)
    `${x(w * 0.47)},${y(-amp * 0.12)}`,   // T wave (small recovery bump)
    `${x(w * 0.51)},${y(0)}`,             // back
    `${x(w)},${y(0)}`,                    // flat to end of cycle
  ].join(' ')
}

export default function PulseWave({
  color = '#22c55e',
  width = 100,
  height = 22,
  speed = 2200,
}: Props) {
  const mid = height / 2
  const amp = height * 0.42   // spike amplitude — stays within bounds

  // SVG is 2× wide; we animate translateX(0 → -50%) for a seamless loop
  const svgW = width * 2

  const points =
    buildCycle(0, width, mid, amp) +
    ' ' +
    buildCycle(width, width, mid, amp)

  const animId = `ecg-${width}-${height}`

  return (
    <div
      style={{ width, height, overflow: 'hidden', flexShrink: 0 }}
      title="Active session"
    >
      <style>{`
        @keyframes ${animId} {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
      <svg
        width={svgW}
        height={height}
        style={{ animation: `${animId} ${speed}ms linear infinite`, display: 'block' }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
        />
      </svg>
    </div>
  )
}
