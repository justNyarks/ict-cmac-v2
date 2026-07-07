import PmacRolePage from '../PmacRolePage'

export default function PmacDirectorPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_DIRECTOR"
      nextPath="/pmac/director"
      accessSummary="Review PMAC events, polls, members, reports, and branch projects."
    />
  )
}
