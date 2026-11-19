import React, { useContext, useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { assets } from '../assets/assets'
import ChatWindow from '../components/ChatWindow'
import ReviewModal from '../components/ReviewModal'
import {
  Calendar,
  Clock,
  Video,
  MessageSquare,
  FileText,
  CreditCard,
  Star,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Plus,
  ShieldCheck,
  AlertTriangle,
  X,
  Lock,
  Zap,
  Search,
  Sun,
  SunMedium,
  Moon
} from 'lucide-react'
import { checkAppointmentWindow } from '../utils/appointmentTime'

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const MyAppointments = () => {
    const { backendUrl, token, currencySymbol, isDoctorOnline, doctors, getDoctosData } = useContext(AppContext)
    const navigate = useNavigate()

    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('all') // 'all' | 'upcoming' | 'completed' | 'cancelled'
    const [searchQuery, setSearchQuery] = useState('')
    const [paymentTarget, setPaymentTarget] = useState('')
    const [paymentConfig, setPaymentConfig] = useState({ testMode: false, razorpayEnabled: true, stripeEnabled: false })
    const [activeChat, setActiveChat] = useState(null)
    const [reviewTarget, setReviewTarget] = useState(null)

    // Reschedule Native <dialog> Modal State
    const rescheduleDialogRef = useRef(null)
    const [rescheduleTarget, setRescheduleTarget] = useState(null)
    const [rescheduleSlots, setRescheduleSlots] = useState([])
    const [rescheduleDayIdx, setRescheduleDayIdx] = useState(0)
    const [rescheduleTime, setRescheduleTime] = useState('')
    const [rescheduling, setRescheduling] = useState(false)

    const slotDateFormat = (slotDate) => {
        if (!slotDate) return ''
        const dateArray = slotDate.split('_')
        return `${dateArray[0]} ${MONTHS[Number(dateArray[1]) - 1] || dateArray[1]} ${dateArray[2]}`
    }

    const getPaymentConfig = async () => {
        try {
            const { data } = await axios.get(`${backendUrl}/api/user/payment-config`)
            if (data.success) {
                setPaymentConfig(data)
            }
        } catch (error) {
            console.error('Failed to get payment config:', error)
        }
    }

    const handleTestPaymentBypass = async (appointmentId) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/user/payment-test-bypass`,
                { appointmentId },
                { headers: { token } }
            )
            if (data.success) {
                toast.success(data.message || 'Payment bypassed in test mode!')
                getUserAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error('Bypass error:', error)
            toast.error(error.message)
        }
    }

    const getUserAppointments = async () => {
        setLoading(true)
        try {
            const { data } = await axios.get(`${backendUrl}/api/user/appointments`, { headers: { token } })
            if (data.success) {
                setAppointments(data.appointments.reverse())
            }
        } catch (error) {
            console.error(error)
            toast.error(error.message)
        }
        setLoading(false)
    }

    const cancelAppointment = async (appointmentId) => {
        if (!window.confirm("Are you sure you want to cancel this consultation?")) return
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/user/cancel-appointment`,
                { appointmentId },
                { headers: { token } }
            )

            if (data.success) {
                toast.success(data.message)
                getUserAppointments()
                getDoctosData()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error(error)
            toast.error(error.message)
        }
    }

    // Build 7-day slots and open native <dialog>
    const openRescheduleModal = (apt) => {
        const liveDoc = doctors.find((d) => d._id === apt.docId) || apt.docData || {}
        const booked = liveDoc.slots_booked || {}

        const today = new Date()
        const generated = []

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(today)
            currentDate.setDate(today.getDate() + i)

            const endTime = new Date(today)
            endTime.setDate(today.getDate() + i)
            endTime.setHours(21, 0, 0, 0)

            if (today.getDate() === currentDate.getDate()) {
                currentDate.setHours(currentDate.getHours() > 10 ? currentDate.getHours() + 1 : 10)
                currentDate.setMinutes(currentDate.getMinutes() > 30 ? 30 : 0)
            } else {
                currentDate.setHours(10)
                currentDate.setMinutes(0)
            }

            const timeSlots = []
            while (currentDate < endTime) {
                const formattedTime = currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const day = currentDate.getDate()
                const month = currentDate.getMonth() + 1
                const year = currentDate.getFullYear()
                const slotDateKey = `${day}_${month}_${year}`

                const isSlotAvailable =
                    !booked[slotDateKey] || !booked[slotDateKey].includes(formattedTime)

                if (isSlotAvailable) {
                    timeSlots.push({
                        datetime: new Date(currentDate),
                        time: formattedTime,
                        hours: currentDate.getHours(),
                        slotDateKey
                    })
                }
                currentDate.setMinutes(currentDate.getMinutes() + 30)
            }
            generated.push(timeSlots)
        }

        const firstNonEmptyIdx = generated.findIndex((d) => d.length > 0)
        setRescheduleSlots(generated)
        setRescheduleDayIdx(firstNonEmptyIdx !== -1 ? firstNonEmptyIdx : 0)
        setRescheduleTime('')
        setRescheduleTarget(apt)

        if (rescheduleDialogRef.current) {
            rescheduleDialogRef.current.showModal()
        }
    }

    const closeRescheduleModal = () => {
        if (rescheduleDialogRef.current) {
            rescheduleDialogRef.current.close()
        }
        setRescheduleTarget(null)
    }

    const handleConfirmReschedule = async () => {
        if (!rescheduleTarget || !rescheduleTime) {
            return toast.warning('Please select an available time slot')
        }
        const selectedDaySlots = rescheduleSlots[rescheduleDayIdx] || []
        const dateObj = selectedDaySlots[0]?.datetime
        if (!dateObj) {
            return toast.error('Selected date has no available slots')
        }

        const newSlotDate = `${dateObj.getDate()}_${dateObj.getMonth() + 1}_${dateObj.getFullYear()}`
        setRescheduling(true)
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/user/reschedule-appointment`,
                {
                    appointmentId: rescheduleTarget._id,
                    newSlotDate,
                    newSlotTime: rescheduleTime
                },
                { headers: { token } }
            )
            if (data.success) {
                toast.success(data.message)
                closeRescheduleModal()
                getUserAppointments()
                getDoctosData()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setRescheduling(false)
        }
    }

    const initPay = (order, keyId) => {
        const razorpayKey = keyId || import.meta.env.VITE_RAZORPAY_KEY_ID
        if (!razorpayKey || razorpayKey.includes('---')) {
            toast.error("Razorpay Key ID is not configured.")
            return
        }

        const options = {
            key: razorpayKey,
            amount: order.amount,
            currency: order.currency,
            name: 'VitalSync Healthcare',
            description: "Online Doctor Appointment",
            order_id: order.id,
            receipt: order.receipt,
            handler: async (response) => {
                try {
                    const { data } = await axios.post(`${backendUrl}/api/user/verifyRazorpay`, response, { headers: { token } })
                    if (data.success) {
                        toast.success("Payment verified! Appointment confirmed.")
                        setPaymentTarget('')
                        getUserAppointments()
                    } else {
                        toast.error(data.message || "Payment verification failed")
                    }
                } catch (error) {
                    console.error(error)
                    toast.error(error.message)
                }
            },
            modal: {
                ondismiss: () => {
                    toast.info("Payment window closed.")
                }
            }
        }
        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', function (response) {
            toast.error(response.error?.description || "Payment Failed")
        })
        rzp.open()
    }

    const appointmentRazorpay = async (appointmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/user/payment-razorpay`, { appointmentId }, { headers: { token } })
            if (data.success) {
                initPay(data.order, data.key_id)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error(error)
            toast.error(error.message)
        }
    }

    const appointmentStripe = async (appointmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/user/payment-stripe`, { appointmentId }, { headers: { token } })
            if (data.success) {
                window.location.replace(data.session_url)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error(error)
            toast.error(error.message)
        }
    }

    useEffect(() => {
        getPaymentConfig()
        if (token) getUserAppointments()

        const handleRealtimeUpdate = () => {
            if (token) getUserAppointments()
        }
        window.addEventListener('vitalsync:appointment-updated', handleRealtimeUpdate)
        window.addEventListener('prescripto:appointment-updated', handleRealtimeUpdate)
        window.addEventListener('vitalsync:prescription-updated', handleRealtimeUpdate)
        window.addEventListener('prescripto:prescription-updated', handleRealtimeUpdate)
        return () => {
            window.removeEventListener('vitalsync:appointment-updated', handleRealtimeUpdate)
            window.removeEventListener('prescripto:appointment-updated', handleRealtimeUpdate)
            window.removeEventListener('vitalsync:prescription-updated', handleRealtimeUpdate)
            window.removeEventListener('prescripto:prescription-updated', handleRealtimeUpdate)
        }
    }, [token])

    // Grouping reschedule slots for the active day
    const rescheduleGroupedSlots = useMemo(() => {
        const slots = rescheduleSlots[rescheduleDayIdx] || []
        const morning = []
        const afternoon = []
        const evening = []

        slots.forEach(slot => {
            const h = slot.hours
            if (h < 12) {
                morning.push(slot)
            } else if (h < 17) {
                afternoon.push(slot)
            } else {
                evening.push(slot)
            }
        })

        return { morning, afternoon, evening }
    }, [rescheduleSlots, rescheduleDayIdx])

    // Filter appointments
    const filteredAppointments = useMemo(() => {
        return appointments.filter(item => {
            if (filter === 'upcoming') {
                if (item.cancelled || item.isCompleted) return false
            } else if (filter === 'completed') {
                if (!item.isCompleted) return false
            } else if (filter === 'cancelled') {
                if (!item.cancelled) return false
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim()
                const docName = item.docData?.name?.toLowerCase() || ''
                const spec = item.docData?.speciality?.toLowerCase() || ''
                const reason = item.reasonForVisit?.toLowerCase() || ''
                return docName.includes(q) || spec.includes(q) || reason.includes(q)
            }

            return true
        })
    }, [appointments, filter, searchQuery])

    const countUpcoming = appointments.filter(a => !a.cancelled && !a.isCompleted).length
    const countCompleted = appointments.filter(a => a.isCompleted).length
    const countCancelled = appointments.filter(a => a.cancelled).length

    return (
        <div className='py-4 sm:py-6 space-y-5 sm:space-y-6 max-w-7xl mx-auto overflow-x-hidden'>
            {/* Header Banner */}
            <div className='bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-4 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6'>
                <div className='space-y-1.5 max-w-xl'>
                    <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-xs font-semibold text-primary border border-sky-100'>
                        <Calendar className='w-3.5 h-3.5 text-primary' />
                        <span>Care Scheduling & Records</span>
                    </div>
                    <h1 className='text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight'>
                        My Consultations & Appointments
                    </h1>
                    <p className='text-xs sm:text-sm text-slate-500 leading-relaxed'>
                        Access scheduled video visits, digital prescriptions, doctor messages, and slot rescheduling.
                    </p>
                </div>

                <div className='grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto'>
                    <button
                        onClick={() => navigate('/chat')}
                        className='min-h-[44px] px-3 sm:px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer'
                    >
                        <MessageSquare className='w-4 h-4 text-primary shrink-0' />
                        <span className='truncate'>Messages</span>
                    </button>
                    <button
                        onClick={() => navigate('/doctors')}
                        className='min-h-[44px] px-3 sm:px-4 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-sky-600 active:scale-[0.98] rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer'
                    >
                        <Plus className='w-4 h-4 shrink-0' />
                        <span className='truncate'>Book Visit</span>
                    </button>
                </div>
            </div>

            {/* Filter Tabs Bar with Search */}
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4'>
                <div className='flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]'>
                    {[
                        { id: 'all', label: 'All', fullLabel: 'All Consultations', count: appointments.length },
                        { id: 'upcoming', label: 'Upcoming', fullLabel: 'Upcoming', count: countUpcoming },
                        { id: 'completed', label: 'Completed', fullLabel: 'Completed', count: countCompleted },
                        { id: 'cancelled', label: 'Cancelled', fullLabel: 'Cancelled', count: countCancelled }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id)}
                            className={`min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border cursor-pointer whitespace-nowrap shrink-0 ${
                                filter === tab.id
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            <span className='sm:hidden'>{tab.label}</span>
                            <span className='hidden sm:inline'>{tab.fullLabel}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                                filter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Search Bar */}
                <div className='relative w-full sm:w-72'>
                    <Search className='w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none' />
                    <input
                        type='text'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder='Search doctor or specialty...'
                        className='w-full min-h-[44px] pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-primary shadow-2xs'
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className='absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600'
                            aria-label='Clear search'
                        >
                            <X className='w-4 h-4' />
                        </button>
                    )}
                </div>
            </div>

            {/* Appointment Cards List */}
            {loading ? (
                <div className='bg-white rounded-3xl border border-slate-200/90 p-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3'>
                    <div className='w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin' />
                    <span>Loading your consultation records...</span>
                </div>
            ) : filteredAppointments.length === 0 ? (
                <div className='text-center py-16 bg-white rounded-3xl border border-slate-200/90 p-8 space-y-4 shadow-xs'>
                    <div className='w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400'>
                        <Calendar className='w-6 h-6' />
                    </div>
                    <div>
                        <h3 className='font-bold text-slate-900 text-base'>No Consultations Found</h3>
                        <p className='text-xs text-slate-500 max-w-sm mx-auto mt-1'>
                            {searchQuery
                                ? "No appointments match your search keywords. Try clearing the search bar."
                                : filter === 'upcoming'
                                ? "You have no upcoming consultations scheduled right now."
                                : "No consultations recorded under this category."}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/doctors')}
                        className='px-5 py-2.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-sky-600 transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs'
                    >
                        <Plus className='w-4 h-4' />
                        <span>Find a Doctor</span>
                    </button>
                </div>
            ) : (
                <div className='space-y-4'>
                    {filteredAppointments.map((item) => {
                        const windowStatus = checkAppointmentWindow(item.slotDate, item.slotTime, paymentConfig.testMode)
                        const isOnline = isDoctorOnline && isDoctorOnline(item.docId)

                        return (
                            <div
                                key={item._id}
                                className='bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row gap-4 sm:gap-6 items-stretch lg:items-start justify-between'
                            >
                                {/* Left Section: Doctor Avatar & Status */}
                                <div className='flex items-start gap-3.5 sm:gap-4 w-full lg:w-72 shrink-0'>
                                    <div className='relative w-16 h-16 sm:w-24 sm:h-28 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0'>
                                        <img
                                            className='w-full h-full object-cover object-top'
                                            src={item.docData?.image}
                                            alt={item.docData?.name}
                                        />
                                        {isOnline && (
                                            <span className='absolute bottom-1.5 right-1.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white' title='Online' />
                                        )}
                                    </div>

                                    {/* Doctor Details */}
                                    <div className='space-y-1 flex-1 min-w-0'>
                                        <div className='flex items-start justify-between gap-2'>
                                            <h3 className='text-sm sm:text-base font-extrabold text-slate-900 truncate'>{item.docData?.name}</h3>
                                            {isOnline && (
                                                <span className='hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200 shrink-0'>
                                                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />
                                                    Online
                                                </span>
                                            )}
                                        </div>

                                        <div className='flex flex-wrap items-center gap-1.5'>
                                            <span className='text-[11px] bg-sky-50 text-primary px-2 py-0.5 rounded-md font-semibold border border-sky-100 truncate max-w-full'>
                                                {item.docData?.speciality}
                                            </span>
                                            <span className='text-[11px] text-slate-500 truncate'>
                                                {item.docData?.degree || 'MBBS'}
                                            </span>
                                        </div>

                                        {/* Status Badge */}
                                        <div className='pt-1 flex flex-wrap items-center gap-1.5'>
                                            {item.cancelled ? (
                                                <span className='inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-rose-50 text-rose-700 rounded-full border border-rose-200'>
                                                    <XCircle className='w-3 h-3' /> Cancelled
                                                </span>
                                            ) : item.isCompleted ? (
                                                <span className='inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200'>
                                                    <CheckCircle2 className='w-3 h-3' /> Completed
                                                </span>
                                            ) : item.payment ? (
                                                <span className='inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-sky-50 text-sky-700 rounded-full border border-sky-200'>
                                                    <ShieldCheck className='w-3 h-3 text-sky-600' /> Confirmed & Paid
                                                </span>
                                            ) : (
                                                <span className='inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 rounded-full border border-amber-200'>
                                                    <AlertCircle className='w-3 h-3 text-amber-600' /> Payment Pending
                                                </span>
                                            )}
                                            {item.rescheduledAt && (
                                                <span className='px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold'>
                                                    Rescheduled
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Middle Section: Date/Time/Fee Badge Row & Clinical Notes */}
                                <div className='flex-1 space-y-2.5 w-full text-xs min-w-0'>
                                    <div className='bg-slate-50 border border-slate-200/70 rounded-2xl p-3 sm:p-4 space-y-2'>
                                        <div className='flex flex-wrap items-center justify-between gap-2'>
                                            <div className='flex flex-wrap items-center gap-1.5 sm:gap-2 text-slate-900 font-bold text-xs sm:text-sm'>
                                                <span className='inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80'>
                                                    <Calendar className='w-3.5 h-3.5 text-primary shrink-0' />
                                                    <span>{slotDateFormat(item.slotDate)}</span>
                                                </span>
                                                <span className='inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 font-mono'>
                                                    <Clock className='w-3.5 h-3.5 text-sky-600 shrink-0' />
                                                    <span>{item.slotTime}</span>
                                                </span>
                                            </div>
                                            <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-900 font-mono font-bold text-xs'>
                                                {currencySymbol}{item.amount}
                                            </span>
                                        </div>

                                        <div className='flex items-center gap-2 text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 rounded-xl px-3 py-1.5 text-[11px] font-semibold'>
                                            <Video className='w-3.5 h-3.5 text-emerald-600 shrink-0' />
                                            <span className='truncate'>Encrypted Teleconsultation &bull; Direct Physician Link</span>
                                        </div>

                                        {item.reasonForVisit && (
                                            <div className='text-slate-600 pt-0.5 break-words'>
                                                <span className='font-semibold text-slate-800'>Reason:</span> {item.reasonForVisit}
                                            </div>
                                        )}

                                        {item.docData?.address?.line1 && (
                                            <div className='text-slate-400 text-[11px] truncate'>
                                                Clinic: {item.docData.address.line1}
                                            </div>
                                        )}
                                    </div>

                                    {/* In-Person Referral Urgency Notice */}
                                    {item.inPersonReferral && item.inPersonReferral.urgency && (
                                        <div className={`rounded-2xl p-3.5 sm:p-4 border text-xs space-y-1.5 ${
                                            item.inPersonReferral.urgency === 'EMERGENCY'
                                                ? 'bg-rose-50 border-rose-300 text-rose-950'
                                                : item.inPersonReferral.urgency === 'URGENT'
                                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                                : 'bg-purple-50 border-purple-200 text-purple-950'
                                        }`}>
                                            <div className='flex items-center justify-between gap-2'>
                                                <div className='flex items-center gap-1.5 font-bold min-w-0'>
                                                    <AlertTriangle className='w-4 h-4 text-rose-600 shrink-0' />
                                                    <span className='truncate'>In-Person Evaluation Recommended</span>
                                                </div>
                                                <span className='px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-rose-600 text-white border-rose-600 shrink-0'>
                                                    {item.inPersonReferral.urgency}
                                                </span>
                                            </div>
                                            <p className='text-slate-700 break-words'>
                                                <strong>Doctor's Note:</strong> {item.inPersonReferral.reason}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Right / Bottom Section: 2-Column Mobile Action Grid, Stacked Desktop */}
                                <div className='w-full lg:w-60 grid grid-cols-2 lg:flex lg:flex-col gap-2 shrink-0 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-100'>
                                    {/* Video Call / Pay Unlock Primary CTA (Full Width) */}
                                    {!item.cancelled && !item.isCompleted && (
                                        <>
                                            {item.payment ? (
                                                windowStatus.status === 'OPEN' ? (
                                                    <button
                                                        onClick={() => navigate(`/video-call/${item._id}`)}
                                                        className='col-span-2 w-full min-h-[44px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer animate-pulse'
                                                    >
                                                        <Video className='w-4 h-4 shrink-0' />
                                                        <span>Join Video Call</span>
                                                    </button>
                                                ) : windowStatus.status === 'TOO_EARLY' ? (
                                                    <button
                                                        onClick={() => navigate(`/video-call/${item._id}`)}
                                                        className='col-span-2 w-full min-h-[44px] py-2.5 px-3 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer'
                                                        title={`Opens 10m prior to slot (${item.slotTime})`}
                                                    >
                                                        <Clock className='w-4 h-4 shrink-0' />
                                                        <span className='truncate'>Waiting Room ({windowStatus.formattedRemaining})</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => openRescheduleModal(item)}
                                                        className='col-span-2 w-full min-h-[44px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer'
                                                    >
                                                        <Clock className='w-4 h-4 text-amber-400 shrink-0' />
                                                        <span>Slot Expired &bull; Reschedule</span>
                                                    </button>
                                                )
                                            ) : (
                                                <button
                                                    onClick={() => setPaymentTarget(item._id)}
                                                    className='col-span-2 w-full min-h-[44px] py-2.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs'
                                                >
                                                    <CreditCard className='w-4 h-4 text-sky-400 shrink-0' />
                                                    <span>Pay Online ({currencySymbol}{item.amount})</span>
                                                </button>
                                            )}

                                            {/* Doctor Messaging Quick Chat */}
                                            <button
                                                onClick={() => setActiveChat({
                                                    appointmentId: item._id,
                                                    doctorName: item.docData?.name,
                                                    doctorImage: item.docData?.image
                                                })}
                                                className='w-full min-h-[44px] py-2 px-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-2xs'
                                            >
                                                <MessageSquare className='w-3.5 h-3.5 text-sky-600 shrink-0' />
                                                <span className='truncate'>Message Doctor</span>
                                            </button>
                                        </>
                                    )}

                                    {/* Prescription Button (Visible for all stages) */}
                                    <button
                                        onClick={() => navigate(`/prescription/${item._id}`)}
                                        className={`${item.cancelled || item.isCompleted ? 'col-span-2' : ''} w-full min-h-[44px] py-2 px-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 active:scale-[0.98] text-sky-800 border border-sky-200/80 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer`}
                                    >
                                        <FileText className='w-3.5 h-3.5 text-sky-600 shrink-0' />
                                        <span className='truncate'>View e-Rx</span>
                                    </button>

                                    {/* Inline Payment Options when Unpaid & Expanded */}
                                    {!item.cancelled && !item.payment && !item.isCompleted && paymentTarget === item._id && (
                                        <div className='col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in'>
                                            <p className='text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center'>Select Payment Method</p>
                                            <button
                                                onClick={() => appointmentRazorpay(item._id)}
                                                className='w-full min-h-[44px] py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer shadow-2xs'
                                            >
                                                <img className='max-w-16 max-h-4 object-contain' src={assets.razorpay_logo} alt="Razorpay" />
                                            </button>
                                            {paymentConfig.stripeEnabled && (
                                                <button
                                                    onClick={() => appointmentStripe(item._id)}
                                                    className='w-full min-h-[44px] py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer shadow-2xs'
                                                >
                                                    <img className='max-w-14 max-h-4 object-contain' src={assets.stripe_logo} alt="Stripe" />
                                                </button>
                                            )}
                                            {paymentConfig.testMode && (
                                                <button
                                                    onClick={() => handleTestPaymentBypass(item._id)}
                                                    className='w-full min-h-[44px] py-2 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer'
                                                >
                                                    <Zap className='w-3.5 h-3.5 text-amber-600' />
                                                    <span>Skip Payment (Test Mode)</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setPaymentTarget('')}
                                                className='w-full min-h-[36px] text-xs text-slate-500 hover:text-slate-700 text-center block pt-0.5 cursor-pointer font-medium'
                                            >
                                                Cancel Payment
                                            </button>
                                        </div>
                                    )}

                                    {/* Rating for Completed Consultation */}
                                    {item.isCompleted && (
                                        <button
                                            onClick={() => setReviewTarget({
                                                appointmentId: item._id,
                                                doctorName: item.docData?.name
                                            })}
                                            className='col-span-2 w-full min-h-[44px] py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl font-semibold text-xs hover:bg-amber-100 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer'
                                        >
                                            <Star className='w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0' />
                                            <span>Rate & Review Doctor</span>
                                        </button>
                                    )}

                                    {/* Reschedule & Cancel Row for Upcoming Visits */}
                                    {!item.cancelled && !item.isCompleted && (
                                        <>
                                            <button
                                                onClick={() => openRescheduleModal(item)}
                                                className='w-full min-h-[44px] py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-primary font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer'
                                            >
                                                <Calendar className='w-3.5 h-3.5 shrink-0' />
                                                <span>Reschedule</span>
                                            </button>
                                            <button
                                                onClick={() => cancelAppointment(item._id)}
                                                className='w-full min-h-[44px] py-2 px-2.5 rounded-xl border border-rose-200/80 bg-rose-50/40 text-rose-600 hover:bg-rose-50 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer'
                                            >
                                                <XCircle className='w-3.5 h-3.5 shrink-0' />
                                                <span>Cancel</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Native HTML <dialog> for Rescheduling Appointments */}
            <dialog
                ref={rescheduleDialogRef}
                aria-labelledby="reschedule-modal-title"
                className="fixed inset-x-0 bottom-0 sm:inset-auto m-0 mt-auto sm:m-auto w-full max-w-xl max-h-[85dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-0 backdrop:bg-slate-950/60 backdrop:backdrop-blur-xs shadow-2xl border border-slate-200/90 text-slate-900"
                onClick={(e) => {
                    if (e.target === rescheduleDialogRef.current && !rescheduling) closeRescheduleModal()
                }}
            >
                {rescheduleTarget && (
                    <div className='p-5 sm:p-7 space-y-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'>
                        <div className='sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 mb-2' />
                        {/* Modal Header */}
                        <div className='flex items-start justify-between gap-3 pb-4 border-b border-slate-100'>
                            <div className='flex items-center gap-3 min-w-0'>
                                <img
                                    src={rescheduleTarget.docData?.image}
                                    alt={rescheduleTarget.docData?.name}
                                    className='w-12 h-12 rounded-2xl object-cover bg-slate-100 border border-slate-200 shrink-0'
                                />
                                <div className='min-w-0'>
                                    <h3 id="reschedule-modal-title" className='text-base font-extrabold text-slate-900 truncate'>
                                        Reschedule Consultation Slot
                                    </h3>
                                    <p className='text-xs text-slate-500 break-words'>
                                        {rescheduleTarget.docData?.name} &bull; Current:{' '}
                                        <strong className='text-slate-700 font-mono'>
                                            {slotDateFormat(rescheduleTarget.slotDate)} at {rescheduleTarget.slotTime}
                                        </strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeRescheduleModal}
                                className='min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0'
                                aria-label="Close"
                            >
                                <X className='w-5 h-5' />
                            </button>
                        </div>

                        {/* Step 1: Select New Date */}
                        <div className='space-y-2'>
                            <p className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                                <Calendar className='w-3.5 h-3.5 text-primary' />
                                <span>1. Select New Date</span>
                            </p>
                            <div className='flex gap-2 overflow-x-auto pb-1 scrollbar-none'>
                                {rescheduleSlots.map((daySlots, idx) => {
                                    const dateObj = daySlots[0]?.datetime
                                    if (!dateObj) return null
                                    const selected = rescheduleDayIdx === idx
                                    const hasSlots = daySlots.length > 0

                                    return (
                                        <button
                                            key={idx}
                                            type='button'
                                            onClick={() => {
                                                setRescheduleDayIdx(idx)
                                                setRescheduleTime('')
                                            }}
                                            className={`flex flex-col items-center justify-center min-w-[72px] py-2.5 px-3 rounded-2xl border text-xs transition-all cursor-pointer ${
                                                selected
                                                    ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-xs'
                                                    : hasSlots
                                                    ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                    : 'bg-slate-50 text-slate-400 border-slate-200/60 opacity-50'
                                            }`}
                                        >
                                            <span className={`text-[10px] uppercase font-bold ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                                                {DAYS_OF_WEEK[dateObj.getDay()]}
                                            </span>
                                            <span className='text-base font-extrabold mt-0.5 font-mono tabular-nums'>{dateObj.getDate()}</span>
                                            <span className={`text-[10px] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                                                {MONTHS[dateObj.getMonth()]}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Step 2: Select Grouped Time Slot */}
                        <div className='space-y-3 pt-2 border-t border-slate-100'>
                            <div className='flex items-center justify-between'>
                                <p className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                                    <Clock className='w-3.5 h-3.5 text-primary' />
                                    <span>2. Select Time ({rescheduleSlots[rescheduleDayIdx]?.length || 0} slots open)</span>
                                </p>
                            </div>

                            {rescheduleSlots[rescheduleDayIdx]?.length === 0 ? (
                                <p className='text-xs text-slate-500 italic py-3'>No slots open on this date. Select another day above.</p>
                            ) : (
                                <div className='space-y-3 max-h-48 overflow-y-auto pr-1'>
                                    {/* Morning */}
                                    {rescheduleGroupedSlots.morning.length > 0 && (
                                        <div className='space-y-1.5'>
                                            <span className='text-[11px] font-bold text-slate-500 flex items-center gap-1'>
                                                <Sun className='w-3 h-3 text-amber-500' /> Morning
                                            </span>
                                            <div className='flex flex-wrap gap-2'>
                                                {rescheduleGroupedSlots.morning.map((slot, idx) => (
                                                    <button
                                                        key={idx}
                                                        type='button'
                                                        onClick={() => setRescheduleTime(slot.time)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums border transition-all cursor-pointer ${
                                                            rescheduleTime === slot.time
                                                                ? 'bg-primary text-white border-primary shadow-xs'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-primary'
                                                        }`}
                                                    >
                                                        {slot.time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Afternoon */}
                                    {rescheduleGroupedSlots.afternoon.length > 0 && (
                                        <div className='space-y-1.5'>
                                            <span className='text-[11px] font-bold text-slate-500 flex items-center gap-1'>
                                                <SunMedium className='w-3 h-3 text-orange-500' /> Afternoon
                                            </span>
                                            <div className='flex flex-wrap gap-2'>
                                                {rescheduleGroupedSlots.afternoon.map((slot, idx) => (
                                                    <button
                                                        key={idx}
                                                        type='button'
                                                        onClick={() => setRescheduleTime(slot.time)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums border transition-all cursor-pointer ${
                                                            rescheduleTime === slot.time
                                                                ? 'bg-primary text-white border-primary shadow-xs'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-primary'
                                                        }`}
                                                    >
                                                        {slot.time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Evening */}
                                    {rescheduleGroupedSlots.evening.length > 0 && (
                                        <div className='space-y-1.5'>
                                            <span className='text-[11px] font-bold text-slate-500 flex items-center gap-1'>
                                                <Moon className='w-3 h-3 text-indigo-500' /> Evening
                                            </span>
                                            <div className='flex flex-wrap gap-2'>
                                                {rescheduleGroupedSlots.evening.map((slot, idx) => (
                                                    <button
                                                        key={idx}
                                                        type='button'
                                                        onClick={() => setRescheduleTime(slot.time)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums border transition-all cursor-pointer ${
                                                            rescheduleTime === slot.time
                                                                ? 'bg-primary text-white border-primary shadow-xs'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-primary'
                                                        }`}
                                                    >
                                                        {slot.time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className='pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3'>
                            <p className='text-[11px] text-slate-400 text-center sm:text-left'>
                                Payment status and consultation history will remain intact.
                            </p>
                            <div className='grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full sm:w-auto'>
                                <button
                                    type='button'
                                    onClick={closeRescheduleModal}
                                    className='min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer'
                                >
                                    Cancel
                                </button>
                                <button
                                    type='button'
                                    disabled={!rescheduleTime || rescheduling}
                                    onClick={handleConfirmReschedule}
                                    className='min-h-[44px] px-5 py-2 rounded-xl bg-primary hover:bg-sky-600 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer'
                                >
                                    {rescheduling ? 'Updating...' : 'Confirm Slot'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </dialog>

            {/* Quick Chat Modal */}
            {activeChat && (
                <ChatWindow
                    appointmentId={activeChat.appointmentId}
                    doctorName={activeChat.doctorName}
                    doctorImage={activeChat.doctorImage}
                    onClose={() => setActiveChat(null)}
                />
            )}

            {/* Review Modal */}
            {reviewTarget && (
                <ReviewModal
                    appointmentId={reviewTarget.appointmentId}
                    doctorName={reviewTarget.doctorName}
                    onClose={() => setReviewTarget(null)}
                    onSubmitted={() => getUserAppointments()}
                />
            )}
        </div>
    )
}

export default MyAppointments