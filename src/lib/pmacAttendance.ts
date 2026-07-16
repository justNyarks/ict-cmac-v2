type AttendanceScopeRecord = {
  eventId: string
  memberId: string
}

export function getPmacAttendanceRecordKey(record: AttendanceScopeRecord) {
  return `${record.eventId}:${record.memberId}`
}

export function validatePmacAttendanceSubmission(
  records: AttendanceScopeRecord[],
  assignedMemberKeys?: ReadonlySet<string>,
) {
  if (!records.length) {
    return 'Add at least one attendance record before saving.'
  }

  if (records.length > 500) {
    return 'Attendance can be saved for up to 500 members at a time.'
  }

  const recordKeys = records.map(getPmacAttendanceRecordKey)
  if (new Set(recordKeys).size !== recordKeys.length) {
    return 'Each assigned member can only appear once per event.'
  }

  if (assignedMemberKeys && recordKeys.some(key => !assignedMemberKeys.has(key))) {
    return 'Attendance can only be recorded for members assigned to the selected event.'
  }

  return null
}
