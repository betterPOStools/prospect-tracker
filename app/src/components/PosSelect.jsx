import { useState } from 'react'
import { POS_OPTIONS } from '../data/helpers.js'

// value / onChange: the resolved POS string (not "__other__")
export default function PosSelect({ value = '', onChange, id }) {
  const isOther = value !== '' && !POS_OPTIONS.includes(value)
  const [showOther, setShowOther] = useState(isOther)

  function handleSelect(e) {
    const v = e.target.value
    if (v === '__other__') {
      setShowOther(true)
      onChange('')
    } else {
      setShowOther(false)
      onChange(v)
    }
  }

  const selectVal = isOther || showOther ? '__other__' : value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <select id={id} value={selectVal} onChange={handleSelect}>
        <option value="">Current POS system…</option>
        {POS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other…</option>
      </select>
      {(showOther || isOther) && (
        <input
          type="text"
          value={isOther ? value : ''}
          placeholder="Specify POS system…"
          onChange={e => onChange(e.target.value)}
          autoFocus={showOther && !isOther}
        />
      )}
    </div>
  )
}
