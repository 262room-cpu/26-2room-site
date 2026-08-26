import { useRef, useState } from 'react'
import { reserveAdultRegistration } from '../api/adult-registration'
import {
  confirmRegistrationDocument,
  createRegistrationDocumentUpload,
  uploadRegistrationDocument,
} from '../api/registration'
import { calculateAgeOnDate } from '../utils/age'
import './KidsRegistrationForm.css'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_LABEL = '10 MB'

const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

const ALLOWED_FILE_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
]

const INITIAL_FORM_VALUES = {
  participantLastName: '',
  participantFirstName: '',
  participantMiddleName: '',
  participantBirthDate: '',
  participantGender: '',
  participantPhone: '',
  participantEmail: '',
  distanceId: '',
}

function getTodayValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isAllowedFile(file) {
  if (ALLOWED_FILE_TYPES.has(file.type)) {
    return true
  }

  const lowerCaseName = file.name.toLowerCase()

  return (
    !file.type &&
    ALLOWED_FILE_EXTENSIONS.some((extension) =>
      lowerCaseName.endsWith(extension),
    )
  )
}

function getDistanceDetails(distance) {
  const details = []

  if (distance.distanceMeters) {
    if (distance.distanceMeters >= 1000) {
      const km = distance.distanceMeters / 1000
      details.push(
        `${Number.isInteger(km) ? km : km.toFixed(1)} км`,
      )
    } else {
      details.push(`${distance.distanceMeters} м`)
    }
  }

  if (
    distance.minAge !== null &&
    distance.minAge !== undefined
  ) {
    details.push(`от ${distance.minAge} лет`)
  }

  if (
    distance.maxAge !== null &&
    distance.maxAge !== undefined
  ) {
    details.push(`до ${distance.maxAge} лет`)
  }

  return details.join(' · ')
}

function getAgeRestrictionError(age, distance) {
  if (age < 18) {
    return 'Взрослая регистрация доступна с 18 лет.'
  }

  if (
    distance.minAge !== null &&
    distance.minAge !== undefined &&
    age < distance.minAge
  ) {
    return `Минимальный возраст для этой дистанции: ${distance.minAge}.`
  }

  if (
    distance.maxAge !== null &&
    distance.maxAge !== undefined &&
    age > distance.maxAge
  ) {
    return `Максимальный возраст для этой дистанции: ${distance.maxAge}.`
  }

  return null
}

function validateForm(values, event, documentFiles, consentValues) {
  const errors = {}
  const distances = event.distances ?? []

  const selectedDistance = distances.find(
    (distance) =>
      String(distance.id) === values.distanceId,
  )

  if (!values.participantLastName.trim()) {
    errors.participantLastName = 'Укажите фамилию.'
  }

  if (!values.participantFirstName.trim()) {
    errors.participantFirstName = 'Укажите имя.'
  }

  if (!values.participantBirthDate) {
    errors.participantBirthDate = 'Укажите дату рождения.'
  } else {
    const birthDate = new Date(
      `${values.participantBirthDate}T00:00:00`,
    )

    const today = new Date(
      `${getTodayValue()}T00:00:00`,
    )

    if (Number.isNaN(birthDate.getTime())) {
      errors.participantBirthDate =
        'Укажите корректную дату рождения.'
    } else if (birthDate > today) {
      errors.participantBirthDate =
        'Дата рождения не может быть в будущем.'
    }
  }

  if (!values.participantGender) {
    errors.participantGender = 'Выберите пол.'
  }

  const phoneDigits =
    values.participantPhone.replace(/\D/g, '')

  if (!values.participantPhone.trim()) {
    errors.participantPhone = 'Укажите номер телефона.'
  } else if (
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    errors.participantPhone =
      'Укажите номер телефона, содержащий от 7 до 15 цифр.'
  }

  if (!values.participantEmail.trim()) {
    errors.participantEmail = 'Укажите email.'
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      values.participantEmail.trim(),
    )
  ) {
    errors.participantEmail =
      'Укажите корректный email.'
  }

  if (distances.length === 0) {
    errors.distanceId =
      'Дистанции мероприятия ещё не настроены.'
  } else if (!selectedDistance) {
    errors.distanceId = 'Выберите дистанцию.'
  } else if (
    !errors.participantBirthDate &&
    event.startsAt
  ) {
    const age = calculateAgeOnDate(
      values.participantBirthDate,
      event.startsAt,
    )

    const ageError =
      age === null
        ? null
        : getAgeRestrictionError(age, selectedDistance)

    if (ageError) {
      errors.distanceId = ageError
    }
  }

  for (const requirement of event.documentRequirements ?? []) {
    const errorKey = `document:${requirement.documentType}`
    const file = documentFiles[requirement.documentType]

    if (requirement.required && !file) {
      errors[errorKey] = 'Приложите обязательный документ.'
    } else if (file && !isAllowedFile(file)) {
      errors[errorKey] = 'Поддерживаются только PDF, JPG, JPEG и PNG.'
    } else if (file && file.size > MAX_FILE_SIZE_BYTES) {
      errors[errorKey] =
        `Размер файла не должен превышать ${MAX_FILE_SIZE_LABEL}.`
    }
  }

  for (const requirement of event.consentRequirements ?? []) {
    if (requirement.required && !consentValues[requirement.consentType]) {
      errors[`consent:${requirement.consentType}`] =
        'Подтвердите обязательное согласие.'
    }
  }

  return errors
}

