import React, { useState, useEffect, useContext } from 'react'
import Navbar from './components/Navbar'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Doctors from './pages/Doctors'
import Login from './pages/Login'
import About from './pages/About'
import Contact from './pages/Contact'
import Appointment from './pages/Appointment'
import MyAppointments from './pages/MyAppointments'
import MyProfile from './pages/MyProfile'
import Footer from './components/Footer'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Verify from './pages/Verify'
import SymptomChecker from './pages/SymptomChecker'
import MedicalRecords from './pages/MedicalRecords'
import ChatWidget from './components/ChatWidget'
import VideoCall from './pages/VideoCall'
import PrescriptionView from './pages/PrescriptionView'
import VerifyPrescription from './pages/VerifyPrescription'
import HealthDashboard from './pages/HealthDashboard'
import HealthHub from './pages/HealthHub'
import ChatInbox from './pages/ChatInbox'
import ChatPage from './pages/ChatPage'
import DrugChecker from './pages/DrugChecker'
import PatientOnboardingModal from './components/PatientOnboardingModal'
import { AppContext } from './context/AppContext'
import { shouldPromptOnboarding } from './utils/profileCompleteness'

const App = () => {
  const location = useLocation()
  const { token, userData } = useContext(AppContext)
  const [activeCallId, setActiveCallId] = useState(null)
  const [isCallLive, setIsCallLive] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Automatically trigger onboarding modal on first registration / first OAuth login
  useEffect(() => {
    if (!token || !userData || !userData._id) {
      setShowOnboarding(false)
      return
    }
    const dismissKey = `vitalsync_onboarding_snoozed_${userData._id}`
    const wasSnoozed = sessionStorage.getItem(dismissKey) === 'true'
    if (shouldPromptOnboarding(userData) && !wasSnoozed) {
      setShowOnboarding(true)
    }
  }, [token, userData])

  // Allow any page (e.g. MyProfile, Navbar) to open the guided onboarding modal on demand
  useEffect(() => {
    const handleOpenOnboarding = () => setShowOnboarding(true)
    window.addEventListener('vitalsync:open-onboarding', handleOpenOnboarding)
    return () => window.removeEventListener('vitalsync:open-onboarding', handleOpenOnboarding)
  }, [])

  const handleCloseOnboarding = () => {
    if (userData?._id) {
      sessionStorage.setItem(`vitalsync_onboarding_snoozed_${userData._id}`, 'true')
    }
    setShowOnboarding(false)
  }

  const videoRouteMatch = location.pathname.match(/^\/video-call\/([^/]+)/)
  const routeVideoId = videoRouteMatch ? videoRouteMatch[1] : null

  useEffect(() => {
    if (routeVideoId && (!isCallLive || routeVideoId === activeCallId)) {
      setActiveCallId(routeVideoId)
    } else if (!routeVideoId && !isCallLive) {
      setActiveCallId(null)
    }
  }, [routeVideoId, isCallLive, activeCallId])

  const mountedVideoId = routeVideoId || (isCallLive ? activeCallId : null)
  const isMinimizedCall = Boolean(mountedVideoId && !routeVideoId && isCallLive)

  // Hide Footer and ChatWidget on full-screen video call, chat messenger, or symptom checker studio
  const immersivePaths = ['/video-call', '/chat', '/symptom-checker']
  const isImmersive = immersivePaths.some(path => location.pathname.startsWith(path))

  return (
    <div className='min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900'>
      <ToastContainer position="top-right" autoClose={3500} hideProgressBar={false} />
      <Navbar />
      <main className='flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        {mountedVideoId && (
          <VideoCall
            key={mountedVideoId}
            appointmentIdProp={mountedVideoId}
            isMinimized={isMinimizedCall}
            onActiveSessionChange={setIsCallLive}
          />
        )}
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/doctors' element={<Doctors />} />
          <Route path='/doctors/:speciality' element={<Doctors />} />
          <Route path='/login' element={<Login />} />
          <Route path='/about' element={<About />} />
          <Route path='/contact' element={<Contact />} />
          <Route path='/appointment/:docId' element={<Appointment />} />
          <Route path='/my-appointments' element={<MyAppointments />} />
          <Route path='/my-profile' element={<MyProfile />} />
          <Route path='/verify' element={<Verify />} />
          <Route path='/symptom-checker' element={<SymptomChecker />} />
          <Route path='/video-call/:appointmentId' element={null} />
          <Route path='/prescription/:appointmentId' element={<PrescriptionView />} />
          <Route path='/verify-prescription' element={<VerifyPrescription />} />
          <Route path='/verify-prescription/:id' element={<VerifyPrescription />} />

          {/* My Health & Reports Center */}
          <Route path='/health' element={<HealthHub />} />
          {/* Backward-compatible routes */}
          <Route path='/health-dashboard' element={<HealthDashboard />} />
          <Route path='/medical-records' element={<MedicalRecords />} />

          {/* Doctor Messaging routes */}
          <Route path='/chat' element={<ChatInbox />} />
          <Route path='/chat/:appointmentId' element={<ChatPage />} />

          {/* Medicine Safety Checker */}
          <Route path='/drug-checker' element={<DrugChecker />} />
        </Routes>
      </main>
      {!isImmersive && <Footer />}
      {!isImmersive && !isCallLive && <ChatWidget />}
      <PatientOnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
    </div>
  )
}

export default App
