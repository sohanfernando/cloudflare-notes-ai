import type { Gap } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'
import * as api from '@/lib/api'

/**
 * The questions the user's notes could not answer. Gaps are a secondary
 * feature, so a failed load just leaves the list empty rather than showing an error.
 */
export function useGaps() {
  const [gaps, setGaps] = useState<Gap[]>([])

  const refresh = useCallback(() => {
    api.fetchGaps().then(setGaps, () => undefined)
  }, [])

  useEffect(refresh, [refresh])

  const dismiss = useCallback(
    async (id: string) => {
      setGaps((current) => current.filter((gap) => gap.id !== id))
      // If the server did not remove it, reload so the list shows the truth again.
      await api.dismissGap(id).catch(refresh)
    },
    [refresh],
  )

  return { gaps, refresh, dismiss }
}
