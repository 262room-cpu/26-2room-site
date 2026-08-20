import { useRef, useState } from 'react'
import {
  confirmLiabilityDocument,
  createLiabilityDocumentUpload,
  reserveKidsRegistration,
  uploadLiabilityDocument,
} from '../api/registration'
import { calculateAgeOnDate } from '../utils/age'
import './KidsRegistrationForm.css'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_LABEL = '10 MB'
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']

const INITIAL_FORM_VALUES = {
  childLastName: '',
  childFirstName: '',
  childMiddleName: '',
  childBirthDate: '',
  childGender: '',
  distanceId: '',
  parentFullName: '',
  parentPhone: '',
  parentEmail: '',
  liabilityDocument: null,
  acceptEventRules: false,
  acceptPersonalData: false,
  acceptResponsibility: false,
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
  return !file.type && ALLOWED_FILE_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension))
}

function getAgeRestrictionError(age, distance) {
  const hasMinAge = distance.minAge !== null && distance.minAge !== undefined
  const hasMaxAge = distance.maxAge !== null && distance.maxAge !== undefined

  if (hasMinAge && age < distance.minAge) {
    return `Минимальный возраст для этой дистанции: ${distance.minAge}.`
  }

  if (hasMaxAge && age > distance.maxAge) {
    return `Максимальный возраст для этой дистанции: ${distance.maxAge}.`
  }

  return null
}

function validateForm(values, event) {
  const errors = {}
  const distances = event.distances ?? []
  const selectedDistance = distances.find((distance) => String(distance.id) === values.distanceId)

  if (!values.childLastName.trim()) {
    errors.childLastName = 'Укажите фамилию ребёнка.'
  }

  if (!values.childFirstName.trim()) {
    errors.childFirstName = 'Укажите имя ребёнка.'
  }

  if (!values.childBirthDate) {
    errors.childBirthDate = 'Укажите дату рождения ребёнка.'
  } else {
    const birthDate = new Date(`${values.childBirthDate}T00:00:00`)
    const today = new Date(`${getTodayValue()}T00:00:00`)

    if (Number.isNaN(birthDate.getTime())) {
      errors.childBirthDate = 'Укажите корректную дату рождения.'
    } else if (birthDate > today) {
      errors.childBirthDate = 'Дата рождения не может быть в будущем.'
    } else if (event.startsAt && birthDate > new Date(event.startsAt)) {
      errors.childBirthDate = 'Дата рождения должна быть раньше даты мероприятия.'
    }
  }

  if (!values.childGender) {
    errors.childGender = 'Выберите пол ребёнка.'
  }

  if (distances.length === 0) {
    errors.distanceId = 'Дистанции мероприятия ещё не настроены.'
  } else if (!selectedDistance) {
    errors.distanceId = 'Выберите дистанцию.'
  } else if (!errors.childBirthDate && event.startsAt) {
    const age = calculateAgeOnDate(values.childBirthDate, event.startsAt)
    const ageError = age === null ? null : getAgeRestrictionError(age, selectedDistance)

    if (ageError) {
      errors.distanceId = ageError
    }
  }

  if (!values.parentFullName.trim()) {
    errors.parentFullName = 'Укажите ФИО родителя или законного представителя.'
  }

  const phoneDigits = values.parentPhone.replace(/\D/g, '')
  if (!values.parentPhone.trim()) {
    errors.parentPhone = 'Укажите номер телефона.'
  } else if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.parentPhone = 'Укажите номер телефона, содержащий от 7 до 15 цифр.'
  }

  if (!values.parentEmail.trim()) {
    errors.parentEmail = 'Укажите email.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.parentEmail.trim())) {
    errors.parentEmail = 'Укажите корректный email.'
  }

  if (!values.liabilityDocument) {
    errors.liabilityDocument = 'Приложите подписанную расписку.'
  } else if (!isAllowedFile(values.liabilityDocument)) {
    errors.liabilityDocument = 'Поддерживаются только PDF, JPG, JPEG и PNG.'
  } else if (values.liabilityDocument.size > MAX_FILE_SIZE_BYTES) {
    errors.liabilityDocument = `Размер файла не должен превышать ${MAX_FILE_SIZE_LABEL}.`
  }

  if (!values.acceptEventRules) {
    errors.acceptEventRules = 'Подтвердите ознакомление с правилами мероприятия.'
  }

  if (!values.acceptPersonalData) {
    errors.acceptPersonalData = 'Подтвердите согласие на обработку персональных данных.'
  }

  if (!values.acceptResponsibility) {
    errors.acceptResponsibility = 'Подтвердите ответственность представителя.'
  }

  return errors
}

