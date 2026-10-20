import { useState } from 'react'
import { Problem } from '../shell.tsx'
import type { Translate } from '../types/dsh.ts'
import { WidgetFrame, type WidgetFrameProps } from './WidgetFrame.tsx'

export function WidgetWithErrors({ t, ...props }: Omit<WidgetFrameProps, 'onErrors'> & { t: Translate }) {
  const [errors, setErrors] = useState<readonly string[]>([])
  return (
    <>
      <WidgetFrame {...props} onErrors={setErrors} />
      {errors.length > 0 && <Problem t={t} message={t('widget.scriptErrors', { count: String(errors.length) })} detail={errors.join('\n')} />}
    </>
  )
}
