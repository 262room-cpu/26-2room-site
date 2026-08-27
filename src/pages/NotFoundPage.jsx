import { Link } from 'react-router'
import './NotFoundPage.css'

function NotFoundPage() {
  return (
    <main className="notFoundPage">
      <section className="notFoundPanel">
        <img src="/logo-26-2room.jpg" alt="26.2 ROOM" />
        <p>404</p>
        <h1>Страница не найдена</h1>
        <span>
          Возможно, адрес изменился или страница больше недоступна.
        </span>
        <Link to="/">Вернуться на главную</Link>
      </section>
    </main>
  )
}

export default NotFoundPage