function getSubmissionErrorMessage(code) {
  const messages = {
    event_not_open:
      'Регистрация на это мероприятие сейчас недоступна.',
    event_date_not_confirmed:
      'Дата мероприятия ещё не подтверждена.',
    registration_not_started:
      'Регистрация ещё не началась.',
    registration_closed:
      'Регистрация уже завершена.',
    sold_out:
      'Свободных мест больше нет.',
    group_sold_out:
      'Все места в этой категории заняты.',
    invalid_consents:
      'Проверьте согласия и попробуйте отправить форму ещё раз.',
    age_not_allowed:
      'Возраст участника не подходит для выбранной дистанции.',
    adult_required:
      'Для этой формы участнику должно быть не менее 18 лет.',
    registration_expired:
      'Время бронирования истекло. Нажмите кнопку ещё раз, чтобы создать новую бронь.',
    registration_not_pending:
      'Эта регистрация уже не ожидает оплату.',
    payment_already_started:
      'Оплата для этой регистрации уже была начата.',
    document_type_not_allowed:
      'Этот документ нельзя использовать для данной регистрации.',
    unsupported_file_type:
      'Неподдерживаемый формат расписки.',
    invalid_uploaded_file:
      'Загруженный файл не прошёл проверку.',
    uploaded_file_not_found:
      'Не удалось найти загруженный файл. Попробуйте отправить форму ещё раз.',
    document_upload_failed:
      'Не удалось загрузить расписку. Попробуйте ещё раз.',
    document_upload_network_error:
      'Соединение прервалось при загрузке расписки. Попробуйте ещё раз.',
    network_error:
      'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.',
  }

  return (
    messages[code] ??
    'Не удалось завершить регистрацию. Попробуйте ещё раз.'
  )
}

