import { useState, useCallback } from 'react'
import { settings } from '../../lib/storage'
import { useTheme } from '../../hooks/useTheme'
import { useCopper } from '../../hooks/useCopper'
import Select from '../../components/Select'
import Input from '../../components/Input'
import Button from '../../components/Button'
import type { CopperPipeline } from '../../lib/copper'

const MAPS_OPTIONS = [
  { value: 'google', label: 'Google Maps' },
  { value: 'waze', label: 'Waze' },
]

export default function SettingsPanel() {
  const { theme, toggle } = useTheme()

  const [mapsApp, setMapsAppState] = useState<'google' | 'waze'>(() => settings.getMapsApp())
  const [homeAddr, setHomeAddr] = useState(() => localStorage.getItem('vs_home_addr') ?? '')
  const [officeAddr, setOfficeAddr] = useState(() => localStorage.getItem('vs_office_addr') ?? '')
  const [rxlUser, setRxlUserState] = useState(() => settings.getRxlUser())
  const [rxlPass, setRxlPassState] = useState(() => settings.getRxlPass())
  const [osKey, setOsKeyState] = useState(() => settings.getOsKey())
  const [cuKey, setCuKeyState] = useState(() => settings.getCopperApiKey())
  const [cuEmail, setCuEmailState] = useState(() => settings.getCopperEmail())
  const [cuPipeline, setCuPipeline] = useState(() => settings.getCopperPipeline())
  const [pipelines, setPipelines] = useState<CopperPipeline[]>([])
  const [pipelinesLoading, setPipelinesLoading] = useState(false)
  const [pipelinesError, setPipelinesError] = useState<string | null>(null)
  const { loadPipelines } = useCopper()

  const handleMapsApp = useCallback((val: string) => {
    const v = val as 'google' | 'waze'
    setMapsAppState(v)
    settings.setMapsApp(v)
  }, [])

  const handleHomeAddr = useCallback((val: string) => {
    setHomeAddr(val)
    localStorage.setItem('vs_home_addr', val)
  }, [])

  const handleOfficeAddr = useCallback((val: string) => {
    setOfficeAddr(val)
    localStorage.setItem('vs_office_addr', val)
  }, [])

  const handleRxlUser = useCallback((val: string) => {
    setRxlUserState(val)
    settings.setRxlUser(val)
  }, [])

  const handleRxlPass = useCallback((val: string) => {
    setRxlPassState(val)
    settings.setRxlPass(val)
  }, [])

  const handleOsKey = useCallback((val: string) => {
    setOsKeyState(val)
    settings.setOsKey(val)
  }, [])

  const handleCuKey = useCallback((val: string) => {
    setCuKeyState(val)
    settings.setCopperApiKey(val)
  }, [])

  const handleCuEmail = useCallback((val: string) => {
    setCuEmailState(val)
    settings.setCopperEmail(val)
  }, [])

  const handleLoadPipelines = useCallback(async () => {
    setPipelinesLoading(true)
    setPipelinesError(null)
    try {
      const result = await loadPipelines()
      setPipelines(result)
      // Auto-select first pipeline + first stage if none configured
      if (result.length > 0 && !cuPipeline) {
        const first = result[0]
        const stage = first.stages[0]
        if (stage) {
          const cfg = { pipeline_id: first.id, stage_id: stage.id }
          setCuPipeline(cfg)
          settings.setCopperPipeline(cfg)
        }
      }
    } catch (e) {
      setPipelinesError(e instanceof Error ? e.message : 'Failed to load pipelines')
    } finally {
      setPipelinesLoading(false)
    }
  }, [loadPipelines, cuPipeline])

  const handlePipelineSelect = useCallback((val: string) => {
    const [pipelineId, stageId] = val.split(':').map(Number)
    if (pipelineId && stageId) {
      const cfg = { pipeline_id: pipelineId, stage_id: stageId }
      setCuPipeline(cfg)
      settings.setCopperPipeline(cfg)
    }
  }, [])

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4">
      {/* Appearance */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Appearance
        </h3>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Dark Mode</p>
            <p className="text-xs text-gray-500">Currently: {theme === 'dark' ? 'Dark' : 'Light'}</p>
          </div>
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Dark Mode"
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
              theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Route Provider */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Navigation
        </h3>
        <Select
          label="Route Provider"
          options={MAPS_OPTIONS}
          value={mapsApp}
          onChange={(e) => handleMapsApp(e.target.value)}
        />
      </section>

      {/* Route Endpoints */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Route Endpoints
        </h3>
        <div className="flex flex-col gap-3">
          <Input
            label="Home Address"
            placeholder="123 Main St, Wilmington, NC 28401"
            value={homeAddr}
            onChange={(e) => handleHomeAddr(e.target.value)}
          />
          <Input
            label="Office Address"
            placeholder="456 Office Rd, Wilmington, NC 28403"
            value={officeAddr}
            onChange={(e) => handleOfficeAddr(e.target.value)}
          />
        </div>
      </section>

      {/* RouteXL Credentials */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          RouteXL Credentials
        </h3>
        <div className="flex flex-col gap-3">
          <Input
            label="Username"
            placeholder="your@email.com"
            value={rxlUser}
            onChange={(e) => handleRxlUser(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={rxlPass}
            onChange={(e) => handleRxlPass(e.target.value)}
          />
        </div>
      </section>

      {/* Outscraper API Key */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Outscraper
        </h3>
        <Input
          label="API Key"
          placeholder="os_••••••••"
          value={osKey}
          onChange={(e) => handleOsKey(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-gray-400">
          Also configurable in Import → Settings.
        </p>
      </section>

      {/* Copper CRM */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Copper CRM
        </h3>
        <div className="flex flex-col gap-3">
          <Input
            label="API Key"
            type="password"
            placeholder="••••••••"
            value={cuKey}
            onChange={(e) => handleCuKey(e.target.value)}
          />
          <Input
            label="Email"
            placeholder="aaron@valuesystemspos.com"
            value={cuEmail}
            onChange={(e) => handleCuEmail(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleLoadPipelines}
              disabled={pipelinesLoading || !cuKey || !cuEmail}
            >
              {pipelinesLoading ? 'Loading...' : 'Load Pipelines'}
            </Button>
            {pipelinesError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {pipelinesError}
              </p>
            )}
            {pipelines.length > 0 && (
              <select
                value={cuPipeline ? `${cuPipeline.pipeline_id}:${cuPipeline.stage_id}` : ''}
                onChange={(e) => handlePipelineSelect(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select pipeline & stage</option>
                {pipelines.flatMap((p) =>
                  p.stages.map((s) => (
                    <option key={`${p.id}:${s.id}`} value={`${p.id}:${s.id}`}>
                      {p.name} → {s.name}
                    </option>
                  )),
                )}
              </select>
            )}
            {cuPipeline && pipelines.length === 0 && (
              <p className="text-xs text-green-600">
                Pipeline configured (ID: {cuPipeline.pipeline_id}, Stage: {cuPipeline.stage_id})
              </p>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          One-way push to Copper. Leads synced as Company + Person + Opportunity.
        </p>
      </section>
    </div>
  )
}
