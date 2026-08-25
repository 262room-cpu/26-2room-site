import { useEffect, useMemo, useState } from 'react'
import {
  AdminAuthError,
  createAdminKitCatalogItem,
  getAdminKitLibrary,
  updateAdminKitCatalogItem,
  updateAdminKitMembership,
} from '../api/admin'

const EMPTY_FORM = {
  name: '',
  code: '',
  description: '',
  imagePath: '',
  active: true,
}

function buildCatalogChanges(form) {
  const name = form.name.trim()
  const code = form.code.trim()

  if (!name || !code) {
    throw new Error('Название и код обязательны.')
  }

  return {
    name,
    code,
    description: form.description.trim() || null,
    imagePath: form.imagePath.trim() || null,
    active: form.active,
  }
}

function formFromItem(item) {
  return {
    name: item.name ?? '',
    code: item.code ?? '',
    description: item.description ?? '',
    imagePath: item.imagePath ?? '',
    active: item.active !== false,
  }
}

function requestMessage(error, fallback) {
  if (error instanceof AdminAuthError && error.status === 409) {
    return 'Предмет с таким кодом уже существует.'
  }

  if (error instanceof AdminAuthError && error.status === 400) {
    return 'Проверьте заполненные данные.'
  }

  if (error instanceof AdminAuthError && error.status === 404) {
    return 'Предмет или мероприятие не найдено.'
  }

  return fallback
}

function CatalogFields({ form, onChange }) {
  return (
    <div className="adminRequirementFormGrid">
      <label className="adminEventField">
        <span>Название</span>
        <input name="name" value={form.name} onChange={onChange} required />
      </label>
      <label className="adminEventField">
        <span>Код</span>
        <input name="code" value={form.code} onChange={onChange} required />
      </label>
      <label className="adminEventField adminRequirementFieldWide">
        <span>Описание</span>
        <textarea
          name="description"
          rows="3"
          value={form.description}
          onChange={onChange}
        />
      </label>
      <label className="adminEventField adminRequirementFieldWide">
        <span>Путь к изображению</span>
        <input name="imagePath" value={form.imagePath} onChange={onChange} />
      </label>
      <label className="adminCheckboxField">
        <input
          name="active"
          type="checkbox"
          checked={form.active}
          onChange={onChange}
        />
        <span>Активен</span>
      </label>
    </div>
  )
}

