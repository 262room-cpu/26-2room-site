const REGISTRATION_FORM_TYPES = new Set(['kids', 'participant', 'mixed'])
const GROUP_FORM_TYPES = new Set(['kids', 'participant'])

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validOptionalCapacity(value) {
  return value === null || (Number.isSafeInteger(value) && value > 0)
}

function compatibleGroupType(eventType, groupType) {
  if (!GROUP_FORM_TYPES.has(groupType)) {
    return false
  }

  return eventType === 'mixed' || eventType === groupType
}

export function getEventReadiness({
  event,
  groups = [],
  distances = [],
  documents = [],
  consents = [],
}) {
  const publicReasons = []
  const registrationReasons = []
  const requiredPublicFields = [
    event?.title,
    event?.eventType,
    event?.shortDescription,
    event?.description,
    event?.city,
  ]

  if (requiredPublicFields.some((value) => !hasText(value))) {
    publicReasons.push('incomplete_public_details')
  }

  const registrationFormType = event?.registrationFormType

  if (!REGISTRATION_FORM_TYPES.has(registrationFormType)) {
    registrationReasons.push('invalid_registration_form_type')
  }

  if (event?.dateStatus !== 'confirmed' || !hasText(event?.startsAt)) {
    registrationReasons.push('date_not_confirmed')
  }

  if (groups.length === 0) {
    registrationReasons.push('no_registration_groups')
  }

  const validGroups = new Map()
  let hasRegistrationFormMismatch = false

  for (const group of groups) {
    if (
      !hasText(group?.id) ||
      !compatibleGroupType(registrationFormType, group?.registrationFormType)
    ) {
      hasRegistrationFormMismatch = true
      continue
    }

    if (!validOptionalCapacity(group.capacity)) {
      registrationReasons.push('invalid_capacity')
    }

    validGroups.set(group.id, group)
  }

  if (hasRegistrationFormMismatch) {
    registrationReasons.push('registration_form_mismatch')
  }

  if (distances.length === 0) {
    registrationReasons.push('no_distances')
  }

  let hasInvalidDistanceGroup = false
  let hasInvalidDistance = false
  let hasInvalidPrice = false

  for (const distance of distances) {
    if (!validGroups.has(distance?.groupId)) {
      hasInvalidDistanceGroup = true
    }

    if (
      !hasText(distance?.code) ||
      !hasText(distance?.title) ||
      !Number.isSafeInteger(distance?.distanceMeters) ||
      distance.distanceMeters <= 0 ||
      !validOptionalCapacity(distance?.capacity)
    ) {
      hasInvalidDistance = true
    }

    const effectivePrice = distance?.priceMinor ?? event?.priceMinor

    if (!Number.isSafeInteger(effectivePrice) || effectivePrice < 0) {
      hasInvalidPrice = true
    }
  }

  if (hasInvalidDistanceGroup) {
    registrationReasons.push('invalid_distance_group')
  }

  if (hasInvalidDistance) {
    registrationReasons.push('invalid_distance')
  }

  if (hasInvalidPrice) {
    registrationReasons.push('invalid_price')
  }

  if (!validOptionalCapacity(event?.capacity)) {
    registrationReasons.push('invalid_capacity')
  }

  if (!hasText(event?.currency) || !/^[A-Z]{3}$/.test(event.currency)) {
    registrationReasons.push('invalid_currency')
  }

  const uniqueRegistrationReasons = [...new Set(registrationReasons)]

  return {
    publicPage: {
      ready: publicReasons.length === 0,
      reasons: publicReasons,
    },
    registration: {
      ready: uniqueRegistrationReasons.length === 0,
      reasons: uniqueRegistrationReasons,
    },
    summary: {
      groupCount: groups.length,
      distanceCount: distances.length,
      documentCount: documents.length,
      consentCount: consents.length,
      isPublished: event?.isPublished === true,
      status: event?.status ?? null,
    },
  }
}
