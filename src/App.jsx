import { Route, Routes } from 'react-router'
import './App.css'
import AdminPage from './pages/AdminPage'
import EventPage from './pages/EventPage'
import HomePage from './pages/HomePage'
import RegistrationPage from './pages/RegistrationPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/events/:slug" element={<EventPage />} />
      <Route path="/events/:slug/register" element={<RegistrationPage />} />
    </Routes>
  )
}

export default App
