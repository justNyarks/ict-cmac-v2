import PmacRolePage from '../PmacRolePage'

export default function PmacExecutivePage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_EXECUTIVE"
      nextPath="/pmac/executive"
      accessSummary="Executive access is focused on assigned PMAC events and coverage availability responses within the operational workflow."
    />
  )
}
