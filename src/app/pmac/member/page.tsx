import PmacRolePage from '../PmacRolePage'

export default function PmacMemberPage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_MEMBER"
      nextPath="/pmac/member"
      accessSummary="Member access is focused on assigned PMAC events, individual coverage responses, protected PMAC visibility, and viewing branch tags assigned by executive heads."
    />
  )
}
