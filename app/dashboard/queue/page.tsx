import { getMachineQueueLanes } from '@/app/actions/queue'
import { QueueBoard } from './queue-board'

export const dynamic = 'force-dynamic'

export default async function QueuePage() {
  const lanes = await getMachineQueueLanes()
  const waiting = lanes.reduce((sum, lane) => sum + lane.waiting.length, 0)
  const serving = lanes.reduce((sum, lane) => sum + lane.serving.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Machine queue</h1>
        <p className="text-muted-foreground">
          Who is at the machine and who is waiting. Updates every 8 seconds.
          After a QR scan we poll CofePlus{' '}
          <code>GET /dispatches/{'{podId}'}/{'{orderId}'}</code>. Skip queue
          uses <code>mode=immediate</code> so the machine brews without waiting
          for a scan.
          {serving + waiting > 0
            ? ` ${serving} serving · ${waiting} waiting.`
            : ''}
        </p>
      </div>
      <QueueBoard lanes={lanes} />
    </div>
  )
}
