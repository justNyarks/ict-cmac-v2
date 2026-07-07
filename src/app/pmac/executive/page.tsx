import PmacRolePage from '../PmacRolePage'

export default function PmacExecutivePage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_EXECUTIVE"
      nextPath="/pmac/executive"
      accessSummary="Manage assigned events, branch tags, and project teams for your specialty."
    />
  )
}
