import PmacRolePage from '../PmacRolePage'

export default function PmacAssistantDirectorPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_ASSISTANT_DIRECTOR"
      nextPath="/pmac/assistant-director"
      accessSummary="Assistant director access supports PMAC event management, staffing coordination, and visibility into operational workflows."
    />
  )
}
