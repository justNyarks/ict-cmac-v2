import PmacRolePage from '../PmacRolePage'

export default function PmacSecretaryPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_SECRETARY"
      nextPath="/pmac/secretary"
      accessSummary="Track approved events, duty assignment, attendance, members, and projects."
    />
  )
}
