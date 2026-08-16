import { Route, Routes } from 'react-router'
import './App.css'
import EventPage from './pages/EventPage'
import HomePage from './pages/HomePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/events/:slug" element={<EventPage />} />
    </Routes>
  )
}

export default App