function getDistanceDetails(distance) {
  const details = []

  if (distance.distanceMeters) {
    details.push(`${distance.distanceMeters} м`)
  }

  if (distance.minAge !== null && distance.minAge !== undefined) {
    details.push(`от ${distance.minAge} лет`)
  }

  if (distance.maxAge !== null && distance.maxAge !== undefined) {
    details.push(`до ${distance.maxAge} лет`)
  }

  return details.join(' · ')
}

function getSubmissionErrorMessage(code) {
  const messages = {
    event_not_open: 'Регистрация на это мероприятие сейчас недоступна.',
    registration_not_started: 'Регистрация ещё не началась.',
    registration_closed: 'Регистрация уже завершена.',
    sold_out: 'Свободных мест больше нет.',
    group_sold_out: 'Все места в этой категории заняты.',
    age_not_allowed: 'Возраст участника не подходит для выбранной дистанции.',
    registration_expired: 'Время бронирования истекло. Нажмите кнопку ещё раз, чтобы создать новую бронь.',
    registration_not_pending: 'Эта регистрация уже не ожидает оплату.',
    payment_already_started: 'Оплата для этой регистрации уже была начата.',
    unsupported_file_type: 'Неподдерживаемый формат файла расписки.',
    invalid_uploaded_file: 'Загруженный файл не прошёл проверку.',
    uploaded_file_not_found: 'Не удалось найти загруженный файл. Попробуйте отправить форму ещё раз.',
    document_upload_failed: 'Не удалось загрузить расписку. Попробуйте ещё раз.',
    document_upload_network_error: 'Соединение прервалось при загрузке расписки. Попробуйте ещё раз.',
    network_error: 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.',
  }

  return messages[code] ?? 'Не удалось завершить регистрацию. Попробуйте ещё раз.'
}

