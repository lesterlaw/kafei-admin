import { getCofeplusLiveLanes, getMachineQueueLanes } from '@/app/actions/queue'
import { QueueBoard } from './queue-board'

export const dynamic = 'force-dynamic'

export default async function QueuePage() {
  const [lanes, liveLanes] = await Promise.all([
    getMachineQueueLanes(),
    getCofeplusLiveLanes(),
  ])
  const waiting = lanes.reduce((sum, lane) => sum + lane.waiting.length, 0)
  const serving = lanes.reduce((sum, lane) => sum + lane.serving.length, 0)
  const liveCount = liveLanes.reduce((sum, lane) => sum + lane.items.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live queue</h1>
        <p className="text-muted-foreground">
          Kafei serving / waiting, plus the CofePlus live dispatch list for
          each pod. The kiosk APK scans a Kafei QR, then admin starts
          mode=immediate. Updates every 8 seconds.
          {serving + waiting > 0
            ? ` Kafei ${serving} serving · ${waiting} waiting.`
            : ''}
          {liveCount > 0 ? ` CofePlus ${liveCount} live.` : ''}
        </p>
      </div>
      <QueueBoard lanes={lanes} liveLanes={liveLanes} />
    </div>
  )
}
