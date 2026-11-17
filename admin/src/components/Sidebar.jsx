import React, { useContext } from 'react'
import { NavLink } from 'react-router-dom'
import { DoctorContext } from '../context/DoctorContext'
import { AdminContext } from '../context/AdminContext'
import {
  LayoutDashboard,
  CalendarCheck,
  MessageSquare,
  UserCog,
  UserPlus,
  Users,
  Stethoscope,
  HeartHandshake,
  ShieldCheck
} from 'lucide-react'

const Sidebar = () => {
  const { dToken, unreadChatCount, appointments, profileData } = useContext(DoctorContext)
  const { aToken, appointments: adminAppointments, patients } = useContext(AdminContext)

  const upcomingDoctorVisits = Array.isArray(appointments)
    ? appointments.filter((a) => !a.cancelled && !a.isCompleted).length
    : 0

  const upcomingAdminVisits = Array.isArray(adminAppointments)
    ? adminAppointments.filter((a) => !a.cancelled && !a.isCompleted).length
    : 0

  const navItemClass = ({ isActive }) =>
    `group flex items-center justify-between gap-3 py-2.5 px-3 md:px-3.5 md:min-w-64 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
      isActive
        ? 'bg-sky-600 text-white shadow-xs shadow-sky-600/20 font-bold'
        : 'text-slate-600 hover:bg-slate-100/90 hover:text-slate-900'
    }`

  const mobileNavItemClass = ({ isActive }) =>
    `relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors min-w-0 flex-1 ${
      isActive ? 'text-sky-600 font-bold' : 'text-slate-500 hover:text-slate-800'
    }`

  return (
    <>
      <aside className='hidden md:flex sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto bg-white border-r border-slate-200/90 shrink-0 flex-col justify-between py-5 px-2.5 md:px-3.5 select-none z-20'>
      <div>
        {aToken && (
          <ul className='space-y-1'>
            <li className='px-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 hidden md:block'>
              Clinic Administration
            </li>

            <NavLink to={'/admin-dashboard'} className={navItemClass}>
              {({ isActive }) => (
                <div className='flex items-center gap-3'>
                  <LayoutDashboard className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                  <span className='hidden md:block'>Clinic overview</span>
                </div>
              )}
            </NavLink>

            <NavLink to={'/all-appointments'} className={navItemClass}>
              {({ isActive }) => (
                <>
                  <div className='flex items-center gap-3'>
                    <CalendarCheck className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                    <span className='hidden md:block'>All appointments</span>
                  </div>
                  {upcomingAdminVisits > 0 && (
                    <span
                      className={`hidden md:inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}
                    >
                      {upcomingAdminVisits} active
                    </span>
                  )}
                </>
              )}
            </NavLink>

            <NavLink to={'/doctor-list'} className={navItemClass}>
              {({ isActive }) => (
                <div className='flex items-center gap-3'>
                  <Stethoscope className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                  <span className='hidden md:block'>Manage doctors</span>
                </div>
              )}
            </NavLink>

            <NavLink to={'/add-doctor'} className={navItemClass}>
              {({ isActive }) => (
                <div className='flex items-center gap-3'>
                  <UserPlus className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                  <span className='hidden md:block'>Add new doctor</span>
                </div>
              )}
            </NavLink>

            <NavLink to={'/patients-list'} className={navItemClass}>
              {({ isActive }) => (
                <>
                  <div className='flex items-center gap-3'>
                    <Users className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                    <span className='hidden md:block'>Patients directory</span>
                  </div>
                  {Array.isArray(patients) && patients.length > 0 && (
                    <span
                      className={`hidden md:inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {patients.length}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </ul>
        )}

        {dToken && (
          <ul className='space-y-1'>
            <li className='px-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 hidden md:block'>
              Doctor Workspace
            </li>

            <NavLink to={'/doctor-dashboard'} className={navItemClass}>
              {({ isActive }) => (
                <div className='flex items-center gap-3'>
                  <LayoutDashboard className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                  <span className='hidden md:block'>Dashboard & today</span>
                </div>
              )}
            </NavLink>

            <NavLink to={'/doctor-appointments'} className={navItemClass}>
              {({ isActive }) => (
                <>
                  <div className='flex items-center gap-3'>
                    <CalendarCheck className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                    <span className='hidden md:block'>Patient appointments</span>
                  </div>
                  {upcomingDoctorVisits > 0 && (
                    <span
                      className={`hidden md:inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                      title='Upcoming Visits'
                    >
                      {upcomingDoctorVisits}
                    </span>
                  )}
                </>
              )}
            </NavLink>

            <NavLink to={'/doctor-chat'} className={navItemClass}>
              {({ isActive }) => (
                <>
                  <div className='flex items-center gap-3'>
                    <MessageSquare className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                    <span className='hidden md:block'>Patient messages</span>
                  </div>
                  {unreadChatCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                        isActive ? 'bg-white text-sky-700' : 'bg-sky-600 text-white shadow-2xs'
                      }`}
                    >
                      {unreadChatCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>

            <NavLink to={'/doctor-profile'} className={navItemClass}>
              {({ isActive }) => (
                <div className='flex items-center gap-3'>
                  <UserCog className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}`} />
                  <span className='hidden md:block'>My profile & fees</span>
                </div>
              )}
            </NavLink>
          </ul>
        )}
      </div>

      {/* Admin Identity Card at bottom of sidebar */}
      {aToken && (
        <div className='hidden md:block mt-6 pt-4 border-t border-slate-100'>
          <div className='p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs'>
              <ShieldCheck className='w-5 h-5 text-emerald-400' />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='text-xs font-bold text-slate-900 truncate'>System Administrator</p>
              <p className='text-[11px] text-slate-500 truncate'>VitalSync Clinic Operations</p>
              <div className='mt-1 flex items-center gap-1.5'>
                <span className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse' />
                <span className='text-[10.5px] font-medium text-slate-600'>Full access active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Identity Card at bottom of sidebar */}
      {dToken && (
        <div className='hidden md:block mt-auto pt-4 border-t border-slate-100'>
          <div className='p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3'>
            <img
              src={profileData?.image || ''}
              alt={profileData?.name || 'Doctor'}
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData?.name || 'Doctor')}&background=0284c7&color=fff&bold=true`
              }}
              className='w-10 h-10 rounded-xl object-cover bg-sky-100 border border-slate-200 shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <p className='text-xs font-bold text-slate-900 truncate'>{profileData?.name || 'Practitioner'}</p>
              <p className='text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5'>
                <Stethoscope className='w-3 h-3 text-sky-600 shrink-0' />
                <span>{profileData?.speciality || 'General Medicine'}</span>
              </p>
              <div className='mt-1.5 flex items-center gap-1.5'>
                <span
                  className={`w-2 h-2 rounded-full ${
                    profileData?.available ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className='text-[10px] font-semibold text-slate-600'>
                  {profileData?.available ? 'Accepting bookings' : 'Bookings paused'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label='Mobile navigation'
        className='md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around py-1.5 px-1 shadow-lg select-none'
      >
        {aToken && (
          <>
            <NavLink to={'/admin-dashboard'} className={mobileNavItemClass}>
              <LayoutDashboard className='w-4 h-4 shrink-0' />
              <span className='truncate'>Overview</span>
            </NavLink>
            <NavLink to={'/all-appointments'} className={mobileNavItemClass}>
              <CalendarCheck className='w-4 h-4 shrink-0' />
              <span className='truncate'>Visits</span>
              {upcomingAdminVisits > 0 && (
                <span className='absolute top-0.5 right-2 px-1 rounded-full bg-sky-600 text-white text-[9px] font-bold leading-tight'>
                  {upcomingAdminVisits}
                </span>
              )}
            </NavLink>
            <NavLink to={'/doctor-list'} className={mobileNavItemClass}>
              <Stethoscope className='w-4 h-4 shrink-0' />
              <span className='truncate'>Doctors</span>
            </NavLink>
            <NavLink to={'/add-doctor'} className={mobileNavItemClass}>
              <UserPlus className='w-4 h-4 shrink-0' />
              <span className='truncate'>Add</span>
            </NavLink>
            <NavLink to={'/patients-list'} className={mobileNavItemClass}>
              <Users className='w-4 h-4 shrink-0' />
              <span className='truncate'>Patients</span>
            </NavLink>
          </>
        )}

        {dToken && (
          <>
            <NavLink to={'/doctor-dashboard'} className={mobileNavItemClass}>
              <LayoutDashboard className='w-4 h-4 shrink-0' />
              <span className='truncate'>Home</span>
            </NavLink>
            <NavLink to={'/doctor-appointments'} className={mobileNavItemClass}>
              <CalendarCheck className='w-4 h-4 shrink-0' />
              <span className='truncate'>Visits</span>
              {upcomingDoctorVisits > 0 && (
                <span className='absolute top-0.5 right-3 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-tight'>
                  {upcomingDoctorVisits}
                </span>
              )}
            </NavLink>
            <NavLink to={'/doctor-chat'} className={mobileNavItemClass}>
              <MessageSquare className='w-4 h-4 shrink-0' />
              <span className='truncate'>Messages</span>
              {unreadChatCount > 0 && (
                <span className='absolute top-0.5 right-3 px-1 rounded-full bg-sky-600 text-white text-[9px] font-bold leading-tight'>
                  {unreadChatCount}
                </span>
              )}
            </NavLink>
            <NavLink to={'/doctor-profile'} className={mobileNavItemClass}>
              <UserCog className='w-4 h-4 shrink-0' />
              <span className='truncate'>Profile</span>
            </NavLink>
          </>
        )}
      </nav>
    </>
  )
}

export default Sidebar
