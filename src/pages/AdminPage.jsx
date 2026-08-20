import { useEffect, useState } from 'react'
import {
  AdminAuthError,
  getAdminEvent,
  getAdminEvents,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from '../api/admin'
import './AdminPage.css'

function AdminPage() {
  const [sessionStatus, setSessionStatus] = useState('checking')
  const [password, setPassword] = useState('')
  const [loginStatus, setLoginStatus] = useState('idle')
  const [loginMessage, setLoginMessage] = useState('')
  const [logoutStatus, setLogoutStatus] = useState('idle')
  const [logoutMessage, setLogoutMessage] = useState('')
  const [eventsStatus, setEventsStatus] = useState('loading')
  const [events, setEvents] = useState([])
  const [eventsMessage, setEventsMessage] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [eventDetailStatus, setEventDetailStatus] = useState('idle')
  const [eventDetail, setEventDetail] = useState(null)
  const [eventDetailMessage, setEventDetailMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    getAdminSession({ signal: controller.signal })
      .then((result) => {
        if (isActive) {
          setSessionStatus(result.authenticated === true ? 'authenticated' : 'unauthenticated')
        }
      })
      .catch(() => {
        if (isActive) {
          setSessionStatus('error')
        }
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return undefined
    }

    const controller = new AbortController()
    let isActive = true

    getAdminEvents({ signal: controller.signal })
      .then((result) => {
        if (!isActive) {
          return
        }

        if (!Array.isArray(result.events)) {
          throw new AdminAuthError('invalid_server_response')
        }

        setEvents(result.events)
        setEventsStatus('ready')
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        if (
          error instanceof AdminAuthError &&
          error.status === 401
        ) {
          setEvents([])
          setEventsStatus('idle')
          setSessionStatus('unauthenticated')
          return
        }

        setEvents([])
        setEventsStatus('error')
        setEventsMessage('Не удалось загрузить мероприятия.')
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [sessionStatus])

  const handleSelectEvent = async (eventId) => {
    setSelectedEventId(eventId)
    setEventDetailStatus('loading')
    setEventDetail(null)
    setEventDetailMessage('')

    try {
      const result = await getAdminEvent(eventId)

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail(result)
      setEventDetailStatus('ready')
    } catch (error) {
      if (
        error instanceof AdminAuthError &&
        error.status === 401
      ) {
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setSessionStatus('unauthenticated')
        return
      }

      setEventDetail(null)
      setEventDetailStatus('error')
      setEventDetailMessage('Не удалось загрузить мероприятие.')
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    if (!password) {
      setLoginMessage('Введите пароль')
      return
    }

    setLoginStatus('submitting')
    setLoginMessage('')

    try {
      const result = await loginAdmin(password)
      setPassword('')

      if (result.authenticated !== true) {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventsStatus('loading')
      setEventsMessage('')
      setLoginStatus('idle')
      setSessionStatus('authenticated')
    } catch (error) {
      setPassword('')
      setLoginStatus('idle')
      setLoginMessage(
        error instanceof AdminAuthError &&
          (error.code === 'invalid_credentials' || error.status === 401)
          ? 'Неверный пароль'
          : 'Не удалось войти. Попробуйте ещё раз.',
      )
    }
  }

  const handleLogout = async () => {
    setLogoutStatus('submitting')
    setLogoutMessage('')

    try {
      const result = await logoutAdmin()

      if (result.authenticated !== false) {
        throw new AdminAuthError('invalid_server_response')
      }

      setPassword('')
      setLoginMessage('')
      setLogoutStatus('idle')
      setSessionStatus('unauthenticated')
    } catch {
      setLogoutStatus('idle')
      setLogoutMessage('Не удалось выйти. Попробуйте ещё раз.')
    }
  }

  if (sessionStatus === 'checking') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell" aria-busy="true" aria-live="polite">
          <span className="adminLoader" aria-hidden="true" />
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Проверяем сессию</h1>
        </main>
      </div>
    )
  }

  if (sessionStatus === 'error') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell" role="alert">
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Вход временно недоступен</h1>
          <p>Не удалось проверить сессию. Обновите страницу и попробуйте снова.</p>
        </main>
      </div>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell">
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Вход в админ-панель</h1>

          <form className="adminLoginForm" onSubmit={handleLogin}>
            <label htmlFor="admin-password">Пароль</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setLoginMessage('')
              }}
              autoComplete="current-password"
              autoFocus
              required
            />

            {loginMessage && (
              <p className="adminAuthMessage" role="alert">
                {loginMessage}
              </p>
            )}

            <button type="submit" disabled={loginStatus === 'submitting'}>
              {loginStatus === 'submitting' ? 'Входим...' : 'Войти'}
            </button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="adminPage">
      <main className="adminPageMain">
        <header className="adminPageHeader">
          <div>
            <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
            <h1>Управление мероприятиями</h1>
            <p>
              Здесь будем создавать старты, настраивать регистрацию
              и смотреть участников.
            </p>
          </div>

          <button
            className="adminLogoutButton"
            type="button"
            onClick={handleLogout}
            disabled={logoutStatus === 'submitting'}
          >
            {logoutStatus === 'submitting' ? 'Выходим...' : 'Выйти'}
          </button>
        </header>

        {logoutMessage && (
          <p className="adminAuthMessage adminLogoutMessage" role="alert">
            {logoutMessage}
          </p>
        )}

        <div className="adminPageGrid">
          <section className="adminPageSection">
            <h2>Мероприятия</h2>

            {eventsStatus === 'loading' && (
              <p>Загружаем мероприятия...</p>
            )}

            {eventsStatus === 'error' && (
              <p className="adminAuthMessage">
                {eventsMessage}
              </p>
            )}

            {eventsStatus === 'ready' && events.length === 0 && (
              <p>Мероприятий пока нет.</p>
            )}

            {eventsStatus === 'ready' && events.length > 0 && (
              <div className="adminEventsList">
                {events.map((event) => (
                  <button
                    className="adminEventItem"
                    type="button"
                    key={event.id}
                    onClick={() => handleSelectEvent(event.id)}
                    aria-pressed={selectedEventId === event.id}
                  >
                    <strong>{event.title}</strong>
                    <span>{event.city}</span>
                    <span>{event.status}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedEventId && (
            <section className="adminPageSection adminEventDetailSection">
              <h2>Карточка мероприятия</h2>

              {eventDetailStatus === 'loading' && (
                <p>Загружаем данные мероприятия...</p>
              )}

              {eventDetailStatus === 'error' && (
                <p className="adminAuthMessage">
                  {eventDetailMessage}
                </p>
              )}

              {eventDetailStatus === 'ready' && eventDetail && (
                <div className="adminEventDetail">
                  <h3>{eventDetail.event.title}</h3>
                  <p>{eventDetail.event.city}</p>
                  <p>Статус: {eventDetail.event.status}</p>
                  <p>
                    Дистанций: {eventDetail.distances?.length ?? 0}
                  </p>
                  <p>
                    Документов: {eventDetail.documents?.length ?? 0}
                  </p>
                  <p>
                    Согласий: {eventDetail.consents?.length ?? 0}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="adminPageSection">
            <h2>Регистрации</h2>
            <p>
              Просмотр участников, статусов оплаты и документов.
            </p>
          </section>

          <section className="adminPageSection">
            <h2>Настройки регистрации</h2>
            <p>
              Детская или взрослая форма, возрастные ограничения,
              документы и обязательные согласия.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default AdminPage
