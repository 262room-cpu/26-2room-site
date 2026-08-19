function AdminPage() {
  return (
    <div className="adminPage">
      <main className="adminPageMain">
        <header className="adminPageHeader">
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Управление мероприятиями</h1>
          <p>
            Здесь будем создавать старты, настраивать регистрацию
            и смотреть участников.
          </p>
        </header>

        <section className="adminPageSection">
          <h2>Мероприятия</h2>
          <p>
            Создание и редактирование города, даты, дистанций,
            стоимости, лимитов и статуса регистрации.
          </p>
        </section>

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
      </main>
    </div>
  )
}

export default AdminPage