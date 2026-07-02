import PmacRolePage from '../PmacRolePage'

export default function PmacDirectorPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_DIRECTOR"
      nextPath="/pmac/director"
      accessSummary="Director access includes draft event creation, submission for CMAC approval, staffing oversight, and PMAC workflow completion."
    />
  )
}
