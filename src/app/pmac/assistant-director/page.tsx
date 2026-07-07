import PmacRolePage from '../PmacRolePage'

export default function PmacAssistantDirectorPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_ASSISTANT_DIRECTOR"
      nextPath="/pmac/assistant-director"
      accessSummary="Create events and polls, coordinate staffing, and monitor PMAC activity."
    />
  )
}
