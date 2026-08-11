import { CofeplusApiTester } from '@/components/api-test/cofeplus-api-tester'

export default function ApiTestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">COFEPLUS API Test</h1>
        <p className="text-muted-foreground">
          Quick dispense for one-tap drinks, End-to-end flow for the guided path,
          or Raw endpoints for individual API calls. Toggle Test / Live in
          Connection.
        </p>
      </div>
      <CofeplusApiTester />
    </div>
  )
}
