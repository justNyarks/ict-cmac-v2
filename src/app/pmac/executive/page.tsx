import PmacRolePage from '../PmacRolePage'

export default function PmacExecutivePage() {
  return (
    <PmacRolePage
      allowedRole="PMAC_EXECUTIVE"
      nextPath="/pmac/executive"
      accessSummary="Executive access covers assigned PMAC events, availability responses, and branch-head tagging for members under the shared PMAC Executive role."
    />
  )
}
