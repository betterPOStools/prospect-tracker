import { useState, useCallback } from 'react'
import { settings } from '../../lib/storage'
import { useTheme } from '../../hooks/useTheme'
import Select from '../../components/Select'
import Input from '../../components/Input'

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
    </div>
  )
}