function AdultRegistrationForm({ event, previewMode = false }) {
  const [formValues, setFormValues] =
    useState(INITIAL_FORM_VALUES)
  const [documentFiles, setDocumentFiles] = useState({})
  const [consentValues, setConsentValues] = useState({})

  const [formErrors, setFormErrors] = useState({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationLocked, setRegistrationLocked] = useState(false)
  const [submissionComplete, setSubmissionComplete] =
    useState(false)

  const idempotencyKeyRef = useRef(null)
  const registrationSessionRef = useRef(null)
  const uploadedDocumentsRef = useRef(new Map())

  const distances = event.distances ?? []

  const clearFieldError = (name) => {
    setFormErrors((currentErrors) => {
      if (!currentErrors[name]) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[name]

      return nextErrors
    })
  }

  const handleChange = (eventChange) => {
    if (
      isSubmitting ||
      submissionComplete ||
      registrationSessionRef.current
    ) {
      return
    }

    const {
      name,
      type,
      value,
      checked,
    } = eventChange.target

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]:
        type === 'checkbox'
          ? checked
          : value,
    }))

    clearFieldError(name)
    setSubmitMessage('')
    setSubmitError('')
  }

  const handleFileChange = (documentType, eventChange) => {
    if (isSubmitting || submissionComplete) {
      return
    }

    uploadedDocumentsRef.current.delete(documentType)

    const file =
      eventChange.target.files?.[0] ?? null

    setDocumentFiles((currentFiles) => ({
      ...currentFiles,
      [documentType]: file,
    }))

    clearFieldError(`document:${documentType}`)
    setSubmitMessage('')
    setSubmitError('')
  }

  const handleConsentChange = (consentType, checked) => {
    if (isSubmitting || submissionComplete || registrationSessionRef.current) {
      return
    }

    setConsentValues((currentValues) => ({
      ...currentValues,
      [consentType]: checked,
    }))
    clearFieldError(`consent:${consentType}`)
    setSubmitMessage('')
    setSubmitError('')
  }

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault()

    if (previewMode) {
      return
    }

    if (isSubmitting || submissionComplete) {
      return
    }

    const nextErrors = validateForm(
      formValues,
      event,
      documentFiles,
      consentValues,
    )

    setFormErrors(nextErrors)
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0) {
      setSubmitMessage('')
      return
    }

    const selectedDistance = distances.find(
      (distance) =>
        String(distance.id) ===
        formValues.distanceId,
    )

    if (!selectedDistance) {
      setSubmitError(
        'Не удалось определить выбранную дистанцию.',
      )
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('Сохраняем данные участника…')

    try {
      let registrationSession =
        registrationSessionRef.current

      if (!registrationSession) {
        idempotencyKeyRef.current ??=
          crypto.randomUUID()

        registrationSession =
          await reserveAdultRegistration({
            eventSlug: event.slug,
            distanceCode:
              selectedDistance.code ??
              selectedDistance.id,
            participant: {
              lastName:
                formValues.participantLastName.trim(),
              firstName:
                formValues.participantFirstName.trim(),
              middleName:
                formValues.participantMiddleName.trim() ||
                null,
              dateOfBirth:
                formValues.participantBirthDate,
              gender:
                formValues.participantGender,
              phone:
                formValues.participantPhone.trim(),
              email:
                formValues.participantEmail.trim(),
            },
            consents: (event.consentRequirements ?? []).map((requirement) => ({
              consentType: requirement.consentType,
              consentVersion: requirement.consentVersion,
              accepted: Boolean(consentValues[requirement.consentType]),
            })),
            idempotencyKey:
              idempotencyKeyRef.current,
          })

        if (
          !registrationSession?.registrationId ||
          !registrationSession?.flowToken
        ) {
          throw new Error(
            'invalid_server_response',
          )
        }

        registrationSessionRef.current =
          registrationSession
        setRegistrationLocked(true)
      }

      const selectedDocuments = (event.documentRequirements ?? []).filter(
        (requirement) => documentFiles[requirement.documentType],
      )

      for (const requirement of selectedDocuments) {
        const file = documentFiles[requirement.documentType]
        let uploadedDocument = uploadedDocumentsRef.current.get(
          requirement.documentType,
        )

        if (!uploadedDocument) {
          setSubmitMessage(`Загружаем документ «${requirement.title}»…`)

          const { uploadInfo, uploadFile } =
            await createRegistrationDocumentUpload({
              registrationId: registrationSession.registrationId,
              flowToken: registrationSession.flowToken,
              documentType: requirement.documentType,
              file,
            })

          await uploadRegistrationDocument({
            signedUrl: uploadInfo.signedUrl,
            file: uploadFile,
          })

          uploadedDocument = {
            storagePath: uploadInfo.path,
            originalFilename: file.name,
          }
          uploadedDocumentsRef.current.set(
            requirement.documentType,
            uploadedDocument,
          )
        }

        setSubmitMessage(`Проверяем документ «${requirement.title}»…`)

        await confirmRegistrationDocument({
          registrationId: registrationSession.registrationId,
          flowToken: registrationSession.flowToken,
          documentType: requirement.documentType,
          storagePath: uploadedDocument.storagePath,
          originalFilename: uploadedDocument.originalFilename,
        })
      }

      setSubmissionComplete(true)

      setSubmitMessage(
        'Данные и документы сохранены. Следующий шаг — оплата.',
      )
    } catch (error) {
      if (
        error?.code === 'registration_expired'
      ) {
        idempotencyKeyRef.current = null
        registrationSessionRef.current = null
        setRegistrationLocked(false)
        uploadedDocumentsRef.current = new Map()
      }

      setSubmitMessage('')

      setSubmitError(
        getSubmissionErrorMessage(
          error?.code ?? error?.message,
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName = (name) =>
    `kidsRegistrationInput${
      formErrors[name]
        ? ' kidsRegistrationInputError'
        : ''
    }`

  return (
    <form
      className="kidsRegistrationForm"
      onSubmit={handleSubmit}
      noValidate
      autoComplete="off"
      aria-busy={isSubmitting}
    >
      <header className="kidsRegistrationHeading">
        <p className="kidsRegistrationEyebrow">
          Форма участия
        </p>

        <h2>Регистрация участника</h2>

        <p>
          {(event.documentRequirements ?? []).length > 0
            ? 'Заполните данные участника, выберите дистанцию и приложите необходимые документы.'
            : 'Заполните данные участника и выберите дистанцию.'}
        </p>
      </header>

      <section
        className="kidsRegistrationSection"
        aria-labelledby="participant-data-title"
      >
        <div className="kidsRegistrationSectionHeading">
          <span>01</span>

          <div>
            <h3 id="participant-data-title">
              Данные участника
            </h3>

            <p>
              Укажите данные так, как они указаны
              в документе, удостоверяющем личность.
            </p>
          </div>
        </div>

        <div className="kidsRegistrationGrid">
          <label
            className="kidsRegistrationField"
            htmlFor="participantLastName"
          >
            <span>
              Фамилия <small>обязательно</small>
            </span>

            <input
              className={inputClassName(
                'participantLastName',
              )}
              id="participantLastName"
              name="participantLastName"
              type="text"
              value={
                formValues.participantLastName
              }
              onChange={handleChange}
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
              required
            />

            {formErrors.participantLastName && (
              <em className="kidsRegistrationError">
                {
                  formErrors.participantLastName
                }
              </em>
            )}
          </label>

          <label
            className="kidsRegistrationField"
            htmlFor="participantFirstName"
          >
            <span>
              Имя <small>обязательно</small>
            </span>

            <input
              className={inputClassName(
                'participantFirstName',
              )}
              id="participantFirstName"
              name="participantFirstName"
              type="text"
              value={
                formValues.participantFirstName
              }
              onChange={handleChange}
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
              required
            />

            {formErrors.participantFirstName && (
              <em className="kidsRegistrationError">
                {
                  formErrors.participantFirstName
                }
              </em>
            )}
          </label>

          <label
            className="kidsRegistrationField"
            htmlFor="participantMiddleName"
          >
            <span>Отчество</span>

            <input
              className={inputClassName(
                'participantMiddleName',
              )}
              id="participantMiddleName"
              name="participantMiddleName"
              type="text"
              value={
                formValues.participantMiddleName
              }
              onChange={handleChange}
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
            />
          </label>

          <label
            className="kidsRegistrationField"
            htmlFor="participantBirthDate"
          >
            <span>
              Дата рождения{' '}
              <small>обязательно</small>
            </span>

            <input
              className={inputClassName(
                'participantBirthDate',
              )}
              id="participantBirthDate"
              name="participantBirthDate"
              type="date"
              max={getTodayValue()}
              value={
                formValues.participantBirthDate
              }
              onChange={handleChange}
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
              required
            />

            {formErrors.participantBirthDate && (
              <em className="kidsRegistrationError">
                {
                  formErrors.participantBirthDate
                }
              </em>
            )}
          </label>
        </div>

        <fieldset className="kidsRegistrationChoiceGroup">
          <legend>
            Пол <small>обязательно</small>
          </legend>

          <div className="kidsRegistrationChoices kidsRegistrationChoicesCompact">
            <label>
              <input
                type="radio"
                name="participantGender"
                value="male"
                checked={
                  formValues.participantGender ===
                  'male'
                }
                onChange={handleChange}
                disabled={
                  isSubmitting ||
                  submissionComplete ||
                  Boolean(
                    registrationLocked,
                  )
                }
              />

              <span>
                <strong>Мужской</strong>
              </span>
            </label>

            <label>
              <input
                type="radio"
                name="participantGender"
                value="female"
                checked={
                  formValues.participantGender ===
                  'female'
                }
                onChange={handleChange}
                disabled={
                  isSubmitting ||
                  submissionComplete ||
                  Boolean(
                    registrationLocked,
                  )
                }
              />

              <span>
                <strong>Женский</strong>
              </span>
            </label>
          </div>

          {formErrors.participantGender && (
            <em className="kidsRegistrationError">
              {formErrors.participantGender}
            </em>
          )}
        </fieldset>
      </section>

      <section
        className="kidsRegistrationSection"
        aria-labelledby="distance-title"
      >
        <div className="kidsRegistrationSectionHeading">
          <span>02</span>

          <div>
            <h3 id="distance-title">
              Дистанция
            </h3>

            <p>
              Выберите дистанцию, на которой будете
              участвовать.
            </p>
          </div>
        </div>

        {event.distanceSelectionNote && (
          <p className="kidsRegistrationNotice">
            {event.distanceSelectionNote}
          </p>
        )}

        <div className="kidsRegistrationChoices">
          {distances.map((distance) => {
            const details =
              getDistanceDetails(distance)

            return (
              <label key={distance.id}>
                <input
                  type="radio"
                  name="distanceId"
                  value={String(distance.id)}
                  checked={
                    formValues.distanceId ===
                    String(distance.id)
                  }
                  onChange={handleChange}
                  disabled={
                    isSubmitting ||
                    submissionComplete ||
                    Boolean(
                    registrationLocked,
                    )
                  }
                />

                <span>
                  <strong>
                    {distance.title}
                  </strong>

                  {details && (
                    <small>{details}</small>
                  )}
                </span>
              </label>
            )
          })}
        </div>

        {formErrors.distanceId && (
          <em className="kidsRegistrationError">
            {formErrors.distanceId}
          </em>
        )}
      </section>

      <section
        className="kidsRegistrationSection"
        aria-labelledby="contacts-title"
      >
        <div className="kidsRegistrationSectionHeading">
          <span>03</span>

          <div>
            <h3 id="contacts-title">
              Контакты
            </h3>

            <p>
              Эти данные используются для связи по
              регистрации и участию.
            </p>
          </div>
        </div>

        <div className="kidsRegistrationGrid">
          <label
            className="kidsRegistrationField"
            htmlFor="participantPhone"
          >
            <span>
              Телефон <small>обязательно</small>
            </span>

            <input
              className={inputClassName(
                'participantPhone',
              )}
              id="participantPhone"
              name="participantPhone"
              type="tel"
              value={
                formValues.participantPhone
              }
              onChange={handleChange}
              placeholder="+7 700 000 00 00"
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
              required
            />

            {formErrors.participantPhone && (
              <em className="kidsRegistrationError">
                {formErrors.participantPhone}
              </em>
            )}
          </label>

          <label
            className="kidsRegistrationField"
            htmlFor="participantEmail"
          >
            <span>
              Email <small>обязательно</small>
            </span>

            <input
              className={inputClassName(
                'participantEmail',
              )}
              id="participantEmail"
              name="participantEmail"
              type="email"
              value={
                formValues.participantEmail
              }
              onChange={handleChange}
              placeholder="name@example.com"
              disabled={
                isSubmitting ||
                submissionComplete ||
                Boolean(
                  registrationLocked,
                )
              }
              required
            />

            {formErrors.participantEmail && (
              <em className="kidsRegistrationError">
                {formErrors.participantEmail}
              </em>
            )}
          </label>
        </div>
      </section>

      {(event.documentRequirements ?? []).length > 0 && (
        <section className="kidsRegistrationSection" aria-labelledby="documents-title">
          <div className="kidsRegistrationSectionHeading">
            <span>04</span>
            <div>
              <h3 id="documents-title">Документы</h3>
              <p>Загрузите документы, настроенные организатором мероприятия.</p>
            </div>
          </div>

          <div className="kidsRegistrationFields">
            {(event.documentRequirements ?? []).map((requirement, index) => {
              const errorKey = `document:${requirement.documentType}`
              const inputId = `adult-document-${index}`
              const file = documentFiles[requirement.documentType]

              return (
                <label className="kidsRegistrationField kidsRegistrationFieldWide" htmlFor={inputId} key={requirement.documentType}>
                  <span>
                    {requirement.title}{' '}
                    <small>{requirement.required ? 'обязательно' : 'необязательно'}</small>
                  </span>
                  {requirement.description && (
                    <span className="kidsRegistrationHelp">{requirement.description}</span>
                  )}
                  {requirement.templateUrl && (
                    <a className="kidsRegistrationDocumentLink" href={requirement.templateUrl} target="_blank" rel="noreferrer">
                      Открыть шаблон документа
                    </a>
                  )}
                  <input
                    className={inputClassName(errorKey)}
                    id={inputId}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(changeEvent) => handleFileChange(requirement.documentType, changeEvent)}
                    disabled={isSubmitting || submissionComplete}
                    aria-invalid={Boolean(formErrors[errorKey])}
                    required={requirement.required}
                  />
                  <span className="kidsRegistrationHelp">
                    PDF, JPG, JPEG или PNG. Максимальный размер — {MAX_FILE_SIZE_LABEL}.
                  </span>
                  {file && (
                    <span className="kidsRegistrationFileName">{file.name}</span>
                  )}
                  {formErrors[errorKey] && (
                    <em className="kidsRegistrationError">{formErrors[errorKey]}</em>
                  )}
                </label>
              )
            })}
          </div>
        </section>
      )}

      {(event.consentRequirements ?? []).length > 0 && (
        <section className="kidsRegistrationSection" aria-labelledby="consents-title">
          <div className="kidsRegistrationSectionHeading">
            <span>
              {(event.documentRequirements ?? []).length > 0 ? '05' : '04'}
            </span>
            <div>
              <h3 id="consents-title">Подтверждения</h3>
              <p>Обязательные согласия нужно подтвердить для продолжения.</p>
            </div>
          </div>

          <div className="kidsRegistrationConsents">
            {(event.consentRequirements ?? []).map((requirement) => {
              const errorKey = `consent:${requirement.consentType}`

              return (
                <div className="kidsRegistrationConsent" key={requirement.consentType}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(consentValues[requirement.consentType])}
                      onChange={(changeEvent) => handleConsentChange(requirement.consentType, changeEvent.target.checked)}
                      disabled={isSubmitting || submissionComplete || registrationLocked}
                      aria-invalid={Boolean(formErrors[errorKey])}
                      required={requirement.required}
                    />
                    <span>
                      <strong>{requirement.title}</strong>
                      <small>{requirement.bodyText}</small>
                      {!requirement.required && <small>Необязательное согласие</small>}
                    </span>
                  </label>
                  {requirement.documentUrl && (
                    <a className="kidsRegistrationDocumentLink" href={requirement.documentUrl} target="_blank" rel="noreferrer">
                      Открыть документ
                    </a>
                  )}
                  {formErrors[errorKey] && (
                    <em className="kidsRegistrationError">{formErrors[errorKey]}</em>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {submitError && (
        <p
          className="kidsRegistrationFormAlert"
          role="alert"
        >
          {submitError}
        </p>
      )}

      {submitMessage && (
        <p
          className={
            submissionComplete
              ? 'kidsRegistrationSuccess'
              : 'kidsRegistrationNotice'
          }
          aria-live="polite"
        >
          {submitMessage}
        </p>
      )}

      <button
        className="kidsRegistrationSubmit"
        type="submit"
        disabled={
          previewMode ||
          isSubmitting ||
          submissionComplete
        }
      >
        {previewMode
          ? 'Предпросмотр — отправка отключена'
          : submissionComplete
          ? 'Данные сохранены'
          : isSubmitting
            ? 'Сохраняем…'
            : 'Продолжить к оплате'}
      </button>
    </form>
  )
}

export default AdultRegistrationForm