function KidsRegistrationForm({ event }) {
  const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES)
  const [formErrors, setFormErrors] = useState({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionComplete, setSubmissionComplete] = useState(false)
  const idempotencyKeyRef = useRef(null)
  const registrationSessionRef = useRef(null)
  const uploadedDocumentRef = useRef(null)
  const distances = event.distances ?? []
  const distanceDescribedBy = [
    distances.length === 0 ? 'distance-help' : null,
    formErrors.distanceId ? 'distanceId-error' : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

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
    if (isSubmitting || submissionComplete || registrationSessionRef.current) {
      return
    }

    const { name, type, value, checked } = eventChange.target
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: type === 'checkbox' ? checked : value,
    }))
    clearFieldError(name)
    setSubmitMessage('')
    setSubmitError('')
  }

  const handleFileChange = (eventChange) => {
    if (isSubmitting || submissionComplete) {
      return
    }

    uploadedDocumentRef.current = null

    const file = eventChange.target.files?.[0] ?? null
    setFormValues((currentValues) => ({ ...currentValues, liabilityDocument: file }))
    clearFieldError('liabilityDocument')
    setSubmitMessage('')
    setSubmitError('')
  }

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault()

    if (isSubmitting || submissionComplete) {
      return
    }

    const nextErrors = validateForm(formValues, event)
    setFormErrors(nextErrors)
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0) {
      setSubmitMessage('')
      return
    }

    const selectedDistance = distances.find(
      (distance) => String(distance.id) === formValues.distanceId,
    )

    if (!selectedDistance) {
      setSubmitError('Не удалось определить выбранную дистанцию.')
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('Сохраняем данные участника…')

    try {
      let registrationSession = registrationSessionRef.current

      if (!registrationSession) {
        idempotencyKeyRef.current ??= crypto.randomUUID()

        registrationSession = await reserveKidsRegistration({
          eventSlug: event.slug,
          distanceCode: selectedDistance.code ?? selectedDistance.id,
          child: {
            lastName: formValues.childLastName.trim(),
            firstName: formValues.childFirstName.trim(),
            middleName: formValues.childMiddleName.trim() || null,
            dateOfBirth: formValues.childBirthDate,
            gender: formValues.childGender,
          },
          parent: {
            fullName: formValues.parentFullName.trim(),
            phone: formValues.parentPhone.trim(),
            email: formValues.parentEmail.trim(),
          },
          consents: {
            eventRules: formValues.acceptEventRules,
            personalData: formValues.acceptPersonalData,
            parentResponsibility: formValues.acceptResponsibility,
          },
          idempotencyKey: idempotencyKeyRef.current,
        })

        if (!registrationSession?.registrationId || !registrationSession?.flowToken) {
          throw new Error('invalid_server_response')
        }

        registrationSessionRef.current = registrationSession
      }

      let uploadedDocument = uploadedDocumentRef.current

      if (!uploadedDocument) {
        setSubmitMessage('Место зарезервировано. Загружаем расписку…')

        const { uploadInfo, uploadFile } = await createLiabilityDocumentUpload({
          registrationId: registrationSession.registrationId,
          flowToken: registrationSession.flowToken,
          file: formValues.liabilityDocument,
        })

        await uploadLiabilityDocument({
          signedUrl: uploadInfo.signedUrl,
          file: uploadFile,
        })

        uploadedDocument = {
          storagePath: uploadInfo.path,
          originalFilename: formValues.liabilityDocument.name,
        }
        uploadedDocumentRef.current = uploadedDocument
      }

      setSubmitMessage('Расписка загружена. Проверяем файл…')

      await confirmLiabilityDocument({
        registrationId: registrationSession.registrationId,
        flowToken: registrationSession.flowToken,
        storagePath: uploadedDocument.storagePath,
        originalFilename: uploadedDocument.originalFilename,
      })

      setSubmissionComplete(true)
      setSubmitMessage('Данные и расписка сохранены. Следующий шаг — оплата.')
    } catch (error) {
      if (error?.code === 'registration_expired') {
        idempotencyKeyRef.current = null
        registrationSessionRef.current = null
        uploadedDocumentRef.current = null
      }

      setSubmitMessage('')
      setSubmitError(getSubmissionErrorMessage(error?.code ?? error?.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName = (name) =>
    `kidsRegistrationInput${formErrors[name] ? ' kidsRegistrationInputError' : ''}`

  return (
    <form
      className="kidsRegistrationForm"
      onSubmit={handleSubmit}
      noValidate
      autoComplete="off"
      aria-busy={isSubmitting}
    >
      <header className="kidsRegistrationHeading">
        <p className="kidsRegistrationEyebrow">Форма участия</p>
        <h2>Регистрация участника</h2>
        <p>Заполните данные ребёнка и родителя / законного представителя.</p>
      </header>

      <section className="kidsRegistrationSection" aria-labelledby="child-data-title">
        <div className="kidsRegistrationSectionHeading">
          <span>01</span>
          <div>
            <h3 id="child-data-title">Данные ребёнка</h3>
            <p>Поля с отметкой «обязательно» нужны для продолжения.</p>
          </div>
        </div>

        <div className="kidsRegistrationGrid">
          <label className="kidsRegistrationField" htmlFor="childLastName">
            <span>
              Фамилия <small>обязательно</small>
            </span>
            <input
              className={inputClassName('childLastName')}
              id="childLastName"
              name="childLastName"
              type="text"
              value={formValues.childLastName}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.childLastName)}
              aria-describedby={formErrors.childLastName ? 'childLastName-error' : undefined}
              required
            />
            {formErrors.childLastName && (
              <em className="kidsRegistrationError" id="childLastName-error">
                {formErrors.childLastName}
              </em>
            )}
          </label>

          <label className="kidsRegistrationField" htmlFor="childFirstName">
            <span>
              Имя <small>обязательно</small>
            </span>
            <input
              className={inputClassName('childFirstName')}
              id="childFirstName"
              name="childFirstName"
              type="text"
              value={formValues.childFirstName}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.childFirstName)}
              aria-describedby={formErrors.childFirstName ? 'childFirstName-error' : undefined}
              required
            />
            {formErrors.childFirstName && (
              <em className="kidsRegistrationError" id="childFirstName-error">
                {formErrors.childFirstName}
              </em>
            )}
          </label>

          <label className="kidsRegistrationField" htmlFor="childMiddleName">
            <span>Отчество <small>необязательно</small></span>
            <input
              className={inputClassName('childMiddleName')}
              id="childMiddleName"
              name="childMiddleName"
              type="text"
              value={formValues.childMiddleName}
              onChange={handleChange}
            />
          </label>

          <label className="kidsRegistrationField" htmlFor="childBirthDate">
            <span>
              Дата рождения <small>обязательно</small>
            </span>
            <input
              className={inputClassName('childBirthDate')}
              id="childBirthDate"
              max={getTodayValue()}
              name="childBirthDate"
              type="date"
              value={formValues.childBirthDate}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.childBirthDate)}
              aria-describedby={formErrors.childBirthDate ? 'childBirthDate-error' : undefined}
              required
            />
            {formErrors.childBirthDate && (
              <em className="kidsRegistrationError" id="childBirthDate-error">
                {formErrors.childBirthDate}
              </em>
            )}
          </label>
        </div>

        <fieldset
          className="kidsRegistrationChoiceGroup"
          aria-invalid={Boolean(formErrors.childGender)}
          aria-describedby={formErrors.childGender ? 'childGender-error' : undefined}
        >
          <legend>
            Пол <small>обязательно</small>
          </legend>
          <div className="kidsRegistrationChoices kidsRegistrationChoicesCompact">
            <label>
              <input
                name="childGender"
                type="radio"
                value="male"
                checked={formValues.childGender === 'male'}
                onChange={handleChange}
                required
              />
              <span>Мальчик</span>
            </label>
            <label>
              <input
                name="childGender"
                type="radio"
                value="female"
                checked={formValues.childGender === 'female'}
                onChange={handleChange}
                required
              />
              <span>Девочка</span>
            </label>
          </div>
          {formErrors.childGender && (
            <em className="kidsRegistrationError" id="childGender-error">
              {formErrors.childGender}
            </em>
          )}
        </fieldset>

        <fieldset
          className="kidsRegistrationChoiceGroup"
          aria-invalid={Boolean(formErrors.distanceId)}
          aria-describedby={distanceDescribedBy}
        >
          <legend>
            Дистанция <small>обязательно</small>
          </legend>
          {distances.length > 0 ? (
            <div className="kidsRegistrationChoices">
              {distances.map((distance) => {
                const details = getDistanceDetails(distance)

                return (
                  <label key={distance.id}>
                    <input
                      name="distanceId"
                      type="radio"
                      value={String(distance.id)}
                      checked={formValues.distanceId === String(distance.id)}
                      onChange={handleChange}
                      required
                    />
                    <span>
                      <strong>{distance.title}</strong>
                      {details && <small>{details}</small>}
                    </span>
                  </label>
                )
              })}
            </div>
          ) : (
            <p className="kidsRegistrationNotice" id="distance-help">
              Дистанции мероприятия ещё не настроены.
            </p>
          )}
          {formErrors.distanceId && (
            <em className="kidsRegistrationError" id="distanceId-error">
              {formErrors.distanceId}
            </em>
          )}
        </fieldset>
      </section>

      <section className="kidsRegistrationSection" aria-labelledby="parent-data-title">
        <div className="kidsRegistrationSectionHeading">
          <span>02</span>
          <div>
            <h3 id="parent-data-title">Родитель / законный представитель</h3>
            <p>Контакты нужны для связи по вопросам участия.</p>
          </div>
        </div>

        <div className="kidsRegistrationGrid">
          <label className="kidsRegistrationField kidsRegistrationFieldWide" htmlFor="parentFullName">
            <span>
              ФИО <small>обязательно</small>
            </span>
            <input
              className={inputClassName('parentFullName')}
              id="parentFullName"
              name="parentFullName"
              type="text"
              value={formValues.parentFullName}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.parentFullName)}
              aria-describedby={formErrors.parentFullName ? 'parentFullName-error' : undefined}
              required
            />
            {formErrors.parentFullName && (
              <em className="kidsRegistrationError" id="parentFullName-error">
                {formErrors.parentFullName}
              </em>
            )}
          </label>

          <label className="kidsRegistrationField" htmlFor="parentPhone">
            <span>
              Телефон <small>обязательно</small>
            </span>
            <input
              className={inputClassName('parentPhone')}
              id="parentPhone"
              inputMode="tel"
              name="parentPhone"
              type="tel"
              value={formValues.parentPhone}
              onChange={handleChange}
              placeholder="+7 700 000 00 00"
              aria-invalid={Boolean(formErrors.parentPhone)}
              aria-describedby={formErrors.parentPhone ? 'parentPhone-error' : undefined}
              required
            />
            {formErrors.parentPhone && (
              <em className="kidsRegistrationError" id="parentPhone-error">
                {formErrors.parentPhone}
              </em>
            )}
          </label>

          <label className="kidsRegistrationField" htmlFor="parentEmail">
            <span>
              Email <small>обязательно</small>
            </span>
            <input
              className={inputClassName('parentEmail')}
              id="parentEmail"
              inputMode="email"
              name="parentEmail"
              type="email"
              value={formValues.parentEmail}
              onChange={handleChange}
              placeholder="name@example.com"
              aria-invalid={Boolean(formErrors.parentEmail)}
              aria-describedby={formErrors.parentEmail ? 'parentEmail-error' : undefined}
              required
            />
            {formErrors.parentEmail && (
              <em className="kidsRegistrationError" id="parentEmail-error">
                {formErrors.parentEmail}
              </em>
            )}
          </label>
        </div>
      </section>

      <section className="kidsRegistrationSection" aria-labelledby="liability-title">
        <div className="kidsRegistrationSectionHeading">
          <span>03</span>
          <div>
            <h3 id="liability-title">Расписка об ответственности</h3>
            <p>Приложите подписанную расписку перед завершением регистрации.</p>
          </div>
        </div>

        <p className="kidsRegistrationNotice">
          Шаблон расписки будет доступен перед открытием регистрации.
        </p>

        <label className="kidsRegistrationField" htmlFor="liabilityDocument">
          <span>
            Файл расписки <small>обязательно</small>
          </span>
          <input
            className={inputClassName('liabilityDocument')}
            id="liabilityDocument"
            name="liabilityDocument"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            aria-invalid={Boolean(formErrors.liabilityDocument)}
            aria-describedby={
              formErrors.liabilityDocument
                ? 'liabilityDocument-help liabilityDocument-error'
                : 'liabilityDocument-help'
            }
            required
          />
          <span className="kidsRegistrationHelp" id="liabilityDocument-help">
            PDF, JPG, JPEG или PNG, до {MAX_FILE_SIZE_LABEL}. До отправки файл хранится только в этом окне браузера.
          </span>
          {formValues.liabilityDocument && (
            <span className="kidsRegistrationFileName">Выбран файл: {formValues.liabilityDocument.name}</span>
          )}
          {formErrors.liabilityDocument && (
            <em className="kidsRegistrationError" id="liabilityDocument-error">
              {formErrors.liabilityDocument}
            </em>
          )}
        </label>
      </section>

      <section className="kidsRegistrationSection" aria-labelledby="consents-title">
        <div className="kidsRegistrationSectionHeading">
          <span>04</span>
          <div>
            <h3 id="consents-title">Согласия</h3>
            <p>Каждое подтверждение обязательно для продолжения.</p>
          </div>
        </div>

        <div className="kidsRegistrationConsents">
          <label>
            <input
              name="acceptEventRules"
              type="checkbox"
              checked={formValues.acceptEventRules}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.acceptEventRules)}
              aria-describedby={formErrors.acceptEventRules ? 'acceptEventRules-error' : undefined}
              required
            />
            <span>Я ознакомился(лась) с правилами мероприятия.</span>
          </label>
          {formErrors.acceptEventRules && (
            <em className="kidsRegistrationError" id="acceptEventRules-error">
              {formErrors.acceptEventRules}
            </em>
          )}

          <label>
            <input
              name="acceptPersonalData"
              type="checkbox"
              checked={formValues.acceptPersonalData}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.acceptPersonalData)}
              aria-describedby={formErrors.acceptPersonalData ? 'acceptPersonalData-error' : undefined}
              required
            />
            <span>Я согласен(на) на обработку персональных данных.</span>
          </label>
          {formErrors.acceptPersonalData && (
            <em className="kidsRegistrationError" id="acceptPersonalData-error">
              {formErrors.acceptPersonalData}
            </em>
          )}

          <label>
            <input
              name="acceptResponsibility"
              type="checkbox"
              checked={formValues.acceptResponsibility}
              onChange={handleChange}
              aria-invalid={Boolean(formErrors.acceptResponsibility)}
              aria-describedby={formErrors.acceptResponsibility ? 'acceptResponsibility-error' : undefined}
              required
            />
            <span>Я подтверждаю ответственность как родитель / законный представитель.</span>
          </label>
          {formErrors.acceptResponsibility && (
            <em className="kidsRegistrationError" id="acceptResponsibility-error">
              {formErrors.acceptResponsibility}
            </em>
          )}
        </div>
      </section>

      {Object.keys(formErrors).length > 0 && (
        <p className="kidsRegistrationFormAlert" role="alert">
          Проверьте отмеченные поля и исправьте ошибки.
        </p>
      )}

      {submitError && (
        <p className="kidsRegistrationFormAlert" role="alert">
          {submitError}
        </p>
      )}

      {submitMessage && (
        <p className="kidsRegistrationSuccess" role="status" aria-live="polite">
          {submitMessage}
        </p>
      )}

      <button
        className="kidsRegistrationSubmit"
        type="submit"
        disabled={isSubmitting || submissionComplete}
      >
        {submissionComplete
          ? 'Данные сохранены'
          : isSubmitting
            ? 'Сохраняем регистрацию…'
            : 'Продолжить регистрацию'}
      </button>
    </form>
  )
}

export default KidsRegistrationForm
