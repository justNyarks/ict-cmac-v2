import PmacRolePage from '../PmacRolePage'

export default function PmacSecretaryPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_SECRETARY"
      nextPath="/pmac/secretary"
      accessSummary="Secretary access includes PMAC event visibility, staffing support, and attendance recording after events are approved."
    />
  )
}