function AdminStarterKit({ eventId, onKitItemsChange, onUnauthorized }) {
  const [state, setState] = useState({
    status: 'loading',
    message: '',
    catalogItems: [],
    kitItems: [],
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [createState, setCreateState] = useState({ status: 'idle', message: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editState, setEditState] = useState({ status: 'idle', message: '' })
  const [membershipStates, setMembershipStates] = useState({})
  const [orderDrafts, setOrderDrafts] = useState({})

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    getAdminKitLibrary(eventId, { signal: controller.signal })
      .then((result) => {
        if (!active) return
        setState({
          status: 'ready',
          message: '',
          catalogItems: Array.isArray(result.catalogItems)
            ? result.catalogItems
            : [],
          kitItems: Array.isArray(result.kitItems) ? result.kitItems : [],
        })
        setOrderDrafts(
          Object.fromEntries(
            (result.kitItems ?? []).map((item) => [
              item.catalogItemId,
              String(item.sortOrder),
            ]),
          ),
        )
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof AdminAuthError && error.status === 401) {
          onUnauthorized()
          return
        }
        setState((current) => ({
          ...current,
          status: 'error',
          message: 'Не удалось загрузить стартовый набор.',
        }))
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [eventId, onUnauthorized])

  const selectedByCatalogId = useMemo(
    () => new Map(state.kitItems.map((item) => [item.catalogItemId, item])),
    [state.kitItems],
  )
  const writesDisabled =
    createState.status === 'saving' ||
    editState.status === 'saving' ||
    Object.values(membershipStates).some((status) => status === 'saving')

  const updateForm = (setter, setSaveState) => (event) => {
    const { name, type, checked, value } = event.target
    setter((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setSaveState({ status: 'idle', message: '' })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    let changes

    try {
      changes = buildCatalogChanges(createForm)
    } catch (error) {
      setCreateState({ status: 'error', message: error.message })
      return
    }

    setCreateState({ status: 'saving', message: '' })

    try {
      const result = await createAdminKitCatalogItem(eventId, changes)
      const nextCatalog = [...state.catalogItems, result.catalogItem].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru'),
      )
      const nextKit = result.kitItem
        ? [...state.kitItems, result.kitItem]
        : state.kitItems

      setState((current) => ({
        ...current,
        catalogItems: nextCatalog,
        kitItems: nextKit,
      }))
      onKitItemsChange(nextKit)
      if (result.kitItem) {
        setOrderDrafts((current) => ({
          ...current,
          [result.kitItem.catalogItemId]: String(result.kitItem.sortOrder),
        }))
      }
      setCreateForm(EMPTY_FORM)
      setCreateOpen(false)
      setCreateState({
        status: 'success',
        message: result.kitItem
          ? 'Предмет создан и добавлен в мероприятие.'
          : 'Предмет создан. Добавьте его в мероприятие из библиотеки.',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        onUnauthorized()
        return
      }
      setCreateState({
        status: 'error',
        message: requestMessage(error, 'Не удалось создать предмет.'),
      })
    }
  }

  const handleEdit = async (event) => {
    event.preventDefault()
    let changes

    try {
      changes = buildCatalogChanges(editForm)
    } catch (error) {
      setEditState({ status: 'error', message: error.message })
      return
    }

    setEditState({ status: 'saving', message: '' })

    try {
      const result = await updateAdminKitCatalogItem(
        eventId,
        editingId,
        changes,
      )
      const nextCatalog = state.catalogItems.map((item) =>
        item.id === result.catalogItem.id ? result.catalogItem : item,
      )
      const nextKit = state.kitItems.map((item) =>
        item.catalogItemId === result.catalogItem.id
          ? {
              ...item,
              code: result.catalogItem.code,
              name: result.catalogItem.name,
              description: result.catalogItem.description,
              imagePath: result.catalogItem.imagePath,
            }
          : item,
      )

      setState((current) => ({
        ...current,
        catalogItems: nextCatalog,
        kitItems: nextKit,
      }))
      onKitItemsChange(nextKit)
      setEditForm(formFromItem(result.catalogItem))
      setEditState({ status: 'success', message: 'Изменения сохранены.' })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        onUnauthorized()
        return
      }
      setEditState({
        status: 'error',
        message: requestMessage(error, 'Не удалось сохранить предмет.'),
      })
    }
  }

  const handleMembership = async (catalogItem, selected, sortOrder = 0) => {
    setMembershipStates((current) => ({
      ...current,
      [catalogItem.id]: 'saving',
    }))

    try {
      const result = await updateAdminKitMembership(
        eventId,
        catalogItem.id,
        { selected, ...(selected ? { sortOrder } : {}) },
      )
      const nextKit = selected
        ? [
            ...state.kitItems.filter(
              (item) => item.catalogItemId !== catalogItem.id,
            ),
            result.kitItem,
          ].sort((a, b) => a.sortOrder - b.sortOrder)
        : state.kitItems.filter(
            (item) => item.catalogItemId !== catalogItem.id,
          )

      setState((current) => ({ ...current, kitItems: nextKit }))
      onKitItemsChange(nextKit)
      setOrderDrafts((current) => {
        const next = { ...current }
        if (selected) {
          next[catalogItem.id] = String(result.kitItem.sortOrder)
        } else {
          delete next[catalogItem.id]
        }
        return next
      })
      setMembershipStates((current) => ({
        ...current,
        [catalogItem.id]: 'success',
      }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        onUnauthorized()
        return
      }
      setMembershipStates((current) => ({
        ...current,
        [catalogItem.id]: 'error',
      }))
    }
  }

  const nextSortOrder = Math.min(
    Math.max(-1, ...state.kitItems.map((item) => item.sortOrder)) + 1,
    32767,
  )

  if (state.status === 'loading') {
    return <p>Загружаем библиотеку стартового набора...</p>
  }

  if (state.status === 'error') {
    return <p className="adminAuthMessage">{state.message}</p>
  }

  return (
    <div className="adminStarterKitModule">
      <section className="adminDistancesSection">
        <div className="adminDistancesHeader">
          <div>
            <p className="adminPageEyebrow">Выбрано: {state.kitItems.length}</p>
            <h3>В этом мероприятии</h3>
          </div>
        </div>

        {state.kitItems.length === 0 ? (
          <p>В стартовый набор пока ничего не выбрано.</p>
        ) : (
          <div className="adminKitSelectedList">
            {state.kitItems.map((kitItem) => {
              const catalogItem = state.catalogItems.find(
                (item) => item.id === kitItem.catalogItemId,
              )
              if (!catalogItem) return null
              return (
                <div className="adminKitSelectedRow" key={kitItem.id}>
                  <div>
                    <strong>{catalogItem.name}</strong>
                    <small>{catalogItem.code}</small>
                  </div>
                  <label className="adminKitOrderField">
                    <span>Порядок</span>
                    <input
                      type="number"
                      min="0"
                      max="32767"
                      value={
                        orderDrafts[catalogItem.id] ??
                        String(kitItem.sortOrder)
                      }
                      disabled={writesDisabled}
                      onChange={(event) =>
                        setOrderDrafts((current) => ({
                          ...current,
                          [catalogItem.id]: event.target.value,
                        }))
                      }
                      onBlur={(event) => {
                        const value = Number(event.target.value)
                        if (
                          Number.isInteger(value) &&
                          value >= 0 &&
                          value <= 32767
                        ) {
                          handleMembership(catalogItem, true, value)
                        } else {
                          setOrderDrafts((current) => ({
                            ...current,
                            [catalogItem.id]: String(kitItem.sortOrder),
                          }))
                        }
                      }}
                    />
                  </label>
                  <button
                    className="adminInlineButton"
                    type="button"
                    disabled={writesDisabled}
                    onClick={() => handleMembership(catalogItem, false)}
                  >
                    Убрать
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="adminDistancesSection">
        <div className="adminDistancesHeader">
          <div>
            <p className="adminPageEyebrow">Каталог: {state.catalogItems.length}</p>
            <h3>Библиотека</h3>
          </div>
          <button
            className="adminEventSaveButton"
            type="button"
            onClick={() => setCreateOpen((current) => !current)}
            disabled={writesDisabled}
          >
            Добавить предмет
          </button>
        </div>

        {createState.message && (
          <p
            className={
              createState.status === 'success'
                ? 'adminSaveSuccess'
                : 'adminAuthMessage'
            }
          >
            {createState.message}
          </p>
        )}

        {createOpen && (
          <form className="adminDistanceCard adminDistanceCreateCard" onSubmit={handleCreate}>
            <h4>Новый предмет библиотеки</h4>
            <CatalogFields
              form={createForm}
              onChange={updateForm(setCreateForm, setCreateState)}
            />
            <div className="adminEventFormActions">
              <button className="adminEventSaveButton" type="submit" disabled={writesDisabled}>
                {createState.status === 'saving' ? 'Создаём...' : 'Создать предмет'}
              </button>
              <button
                className="adminEventCancelButton"
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={writesDisabled}
              >
                Отмена
              </button>
            </div>
          </form>
        )}

        <div className="adminKitLibraryList">
          {state.catalogItems.map((catalogItem) => {
            const selected = selectedByCatalogId.has(catalogItem.id)
            const membershipStatus = membershipStates[catalogItem.id]
            return (
              <div
                className={`adminKitLibraryItem${catalogItem.active ? '' : ' isInactive'}`}
                key={catalogItem.id}
              >
                <label className="adminKitLibrarySelect">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={writesDisabled}
                    onChange={(event) =>
                      handleMembership(
                        catalogItem,
                        event.target.checked,
                        nextSortOrder,
                      )
                    }
                  />
                  <span className="adminKitImagePlaceholder">
                    {catalogItem.imagePath ? 'IMG' : '26.2'}
                  </span>
                  <span>
                    <strong>{catalogItem.name}</strong>
                    <small>{catalogItem.code}</small>
                  </span>
                </label>
                <div className="adminKitLibraryActions">
                  {!catalogItem.active && <span>Неактивен</span>}
                  {membershipStatus === 'error' && <span>Не сохранено</span>}
                  <button
                    className="adminInlineButton"
                    type="button"
                    onClick={() => {
                      setEditingId(catalogItem.id)
                      setEditForm(formFromItem(catalogItem))
                      setEditState({ status: 'idle', message: '' })
                    }}
                  >
                    Изменить
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {editingId && (
          <form className="adminDistanceCard adminKitEditor" onSubmit={handleEdit}>
            <div className="adminDistanceCardHeader">
              <h4>Редактировать предмет</h4>
              <button
                className="adminInlineButton"
                type="button"
                onClick={() => setEditingId(null)}
              >
                Закрыть
              </button>
            </div>
            <CatalogFields
              form={editForm}
              onChange={updateForm(setEditForm, setEditState)}
            />
            <div className="adminEventFormActions">
              <button className="adminEventSaveButton" type="submit" disabled={writesDisabled}>
                {editState.status === 'saving' ? 'Сохраняем...' : 'Сохранить предмет'}
              </button>
              {editState.message && (
                <p className={editState.status === 'success' ? 'adminSaveSuccess' : 'adminAuthMessage'}>
                  {editState.message}
                </p>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export default AdminStarterKit
