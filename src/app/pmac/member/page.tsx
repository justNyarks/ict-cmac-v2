import PmacRolePage from '../PmacRolePage'

export default function PmacMemberPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_MEMBER"
      nextPath="/pmac/member"
      accessSummary="View your assigned events, project work, responses, and PMAC updates."
    />
  )
}
